import { localStorageStore } from './localStorageStore'
import type { PuzzleStore } from './types'

/**
 * The single place the app reaches for persistence. Swap this binding for a server-backed
 * adapter (same `PuzzleStore` interface) and nothing else needs to change.
 */
export const store: PuzzleStore = localStorageStore

export type { PuzzleStore } from './types'
export { summarize } from './localStorageStore'
export { exportPuzzle, parsePuzzle } from './transfer'
