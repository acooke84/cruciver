import type { Cell, Puzzle } from '../types/puzzle'
import { createGrid, normalizeCellText } from '../lib/grid'
import { newId } from '../lib/id'

export function exportPuzzle(puzzle: Puzzle): void {
  const blob = new Blob([JSON.stringify(puzzle, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const slug = puzzle.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'puzzle'

  link.href = url
  link.download = `${slug}.cruciver.json`
  link.click()
  URL.revokeObjectURL(url)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Validate untrusted JSON into a Puzzle, repairing what can be repaired and rejecting what
 * cannot. Always assigns a fresh id so importing never overwrites an existing puzzle.
 */
export function parsePuzzle(text: string): Puzzle {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('That file is not valid JSON.')
  }

  if (!isRecord(raw)) throw new Error('That file does not contain a puzzle.')

  const rows = Number(raw.rows)
  const cols = Number(raw.cols)
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) {
    throw new Error('Puzzle is missing valid grid dimensions.')
  }

  const grid: Cell[] = createGrid(rows, cols)
  if (Array.isArray(raw.grid)) {
    for (let i = 0; i < Math.min(grid.length, raw.grid.length); i++) {
      const cell: unknown = raw.grid[i]
      if (!isRecord(cell)) continue
      const letter = typeof cell.letter === 'string' ? normalizeCellText(cell.letter) : ''
      if (cell.block === true) {
        grid[i] = { block: true, letter: '' }
      } else {
        grid[i] = { block: false, letter }
        // The flags only mean something on a filled square.
        if (letter && cell.locked === true) grid[i] = { block: false, letter, locked: true }
        else if (letter && cell.pencil === true) grid[i] = { block: false, letter, pencil: true }
      }
    }
  }

  const clues: Record<string, string> = {}
  if (isRecord(raw.clues)) {
    for (const [key, value] of Object.entries(raw.clues)) {
      if (typeof value === 'string' && /^[AD]:\d+,\d+$/.test(key)) clues[key] = value
    }
  }

  const now = new Date().toISOString()
  return {
    id: newId(),
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title : 'Imported puzzle',
    author: typeof raw.author === 'string' ? raw.author : '',
    rows,
    cols,
    symmetry: raw.symmetry !== false,
    grid,
    clues,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: now,
  }
}
