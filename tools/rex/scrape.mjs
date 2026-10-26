#!/usr/bin/env node
/**
 * Harvest crossword clue/answer pairs from the Rex Parker blog archive.
 *
 * Reads the Blogger JSON feed (allowed by the site's robots.txt — only /search and
 * /share-widget are disallowed) in pages of 50 posts, extracts pairs with ./parse.mjs, and
 * writes a corpus to ./data.
 *
 *   node tools/rex/scrape.mjs                  # whole archive (~7,400 posts)
 *   node tools/rex/scrape.mjs --limit 200      # first 200 posts, for a quick look
 *   node tools/rex/scrape.mjs --delay 2000     # be gentler
 *   node tools/rex/scrape.mjs --resume         # continue from the last checkpoint
 *
 * Output (in --out, default ./data):
 *   clues.jsonl    one {answer, clue, number, dir, date, url} per line
 *   wordlist.txt   ANSWER<TAB>count, most frequent first
 *   summary.json   run statistics
 *   .checkpoint    resume state
 */

import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { extractPairs } from './parse.mjs'

/*
 * Node's built-in fetch ignores http_proxy/https_proxy unless NODE_USE_ENV_PROXY is set, so
 * behind a corporate proxy every request fails with ETIMEDOUT. Re-exec once with the flag on
 * rather than making the caller remember it.
 */
const proxy = process.env.https_proxy ?? process.env.HTTPS_PROXY
if (proxy && process.env.NODE_USE_ENV_PROXY !== '1') {
  const result = spawnSync(process.execPath, [...process.argv.slice(1)], {
    stdio: 'inherit',
    env: { ...process.env, NODE_USE_ENV_PROXY: '1' },
  })
  process.exit(result.status ?? 1)
}

const FEED = 'https://rexwordpuzzle.blogspot.com/feeds/posts/default'
const PAGE_SIZE = 50
const USER_AGENT =
  'cruciver-corpus/0.1 (personal crossword-construction word list; contact: local user)'

const USAGE = `
Harvest crossword clue/answer pairs from the Rex Parker blog archive.

  node tools/rex/scrape.mjs [options]

  --limit N     stop after N posts        (default: all, ~7,400)
  --delay MS    pause between requests    (default: 1200)
  --out DIR     output directory          (default: data)
  --retries N   retries per request       (default: 3)
  --resume      continue from the last checkpoint
`.trim()

function parseArgs(argv) {
  const args = { limit: Infinity, delay: 1200, out: 'data', resume: false, retries: 3 }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    const value = argv[i + 1]
    switch (flag) {
      case '--limit':
        args.limit = Number(value)
        i++
        break
      case '--delay':
        args.delay = Number(value)
        i++
        break
      case '--out':
        args.out = String(value)
        i++
        break
      case '--retries':
        args.retries = Number(value)
        i++
        break
      case '--resume':
        args.resume = true
        break
      case '--help':
      case '-h':
        console.log(USAGE)
        process.exit(0)
        break
      default:
        if (flag.startsWith('--')) throw new Error(`Unknown flag: ${flag}`)
    }
  }
  return args
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Fetch one page of the feed, retrying with exponential backoff on transient failures. */
async function fetchPage(startIndex, { retries, delay }) {
  const url = `${FEED}?alt=json&max-results=${PAGE_SIZE}&start-index=${startIndex}`

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      })
      if (response.status === 429 || response.status >= 500) {
        throw new Error(`HTTP ${response.status}`)
      }
      if (!response.ok) throw new Error(`HTTP ${response.status} (not retryable)`)
      return await response.json()
    } catch (error) {
      if (attempt === retries) throw error
      const backoff = delay * 2 ** attempt
      console.warn(`  ! ${error.message} — retrying in ${backoff}ms`)
      await sleep(backoff)
    }
  }
  throw new Error('unreachable')
}

