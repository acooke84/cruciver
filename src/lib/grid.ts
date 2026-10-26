import type { Cell, Puzzle } from '../types/puzzle'

export const MIN_SIZE = 3
export const MAX_SIZE = 25

/**
 * How much one square may hold. A rebus square packs a whole word into a single square; the cap
 * keeps it renderable — eight characters is already tiny in a 21×21 grid.
 */
export const MAX_CELL_LETTERS = 8

export const SIZE_PRESETS: { label: string; rows: number; cols: number; note: string }[] = [
  { label: '5 × 5', rows: 5, cols: 5, note: 'Mini' },
  { label: '7 × 7', rows: 7, cols: 7, note: 'Midi' },
  { label: '9 × 9', rows: 9, cols: 9, note: 'Compact' },
  { label: '11 × 11', rows: 11, cols: 11, note: 'Tabloid' },
  { label: '15 × 15', rows: 15, cols: 15, note: 'Daily' },
  { label: '21 × 21', rows: 21, cols: 21, note: 'Sunday' },
]

export function emptyCell(): Cell {
  return { block: false, letter: '' }
}

export function createGrid(rows: number, cols: number): Cell[] {
  return Array.from({ length: rows * cols }, emptyCell)
}

export function idx(row: number, col: number, cols: number): number {
  return row * cols + col
}

export function rowOf(index: number, cols: number): number {
  return Math.floor(index / cols)
}

export function colOf(index: number, cols: number): number {
  return index % cols
}

export function cellAt(puzzle: Puzzle, row: number, col: number): Cell | undefined {
  if (row < 0 || col < 0 || row >= puzzle.rows || col >= puzzle.cols) return undefined
  return puzzle.grid[idx(row, col, puzzle.cols)]
}

/** The index a cell maps to under 180° rotation. */
export function mirrorIndex(index: number, rows: number, cols: number): number {
  return rows * cols - 1 - index
}

export function clampSize(n: number): number {
  return Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(n)))
}

/**
 * Resize the grid, anchored at the top-left so overlapping cells keep their block state and
 * letter. Cells outside the old bounds come in empty.
 */
export function resizeGrid(puzzle: Puzzle, nextRows: number, nextCols: number): Cell[] {
  const rows = clampSize(nextRows)
  const cols = clampSize(nextCols)
  const next = createGrid(rows, cols)
  const copyRows = Math.min(rows, puzzle.rows)
  const copyCols = Math.min(cols, puzzle.cols)

  for (let r = 0; r < copyRows; r++) {
    for (let c = 0; c < copyCols; c++) {
      const old = puzzle.grid[idx(r, c, puzzle.cols)]
      if (old) next[idx(r, c, cols)] = { ...old }
    }
  }
  return next
}

/**
 * Set the block state of a cell. With symmetry on, the 180°-rotated partner is set to match.
 * Turning a cell into a block also clears any letter it held.
 */
export function setBlock(puzzle: Puzzle, index: number, block: boolean): Cell[] {
  const next = puzzle.grid.slice()
  const apply = (i: number) => {
    const cell = next[i]
    if (!cell) return
    next[i] = block ? { block: true, letter: '' } : { ...cell, block: false }
  }

  apply(index)
  if (puzzle.symmetry) {
    apply(mirrorIndex(index, puzzle.rows, puzzle.cols))
  }
  return next
}

/**
 * Reduce typed or pasted text to what a square may hold: uppercase A-Z and 0-9, capped at
 * `MAX_CELL_LETTERS`. Digits are kept because rebus squares sometimes hold numbers.
 */
export function normalizeCellText(text: string): string {
  return text
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, MAX_CELL_LETTERS)
}

/**
 * Write the contents of a square — one letter for ordinary typing, more for a rebus. What's
 * typed is always ink, even over a pencilled letter. Locked squares are left alone.
 */
