import { useSyncExternalStore } from 'react'
import type { Puzzle } from '../types/puzzle'
import type { FillOutcome } from '../lib/autofill'
import { WordList } from '../lib/wordlist'
import type { EngineRequest, EngineResponse } from '../lib/wordlist.worker'
import { getWordOverrides, subscribeWordOverrides } from './useWordOverrides'

export type WordListState =
  | { status: 'loading' }
  | {
      status: 'ready'
      /** The list with the user's own words applied. */
      list: WordList
      /** The base list's score for each overridden entry it has, before the override. */
      baseScores: Readonly<Record<string, number>>
      /** True while a rebuild for changed overrides is under way; `list` is the previous one. */
      updating: boolean
    }
  /** No `wordlist.txt` has been built yet. */
  | { status: 'missing' }
  | { status: 'error'; message: string }

export interface AutofillResult {
  /** Null when the search was stopped or ran out of time. */
  outcome: FillOutcome | null
  timedOut: boolean
  elapsedMs: number
}

export interface AutofillRun {
  result: Promise<AutofillResult>
  cancel(): void
}

/*
 * One engine worker for the whole app, started the first time anything asks for the word list
 * and kept for the life of the page — reopening a puzzle shouldn't rebuild a 500k-entry index,
 * and autofill needs the worker's own copy.
 */
let state: WordListState = { status: 'loading' }
let worker: Worker | null = null
const listeners = new Set<() => void>()
/** Rebuilds asked of the engine that haven't come back yet. */
let rebuilding = 0
let overridesTimer: ReturnType<typeof setTimeout> | undefined

/** Let a burst of edits settle before asking for a rebuild — each one takes about a second. */
const OVERRIDES_DEBOUNCE_MS = 300

let nextFillId = 1
const fills = new Map<number, { resolve: (r: AutofillResult) => void; onProgress: (steps: number) => void }>()

function send(request: EngineRequest) {
  worker?.postMessage(request)
}

function setState(next: WordListState) {
  state = next
  for (const listener of listeners) listener()
}

function start() {
  worker = new Worker(new URL('../lib/wordlist.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (event: MessageEvent<EngineResponse>) => {
    const message = event.data
    switch (message.type) {
      case 'ready':
        rebuilding = Math.max(0, rebuilding - 1)
        setState({
          status: 'ready',
          list: WordList.fromData(message.data),
          baseScores: message.baseScores,
          updating: rebuilding > 0,
        })
        break
      case 'missing':
        setState({ status: 'missing' })
        break
      case 'error':
        setState({ status: 'error', message: message.message })
        break
      case 'fill-progress':
        fills.get(message.id)?.onProgress(message.steps)
        break
      case 'fill-result': {
        const pending = fills.get(message.id)
        fills.delete(message.id)
        pending?.resolve(message)
        break
      }
    }
  }
  send({
    type: 'load',
    url: new URL('wordlist.txt', document.baseURI).href,
    overrides: getWordOverrides(),
  })
  subscribeWordOverrides(() => {
    clearTimeout(overridesTimer)
    overridesTimer = setTimeout(sendOverrides, OVERRIDES_DEBOUNCE_MS)
  })
}

/**
 * Hand the engine the user's current words. Until its new list arrives, suggestions keep
 * using the old one, flagged as updating. Before the first list arrives there's nothing to
 * flag: the load picks up the latest overrides itself.
 */
function sendOverrides() {
  send({ type: 'overrides', overrides: getWordOverrides() })
  if (state.status === 'ready') {
    rebuilding++
    if (!state.updating) setState({ ...state, updating: true })
  }
}

function subscribe(listener: () => void) {
  if (!worker) start()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useWordList(): WordListState {
  return useSyncExternalStore(subscribe, () => state)
}

/**
 * Search for a fill in the engine worker. Typed letters stay put; pencilled ones may be
 * replaced. With a `region`, only those squares are filled and everything else, pencil
 * included, is held fixed. Resolves with the outcome, or a null outcome if cancelled or out
 * of time.
 */
export function startAutofill(
  puzzle: Puzzle,
  options: { minScore: number; seed: number; timeLimitMs: number; region?: number[] },
  onProgress: (steps: number) => void,
): AutofillRun {
  const id = nextFillId++
  const result = new Promise<AutofillResult>((resolve) => {
    fills.set(id, { resolve, onProgress })
  })
  send({ type: 'fill', id, puzzle, ...options })
  return { result, cancel: () => send({ type: 'cancel', id }) }
}
