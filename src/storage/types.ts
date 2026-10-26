import type { Puzzle, PuzzleSummary } from '../types/puzzle'

/**
 * Persistence contract for puzzles. Everything is async so a server-backed adapter can
 * replace the localStorage one without any change to callers.
 */
export interface PuzzleStore {
  list(): Promise<PuzzleSummary[]>
  get(id: string): Promise<Puzzle | null>
  save(puzzle: Puzzle): Promise<void>
  remove(id: string): Promise<void>
}