export function setCellText(puzzle: Puzzle, index: number, text: string): Cell[] {
  const cell = puzzle.grid[index]
  if (!cell || cell.block || cell.locked) return puzzle.grid

  const next = puzzle.grid.slice()
  next[index] = { block: false, letter: normalizeCellText(text) }
  return next
}

/**
 * Write `word` into the squares of an entry in ink, one character per square. Squares the word
 * doesn't reach, blocks and locked squares are left alone.
 */
export function fillEntry(puzzle: Puzzle, cells: number[], word: string): Cell[] {
  const next = puzzle.grid.slice()
  cells.forEach((index, i) => {
    const ch = word[i]
    const cell = next[index]
    if (ch && cell && !cell.block && !cell.locked) next[index] = { block: false, letter: ch }
  })
  return next
}

/**
 * Pencil in autofill's letters. Only squares that are empty or already pencilled take one —
 * anything typed (or locked) since the fill started wins.
 */
export function writePencil(puzzle: Puzzle, letters: Iterable<[index: number, letter: string]>): Cell[] {
  const next = puzzle.grid.slice()
  for (const [index, letter] of letters) {
    const cell = next[index]
    if (!cell || cell.block || cell.locked || (cell.letter && !cell.pencil)) continue
    next[index] = { block: false, letter: normalizeCellText(letter), pencil: true }
  }
  return next
}

export function hasPencil(puzzle: Puzzle): boolean {
  return puzzle.grid.some((cell) => cell.pencil)
}

/** Keep every pencilled letter, turning it into ink. */
export function acceptPencil(puzzle: Puzzle): Cell[] {
  return puzzle.grid.map((cell) => (cell.pencil ? { block: false, letter: cell.letter } : cell))
}

/**
 * Erase pencilled letters, leaving ink alone. With `cells`, only those squares are erased —
 * a region fill replaces its own earlier pencil but keeps the pencil around it.
 */
export function clearPencil(puzzle: Puzzle, cells?: Iterable<number>): Cell[] {
  const only = cells ? new Set(cells) : null
  return puzzle.grid.map((cell, i) =>
    cell.pencil && (!only || only.has(i)) ? { block: false, letter: '' } : cell,
  )
}

/**
 * Lock or unlock squares. Locking inks any pencilled letter and skips empty squares, since
 * there's nothing there to protect.
 */
export function setLocked(puzzle: Puzzle, cells: number[], locked: boolean): Cell[] {
  const next = puzzle.grid.slice()
  for (const index of cells) {
    const cell = next[index]
    if (!cell || cell.block || !cell.letter) continue
    next[index] = locked ? { block: false, letter: cell.letter, locked: true } : { block: false, letter: cell.letter }
  }
  return next
}

/** True when the block pattern is unchanged by a 180° rotation. */
export function isSymmetric(puzzle: Puzzle): boolean {
  const { grid, rows, cols } = puzzle
  for (let i = 0; i < grid.length; i++) {
    const mirror = grid[mirrorIndex(i, rows, cols)]
    if (grid[i]?.block !== mirror?.block) return false
  }
  return true
}

/** Force the grid to be symmetric by unioning each cell with its rotational partner. */
export function makeSymmetric(puzzle: Puzzle): Cell[] {
  const next = puzzle.grid.map((cell) => ({ ...cell }))
  for (let i = 0; i < next.length; i++) {
    const m = mirrorIndex(i, puzzle.rows, puzzle.cols)
    const a = next[i]
    const b = next[m]
    if (!a || !b) continue
    if (a.block || b.block) {
      next[i] = { block: true, letter: '' }
      next[m] = { block: true, letter: '' }
    }
  }
  return next
}

export function clearBlocks(puzzle: Puzzle): Cell[] {
  return puzzle.grid.map((cell) => ({ ...cell, block: false }))
}

/** Empty every square except locked ones. */
export function clearLetters(puzzle: Puzzle): Cell[] {
  return puzzle.grid.map((cell) => (cell.locked ? cell : { block: cell.block, letter: '' }))
}
