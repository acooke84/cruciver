import type { Numbering, Problem, Puzzle } from '../types/puzzle'
import { colOf, idx, isSymmetric, rowOf } from './grid'

export const MIN_ENTRY_LENGTH = 3

function label(number: number, dir: 'A' | 'D'): string {
  return `${number}-${dir === 'A' ? 'Across' : 'Down'}`
}

/** Every white cell reachable from `start` by orthogonal steps. */
function floodFill(puzzle: Puzzle, start: number, seen: Set<number>): void {
  const stack = [start]
  while (stack.length > 0) {
    const current = stack.pop()
    if (current === undefined || seen.has(current)) continue
    seen.add(current)

    const r = rowOf(current, puzzle.cols)
    const c = colOf(current, puzzle.cols)
    const neighbours = [
      [r - 1, c],
      [r + 1, c],
      [r, c - 1],
      [r, c + 1],
    ]
    for (const [nr, nc] of neighbours) {
      if (nr === undefined || nc === undefined) continue
      if (nr < 0 || nc < 0 || nr >= puzzle.rows || nc >= puzzle.cols) continue
      const ni = idx(nr, nc, puzzle.cols)
      if (!seen.has(ni) && puzzle.grid[ni]?.block === false) stack.push(ni)
    }
  }
}

/** Number of separate white regions in the grid. */
export function countRegions(puzzle: Puzzle): number {
  const seen = new Set<number>()
  let regions = 0
  for (let i = 0; i < puzzle.grid.length; i++) {
    if (puzzle.grid[i]?.block !== false || seen.has(i)) continue
    floodFill(puzzle, i, seen)
    regions++
  }
  return regions
}

/**
 * Collect everything wrong with the puzzle.
 *
 * `error` covers structural defects that make the grid invalid as a crossword; `warning`
 * covers content that is merely unfinished.
 */
export function analyze(puzzle: Puzzle, numbering: Numbering): Problem[] {
  const problems: Problem[] = []

  // --- Structure ---
  if (puzzle.symmetry && !isSymmetric(puzzle)) {
    problems.push({
      severity: 'error',
      message: 'Grid is not rotationally symmetric, but symmetry is switched on.',
    })
  }

  for (const slot of numbering.slots) {
    if (slot.length < MIN_ENTRY_LENGTH) {
      problems.push({
        severity: 'error',
        message: `${label(slot.number, slot.dir)} is only ${slot.length} letters long (minimum ${MIN_ENTRY_LENGTH}).`,
        slotKey: slot.key,
      })
    }
  }

  for (let i = 0; i < puzzle.grid.length; i++) {
    if (puzzle.grid[i]?.block !== false) continue
    const through = numbering.byCell.get(i) ?? []
    const r = rowOf(i, puzzle.cols) + 1
    const c = colOf(i, puzzle.cols) + 1

    if (through.length === 0) {
      problems.push({
        severity: 'error',
        message: `Square at row ${r}, column ${c} is isolated — it belongs to no entry.`,
        cellIndex: i,
      })
    } else if (through.length === 1) {
      const only = through[0]?.dir === 'A' ? 'Across' : 'Down'
      problems.push({
        severity: 'error',
        message: `Square at row ${r}, column ${c} is unchecked — it only appears in an ${only} entry.`,
        cellIndex: i,
      })
    }
  }

  const regions = countRegions(puzzle)
  if (regions > 1) {
    problems.push({
      severity: 'error',
      message: `Grid is split into ${regions} disconnected regions; every square should be reachable.`,
    })
  }

  // --- Content ---
  for (const slot of numbering.slots) {
    if (!slot.complete) {
      const missing = slot.letters.filter((l) => l === '').length
      problems.push({
        severity: 'warning',
        message: `${label(slot.number, slot.dir)} is missing ${missing} letter${missing === 1 ? '' : 's'}.`,
        slotKey: slot.key,
      })
    }
    if (!puzzle.clues[slot.key]?.trim()) {
      problems.push({
        severity: 'warning',
        message: `${label(slot.number, slot.dir)} has no clue.`,
        slotKey: slot.key,
      })
    }
  }

  return problems
}

export interface GridStats {
  entries: number
  acrossCount: number
  downCount: number
  blocks: number
  whiteCells: number
  blockRatio: number
  averageLength: number
  filledEntries: number
  cluedEntries: number
}

export function gridStats(puzzle: Puzzle, numbering: Numbering): GridStats {
  const blocks = puzzle.grid.filter((c) => c.block).length
  const total = puzzle.rows * puzzle.cols
  const lengths = numbering.slots.map((s) => s.length)
  const sum = lengths.reduce((a, b) => a + b, 0)

  return {
    entries: numbering.slots.length,
    acrossCount: numbering.slots.filter((s) => s.dir === 'A').length,
    downCount: numbering.slots.filter((s) => s.dir === 'D').length,
    blocks,
    whiteCells: total - blocks,
    blockRatio: total === 0 ? 0 : blocks / total,
    averageLength: lengths.length === 0 ? 0 : sum / lengths.length,
    filledEntries: numbering.slots.filter((s) => s.complete).length,
    cluedEntries: numbering.slots.filter((s) => Boolean(puzzle.clues[s.key]?.trim())).length,
  }
}