function postUrl(entry) {
  return entry.link?.find((l) => l.rel === 'alternate')?.href ?? ''
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  await mkdir(args.out, { recursive: true })

  const cluesPath = join(args.out, 'clues.jsonl')
  const checkpointPath = join(args.out, '.checkpoint')

  let startIndex = 1
  let posts = 0
  let pairs = 0

  if (args.resume && existsSync(checkpointPath)) {
    const saved = JSON.parse(await readFile(checkpointPath, 'utf8'))
    startIndex = saved.startIndex
    posts = saved.posts
    pairs = saved.pairs
    console.log(`Resuming at post ${startIndex} (${pairs} pairs so far)`)
  } else {
    await writeFile(cluesPath, '')
  }

  let total = Infinity
  const started = Date.now()

  while (posts < args.limit && startIndex <= total) {
    const feed = await fetchPage(startIndex, args)
    total = Math.min(Number(feed.feed.openSearch$totalResults?.$t ?? 0), Infinity)
    const entries = feed.feed.entry ?? []
    if (entries.length === 0) break

    const lines = []
    for (const entry of entries) {
      if (posts >= args.limit) break
      const date = (entry.published?.$t ?? '').slice(0, 10)
      const url = postUrl(entry)

      for (const pair of extractPairs(entry.content?.$t ?? '')) {
        lines.push(JSON.stringify({ ...pair, date, url }))
      }
      posts++
    }

    if (lines.length > 0) await appendFile(cluesPath, lines.join('\n') + '\n')
    pairs += lines.length
    startIndex += entries.length

    await writeFile(checkpointPath, JSON.stringify({ startIndex, posts, pairs }))

    const pct = total === Infinity ? '?' : Math.round((posts / Math.min(total, args.limit)) * 100)
    console.log(
      `  ${posts} posts / ${pairs} pairs  (${pct}%)  ${((Date.now() - started) / 1000).toFixed(0)}s`,
    )

    if (posts < args.limit && startIndex <= total) await sleep(args.delay)
  }

  await buildDerived(args.out, cluesPath, { posts, pairs, seconds: (Date.now() - started) / 1000 })
}

/** Roll the raw pairs up into a frequency-ranked word list and a summary. */
async function buildDerived(out, cluesPath, run) {
  const text = await readFile(cluesPath, 'utf8')
  const records = text
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))

  const counts = new Map()
  const cluesPerAnswer = new Map()
  for (const record of records) {
    counts.set(record.answer, (counts.get(record.answer) ?? 0) + 1)
    const set = cluesPerAnswer.get(record.answer) ?? new Set()
    set.add(record.clue)
    cluesPerAnswer.set(record.answer, set)
  }

  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  await writeFile(join(out, 'wordlist.txt'), ranked.map(([w, n]) => `${w}\t${n}`).join('\n') + '\n')

  const lengths = {}
  for (const [word] of ranked) lengths[word.length] = (lengths[word.length] ?? 0) + 1

  const summary = {
    generatedAt: new Date().toISOString(),
    source: 'https://rexwordpuzzle.blogspot.com/ (Blogger JSON feed)',
    postsScanned: run.posts,
    pairsExtracted: records.length,
    uniqueAnswers: ranked.length,
    answersWithMultipleClues: [...cluesPerAnswer.values()].filter((s) => s.size > 1).length,
    pairsPerPost: run.posts ? Number((records.length / run.posts).toFixed(1)) : 0,
    answerLengthHistogram: lengths,
    mostCommon: ranked.slice(0, 25).map(([word, n]) => ({ word, n })),
    runSeconds: Number(run.seconds.toFixed(0)),
  }
  await writeFile(join(out, 'summary.json'), JSON.stringify(summary, null, 2) + '\n')

  console.log(
    `\nDone: ${records.length} pairs, ${ranked.length} unique answers from ${run.posts} posts.`,
  )
  console.log(`  ${join(out, 'clues.jsonl')}\n  ${join(out, 'wordlist.txt')}\n  ${join(out, 'summary.json')}`)
}

main().catch((error) => {
  console.error('Scrape failed:', error.message)
  process.exitCode = 1
})
