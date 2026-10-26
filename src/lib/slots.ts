import type { Direction, Numbering, Puzzle, Slot } from '../types/puzzle'
import { idx } from './grid'

export function slotKey(dir: Direction, row: number, col: number): string {
  return `${dir}:${row},${col}`
}

function isWhite(puzzle: Puzzle, row: number, col: number): boolean {
  if (row < 0 || col < 0 || row >= puzzle.rows || col >= puzzle.cols) return false
  return puzzle.grid[idx(row, col, puzzle.cols)]?.block === false
}

/** A cell begins an across entry when nothing precedes it and at least one cell follows. */
function startsAcross(puzzle: Puzzle, row: number, col: number): boolean {
  return isWhite(puzzle, row, col) && !isWhite(puzzle, row, col - 1) && isWhite(puzzle, row, col + 1)
}

function startsDown(puzzle: Puzzle, row: number, col: number): boolean {
  return isWhite(puzzle, row, col) && !isWhite(puzzle, row - 1, col) && isWhite(puzzle, row + 1, col)
}

function buildSlot(puzzle: Puzzle, dir: Direction, row: number, col: number, number: number): Slot {
  const cells: number[] = []
  const letters: string[] = []

  let r = row
  let c = col
  while (isWhite(puzzle, r, c)) {
    const i = idx(r, c, puzzle.cols)
    cells.push(i)
    letters.push(puzzle.grid[i]?.letter ?? '')
    if (dir === 'A') c++
    else r++
  }

  const pattern = letters.map((l) => l || '.').join('')
  const complete = letters.every((l) => l !== '')

  return {
    key: slotKey(dir, row, col),
    number,
    dir,
    row,
    col,
    cells,
    letters,
    pattern,
    answer: complete ? letters.join('') : '',
    length: cells.length,
    letterCount: letters.reduce((n, l) => n + (l.length || 1), 0),
    complete,
  }
}

/**
 * Compute the standard crossword numbering and every across/down entry.
 * Cells are numbered in reading order; a cell takes a number when it starts an entry in
 * either direction.
 */
export function computeNumbering(puzzle: Puzzle): Numbering {
  const slots: Slot[] = []
  const numbers = new Map<number, number>()
  let next = 1

  for (let row = 0; row < puzzle.rows; row++) {
    for (let col = 0; col < puzzle.cols; col++) {
      const across = startsAcross(puzzle, row, col)
      const down = startsDown(puzzle, row, col)
      if (!across && !down) continue

      const number = next++
      numbers.set(idx(row, col, puzzle.cols), number)
      if (across) slots.push(buildSlot(puzzle, 'A', row, col, number))
      if (down) slots.push(buildSlot(puzzle, 'D', row, col, number))
    }
  }

  const byCell = new Map<number, Slot[]>()
  const byKey = new Map<string, Slot>()
  for (const slot of slots) {
    byKey.set(slot.key, slot)
    for (const cell of slot.cells) {
      const list = byCell.get(cell)
      if (list) list.push(slot)
      else byCell.set(cell, [slot])
    }
  }

  return { slots, numbers, byCell, byKey }
}

export function acrossSlots(numbering: Numbering): Slot[] {
  return numbering.slots.filter((s) => s.dir === 'A')
}

export function downSlots(numbering: Numbering): Slot[] {
  return numbering.slots.filter((s) => s.dir === 'D')
}

/** The entry running through `cellIndex` in `dir`, if any. */
export function slotAt(numbering: Numbering, cellIndex: number, dir: Direction): Slot | undefined {
  return numbering.byCell.get(cellIndex)?.find((s) => s.dir === dir)
}

/** The entry crossing `slot` at `cellIndex` — i.e. the one running the other way. */
export function crossingSlot(
  numbering: Numbering,
  cellIndex: number,
  dir: Direction,
): Slot | undefined {
  return slotAt(numbering, cellIndex, dir === 'A' ? 'D' : 'A')
}

/** Share of entries that are completely filled, 0-1. */
export function completionRatio(numbering: Numbering): number {
  if (numbering.slots.length === 0) return 0
  const done = numbering.slots.filter((s) => s.complete).length
  return done / numbering.slots.length
}

/** Format a pattern for display, e.g. `C ? O S S`. */
export function formatPattern(pattern: string): string {
  return pattern.split('').join(' ').replace(/\./g, '?')
}
