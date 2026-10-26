#!/usr/bin/env node
/**
 * Build the scored word list the editor's fill suggestions search.
 *
 * Merges a base list in the common `WORD;score` format with the Rex Parker corpus, which
 * contributes how many times each entry has been seen in the NYT puzzle (it does not add
 * entries — its answers include themer wordplay and accent-stripped junk like ESPAOL).
 *
 *   node tools/wordlist/build.mjs
 *   node tools/wordlist/build.mjs --base my-list.dict --out public/wordlist.txt
 *
 * Output: one `WORD;score` or `WORD;score;seen` per line, grouped by length and best first.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname } from 'node:path'

/** Entries outside these bounds can never fit a grid (see MIN_ENTRY_LENGTH / MAX_SIZE). */
const MIN_LENGTH = 3
const MAX_LENGTH = 25

const CWL_URL =
  'https://raw.githubusercontent.com/Crossword-Nexus/collaborative-word-list/main/xwordlist.dict'

const USAGE = `
Build the scored word list used for fill suggestions.

  node tools/wordlist/build.mjs [options]

  --base FILE   WORD;score list           (default: data/sources/cwl/xwordlist.dict)
  --seen FILE   Rex corpus WORD<TAB>count (default: data/wordlist.txt, skipped if absent)
  --out FILE    output                    (default: public/wordlist.txt)

The default base is the Collaborative Word List (MIT):
  mkdir -p data/sources/cwl && curl -L -o data/sources/cwl/xwordlist.dict ${CWL_URL}
`.trim()

function parseArgs(argv) {
  const args = {
    base: 'data/sources/cwl/xwordlist.dict',
    seen: 'data/wordlist.txt',
    out: 'public/wordlist.txt',
  }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    const value = argv[i + 1]
    switch (flag) {
      case '--base':
      case '--seen':
      case '--out':
        args[flag.slice(2)] = String(value)
        i++
        break
      case '--help':
      case '-h':
        console.log(USAGE)
        process.exit(0)
        break
      default:
        throw new Error(`Unknown argument: ${flag}`)
    }
  }
  return args
}

/** Uppercase and validate an entry; null when it can't go in a grid. */
function normalize(raw) {
  const word = raw.trim().toUpperCase()
  if (!/^[A-Z0-9]+$/.test(word)) return null
  if (word.length < MIN_LENGTH || word.length > MAX_LENGTH) return null
  return word
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  if (!existsSync(args.base)) {
    console.error(`Base list not found: ${args.base}\n\n${USAGE}`)
    process.exit(1)
  }

  /** word -> score. A word listed twice (e.g. differing only in case) keeps its best score. */
  const scores = new Map()
  let skipped = 0
  for (const line of (await readFile(args.base, 'utf8')).split(/\r?\n/)) {
    if (!line.trim()) continue
    const [raw = '', rawScore = ''] = line.split(';')
    const word = normalize(raw)
    const score = Number(rawScore)
    if (!word || !Number.isFinite(score)) {
      skipped++
      continue
    }
    const clamped = Math.max(0, Math.min(100, Math.round(score)))
    scores.set(word, Math.max(scores.get(word) ?? 0, clamped))
  }

  const seen = new Map()
  if (existsSync(args.seen)) {
    for (const line of (await readFile(args.seen, 'utf8')).split(/\r?\n/)) {
      const [word = '', count = ''] = line.split('\t')
      if (scores.has(word)) seen.set(word, Number(count))
    }
  } else {
    console.warn(`No Rex corpus at ${args.seen} — building without seen-in-NYT counts.`)
  }

  const ranked = [...scores.entries()].sort(
    ([a, sa], [b, sb]) => a.length - b.length || sb - sa || (a < b ? -1 : 1),
  )
  const lines = ranked.map(([word, score]) => {
    const n = seen.get(word)
    return n ? `${word};${score};${n}` : `${word};${score}`
  })

  await mkdir(dirname(args.out), { recursive: true })
  await writeFile(args.out, lines.join('\n') + '\n')

  console.log(
    `${ranked.length.toLocaleString()} entries (${skipped.toLocaleString()} skipped), ` +
      `${seen.size.toLocaleString()} with NYT counts → ${args.out}`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
