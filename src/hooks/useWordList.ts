import { useSyncExternalStore } from 'react'
import type { Puzzle } from '../types/puzzle'
import type { FillOutcome } from '../lib/autofill'
import { WordList } from '../lib/wordlist'
import type { EngineRequest, EngineResponse } from '../lib/wordlist.worker'

export type WordListState =
  | { status: 'loading' }
  | { status: 'ready'; list: WordList }
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
        setState({ status: 'ready', list: WordList.fromData(message.data) })
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
  send({ type: 'load', url: new URL('wordlist.txt', document.baseURI).href })
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
 * replaced. Resolves with the outcome, or a null outcome if cancelled or out of time.
 */
export function startAutofill(
  puzzle: Puzzle,
  options: { minScore: number; seed: number; timeLimitMs: number },
  onProgress: (steps: number) => void,
): AutofillRun {
  const id = nextFillId++
  const result = new Promise<AutofillResult>((resolve) => {
    fills.set(id, { resolve, onProgress })
  })
  send({ type: 'fill', id, puzzle, ...options })
  return { result, cancel: () => send({ type: 'cancel', id }) }
}
