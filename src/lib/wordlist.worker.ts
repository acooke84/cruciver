/**
 * The word engine: fetches and indexes the word list off the main thread — parsing half a
 * million entries takes about a second — and runs autofill searches against it.
 *
 * The page gets its own copy of the index for instant suggestions; this worker keeps one too,
 * so a long search never blocks typing. Searches run in short slices so progress can be
 * reported and a cancel message can get in between them.
 *
 * The user's own words (score overrides, additions, bans) are applied when the index is
 * built. When they change, the worker rebuilds from the parsed base it keeps and sends the
 * page a fresh copy; later searches use the new index.
 */
import type { Puzzle } from '../types/puzzle'
import { FillSearch, type FillOutcome } from './autofill'
import {
  parseEntries,
  WordList,
  type WordInfo,
  type WordListData,
  type WordOverrides,
} from './wordlist'

export type EngineRequest =
  | { type: 'load'; url: string; overrides: WordOverrides }
  /** The user's words changed: rebuild the list and answer with `ready` again. */
  | { type: 'overrides'; overrides: WordOverrides }
  | {
      type: 'fill'
      id: number
      puzzle: Puzzle
      minScore: number
      seed: number
      timeLimitMs: number
      region?: number[]
    }
  | { type: 'cancel'; id: number }

export type EngineResponse =
  /**
   * The list with the user's overrides applied. `baseScores` has the base list's score for
   * each overridden entry it contains, so the UI can show what an override replaced.
   */
  | { type: 'ready'; data: WordListData; baseScores: Record<string, number> }
  | { type: 'missing' }
  | { type: 'error'; message: string }
  | { type: 'fill-progress'; id: number; steps: number }
  /** `outcome` is null when the search was cancelled or ran out of time. */
  | { type: 'fill-result'; id: number; outcome: FillOutcome | null; timedOut: boolean; elapsedMs: number }

/** Work per slice before yielding to the message queue. */
const SLICE_MS = 40
const PROGRESS_EVERY_MS = 150

/** The parsed base list, kept so changed overrides can be applied without re-fetching. */
let base: Map<string, WordInfo> | null = null
let overrides: WordOverrides = {}
let list: WordList | null = null
/** Id of the search that should keep running; anything else stops at its next slice. */
let active: number | null = null

const reply = (message: EngineResponse) => postMessage(message)
const yieldToMessages = () => new Promise((resolve) => setTimeout(resolve, 0))

async function load(url: string) {
  try {
    const response = await fetch(url)
    // The dev server answers unknown paths with index.html rather than a 404.
    const isHtml = response.headers.get('content-type')?.includes('text/html')
    if (response.status === 404 || isHtml) return reply({ type: 'missing' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    base = parseEntries(await response.text())
    rebuild()
  } catch (error) {
    reply({ type: 'error', message: error instanceof Error ? error.message : String(error) })
  }
}

/** Apply the current overrides to the base list and send the page its copy. */
function rebuild() {
  if (!base) return
  list = WordList.withOverrides(base, overrides)
  const baseScores: Record<string, number> = {}
  for (const word of Object.keys(overrides)) {
    const entry = base.get(word)
    if (entry) baseScores[word] = entry.score
  }
  // Copied, not transferred: this worker keeps its own index for autofill.
  reply({ type: 'ready', data: list.toData().data, baseScores })
}

async function fill(request: Extract<EngineRequest, { type: 'fill' }>) {
  const { id } = request
  const started = performance.now()
  const finish = (outcome: FillOutcome | null, timedOut = false) =>
    reply({ type: 'fill-result', id, outcome, timedOut, elapsedMs: performance.now() - started })

  if (!list) return finish(null)
  active = id
  const search = new FillSearch(list, request.puzzle, {
    minScore: request.minScore,
    seed: request.seed,
    maxSteps: Infinity,
    region: request.region,
  })

  let lastProgress = started
  for (;;) {
    const sliceEnd = performance.now() + SLICE_MS
    while (performance.now() < sliceEnd) {
      const outcome = search.run(20)
      if (outcome) {
        if (active === id) active = null
        return finish(outcome)
      }
    }

    const now = performance.now()
    if (now - started > request.timeLimitMs) {
      if (active === id) active = null
      return finish(null, true)
    }
    if (now - lastProgress > PROGRESS_EVERY_MS) {
      reply({ type: 'fill-progress', id, steps: search.progress })
      lastProgress = now
    }

    await yieldToMessages()
    if (active !== id) return finish(null)
  }
}

onmessage = (event: MessageEvent<EngineRequest>) => {
  const request = event.data
  if (request.type === 'load') {
    overrides = request.overrides
    void load(request.url)
  } else if (request.type === 'overrides') {
    // Before the list arrives this just updates what `load` will apply.
    overrides = request.overrides
    rebuild()
  } else if (request.type === 'fill') {
    void fill(request)
  } else if (request.type === 'cancel' && active === request.id) {
    active = null
  }
}
