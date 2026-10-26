import type { Puzzle } from '../types/puzzle'
import { clampSize, createGrid } from './grid'
import { newId } from './id'

export interface NewPuzzleOptions {
  title: string
  author?: string
  rows: number
  cols: number
  symmetry: boolean
}

export function createPuzzle(options: NewPuzzleOptions): Puzzle {
  const rows = clampSize(options.rows)
  const cols = clampSize(options.cols)
  const now = new Date().toISOString()

  return {
    id: newId(),
    title: options.title.trim() || 'Untitled puzzle',
    author: options.author?.trim() ?? '',
    rows,
    cols,
    symmetry: options.symmetry,
    grid: createGrid(rows, cols),
    clues: {},
    createdAt: now,
    updatedAt: now,
  }
}

/** A copy under a new id, so duplicating never aliases the original's storage key. */
export function duplicatePuzzle(puzzle: Puzzle): Puzzle {
  const now = new Date().toISOString()
  return {
    ...puzzle,
    id: newId(),
    title: `${puzzle.title} (copy)`,
    grid: puzzle.grid.map((cell) => ({ ...cell })),
    clues: { ...puzzle.clues },
    createdAt: now,
    updatedAt: now,
  }
}
