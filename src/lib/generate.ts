import type { Cell, Puzzle } from '../types/puzzle'
import { idx, mirrorIndex } from './grid'
import { MIN_ENTRY_LENGTH } from './validation'

/** Density bounds for a generated grid, picked to sit near newspaper convention (~16%). */
const MIN_BLOCK_RATIO = 0.12
const MAX_BLOCK_RATIO = 0.2

export interface RandomBlocksOptions {
  /** Injectable source of randomness in [0, 1) — supply a seeded one for deterministic runs. */
  random?: () => number
  /** Overrides the randomly chosen block density, 0-1. */
  blockRatio?: number
}

/**
 * Build a random block pattern that satisfies every structural rule the validator checks:
 * no entry shorter than `MIN_ENTRY_LENGTH`, no unchecked square, one connected white region,
 * and 180° symmetry whenever the puzzle asks for it.
 *
 * Blocks are added one at a time (in symmetric pairs when symmetry is on) and any placement
 * that would break a rule is undone. Because adding a block can only shorten runs and split
 * regions, a rejected square can never become placeable later — so a single shuffled pass
 * considers every candidate. Letters under new blocks are dropped; the rest are left alone.
 */
export function randomBlocks(puzzle: Puzzle, options: RandomBlocksOptions = {}): Cell[] {
  const { rows, cols } = puzzle
  const random = options.random ?? Math.random
  const total = rows * cols
  const blocks: boolean[] = new Array(total).fill(false)

  const ratio =
    options.blockRatio ?? MIN_BLOCK_RATIO + random() * (MAX_BLOCK_RATIO - MIN_BLOCK_RATIO)
  const target = Math.round(total * Math.max(0, Math.min(1, ratio)))

  let placed = 0
  for (const index of shuffledIndices(total, random)) {
    if (placed >= target) break
    if (blocks[index]) continue

    const partner = puzzle.symmetry ? mirrorIndex(index, rows, cols) : index
    const touched = partner === index || blocks[partner] ? [index] : [index, partner]

    for (const i of touched) blocks[i] = true
    if (isPlayable(blocks, rows, cols, touched)) {
      placed += touched.length
    } else {
      for (const i of touched) blocks[i] = false
    }
  }

  return puzzle.grid.map((cell, i) =>
    blocks[i] ? { block: true, letter: '' } : { block: false, letter: cell.letter },
  )
}

/** Fisher-Yates over `0..count-1`. */
function shuffledIndices(count: number, random: () => number): number[] {
  const order = Array.from({ length: count }, (_, i) => i)
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const a = order[i] as number
    order[i] = order[j] as number
    order[j] = a
  }
  return order
}

/**
 * Check the rules that the newly blocked squares in `touched` could have broken: the runs
 * along their own row and column, plus overall connectivity.
 */
function isPlayable(blocks: boolean[], rows: number, cols: number, touched: number[]): boolean {
  for (const i of touched) {
    if (!lineOk(blocks, rows, cols, Math.floor(i / cols), i % cols, 'A')) return false
    if (!lineOk(blocks, rows, cols, Math.floor(i / cols), i % cols, 'D')) return false
  }
  return isConnected(blocks, rows, cols)
}

/**
 * True when every maximal white run in the row (`A`) or column (`D`) through `row,col` is
 * long enough to hold an entry. A run of 1 leaves an unchecked square; a run of 2 makes an
 * entry below the minimum length.
 */
function lineOk(
  blocks: boolean[],
  rows: number,
  cols: number,
  row: number,
  col: number,
  dir: 'A' | 'D',
): boolean {
  const length = dir === 'A' ? cols : rows
  let run = 0

  for (let step = 0; step <= length; step++) {
    const blocked =
      step === length || blocks[dir === 'A' ? idx(row, step, cols) : idx(step, col, cols)]
    if (blocked) {
      if (run > 0 && run < MIN_ENTRY_LENGTH) return false
      run = 0
    } else {
      run++
    }
  }
  return true
}

/** True when the white squares form exactly one orthogonally connected region. */
function isConnected(blocks: boolean[], rows: number, cols: number): boolean {
  const start = blocks.indexOf(false)
  if (start === -1) return false

  const seen = new Array<boolean>(blocks.length).fill(false)
  const stack = [start]
  let reached = 0

  while (stack.length > 0) {
    const current = stack.pop() as number
    if (seen[current]) continue
    seen[current] = true
    reached++

    const r = Math.floor(current / cols)
    const c = current % cols
    for (const [nr, nc] of [
      [r - 1, c],
      [r + 1, c],
      [r, c - 1],
      [r, c + 1],
    ] as [number, number][]) {
      if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue
      const ni = idx(nr, nc, cols)
      if (!seen[ni] && !blocks[ni]) stack.push(ni)
    }
  }

  const white = blocks.reduce((count, block) => (block ? count : count + 1), 0)
  return reached === white
}
