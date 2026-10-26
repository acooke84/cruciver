import { describe, expect, it } from 'vitest'
import type { Puzzle } from '../../types/puzzle'
import { randomBlocks, type RandomBlocksOptions } from '../generate'
import { isSymmetric } from '../grid'
import { createPuzzle } from '../puzzle'
import { computeNumbering } from '../slots'
import { analyze, gridStats } from '../validation'
import { puzzleFrom } from './helpers'

/** Deterministic PRNG (mulberry32) so a failing case can be reproduced from its seed. */
function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function generate(puzzle: Puzzle, options: RandomBlocksOptions = {}): Puzzle {
  return { ...puzzle, grid: randomBlocks(puzzle, options) }
}

function structuralErrors(puzzle: Puzzle): string[] {
  return analyze(puzzle, computeNumbering(puzzle))
    .filter((p) => p.severity === 'error')
    .map((p) => p.message)
}

describe('randomBlocks', () => {
  const sizes = [
    [3, 3],
    [5, 5],
    [7, 9],
    [11, 11],
    [15, 15],
  ] as const

  for (const [rows, cols] of sizes) {
    for (const symmetry of [true, false]) {
      it(`produces a valid ${rows}x${cols} grid with symmetry ${symmetry ? 'on' : 'off'}`, () => {
        for (let seed = 1; seed <= 40; seed++) {
          const puzzle = createPuzzle({ title: 'T', rows, cols, symmetry })
          const result = generate(puzzle, { random: seeded(seed) })

          expect(structuralErrors(result), `seed ${seed}`).toEqual([])
        }
      })
    }
  }

  it('mirrors every block when symmetry is on', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const puzzle = createPuzzle({ title: 'T', rows: 13, cols: 13, symmetry: true })
      expect(isSymmetric(generate(puzzle, { random: seeded(seed) })), `seed ${seed}`).toBe(true)
    }
  })

  it('lands near the requested density', () => {
    const puzzle = createPuzzle({ title: 'T', rows: 15, cols: 15, symmetry: true })
    const result = generate(puzzle, { random: seeded(7), blockRatio: 0.16 })
    const { blockRatio } = gridStats(result, computeNumbering(result))

    expect(blockRatio).toBeGreaterThan(0.08)
    expect(blockRatio).toBeLessThanOrEqual(0.16)
  })

  it('leaves the grid open when the size admits no blocks', () => {
    // Any block in a 3x3 leaves a run shorter than an entry, so none can be placed.
    const puzzle = createPuzzle({ title: 'T', rows: 3, cols: 3, symmetry: false })
    expect(randomBlocks(puzzle, { random: seeded(3), blockRatio: 1 }).some((c) => c.block)).toBe(
      false,
    )
  })

  it('replaces any existing pattern rather than adding to it', () => {
    const puzzle = puzzleFrom(['#....', '#....', '.....', '....#', '....#'])
    const result = generate(puzzle, { random: seeded(11), blockRatio: 0 })

    expect(result.grid.some((c) => c.block)).toBe(false)
  })

  it('keeps letters on squares that stay open and clears the rest', () => {
    const puzzle = puzzleFrom(['abcde', 'fghij', 'klmno', 'pqrst', 'uvwxy'])
    const result = generate(puzzle, { random: seeded(5) })

    expect(result.grid.some((c) => c.block)).toBe(true)
    for (const cell of result.grid) {
      if (cell.block) expect(cell.letter).toBe('')
      else expect(cell.letter).not.toBe('')
    }
  })
})
