import type { Puzzle, PuzzleSummary } from '../types/puzzle'
import { computeNumbering, completionRatio } from '../lib/slots'
import type { PuzzleStore } from './types'

const INDEX_KEY = 'cruciver:index'
const puzzleKey = (id: string) => `cruciver:puzzle:${id}`

/**
 * The index holds one summary per puzzle so the home screen can render without parsing
 * every full grid. It is rewritten on each save.
 */
function readIndex(): PuzzleSummary[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as PuzzleSummary[]) : []
  } catch {
    return []
  }
}

function writeIndex(entries: PuzzleSummary[]): void {
  localStorage.setItem(INDEX_KEY, JSON.stringify(entries))
}

export function summarize(puzzle: Puzzle): PuzzleSummary {
  const numbering = computeNumbering(puzzle)
  return {
    id: puzzle.id,
    title: puzzle.title,
    author: puzzle.author,
    rows: puzzle.rows,
    cols: puzzle.cols,
    createdAt: puzzle.createdAt,
    updatedAt: puzzle.updatedAt,
    progress: completionRatio(numbering),
    blocks: puzzle.grid.map((c) => c.block),
  }
}

export const localStorageStore: PuzzleStore = {
  async list() {
    return readIndex().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  },

  async get(id) {
    try {
      const raw = localStorage.getItem(puzzleKey(id))
      return raw ? (JSON.parse(raw) as Puzzle) : null
    } catch {
      return null
    }
  },

  async save(puzzle) {
    localStorage.setItem(puzzleKey(puzzle.id), JSON.stringify(puzzle))
    const entries = readIndex().filter((e) => e.id !== puzzle.id)
    entries.push(summarize(puzzle))
    writeIndex(entries)
  },

  async remove(id) {
    localStorage.removeItem(puzzleKey(id))
    writeIndex(readIndex().filter((e) => e.id !== id))
  },
}
