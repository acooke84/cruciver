import { describe, expect, it } from 'vitest'
import { computeNumbering } from '../slots'
import { analyze, countRegions, gridStats } from '../validation'
import { puzzleFrom } from './helpers'

function problemsFor(rows: string[], overrides = {}) {
  const puzzle = puzzleFrom(rows, overrides)
  return analyze(puzzle, computeNumbering(puzzle))
}

const messages = (rows: string[], overrides = {}) =>
  problemsFor(rows, overrides).map((p) => p.message)

describe('analyze — structure', () => {
  it('flags entries shorter than three letters', () => {
    // Row 0 holds a two-letter across entry walled off by a block.
    const found = messages(['..#..', '.....', '.....', '.....', '.....'])
    expect(found.some((m) => m.includes('1-Across is only 2 letters long'))).toBe(true)
  })

  it('flags a square that appears in only one direction', () => {
    const found = messages(['...', '#.#', '...'])
    expect(found.some((m) => m.includes('row 1, column 1 is unchecked'))).toBe(true)
  })

  it('flags a square that belongs to no entry at all', () => {
    const found = messages(['.#.', '###', '...'])
    expect(found.some((m) => m.includes('row 1, column 1 is isolated'))).toBe(true)
  })

  it('flags a grid split into separate regions', () => {
    const found = messages(['...', '###', '...'])
    expect(found.some((m) => m.includes('split into 2 disconnected regions'))).toBe(true)
  })

  it('flags an asymmetric grid only when symmetry is switched on', () => {
    const asymmetric = ['#....', '.....', '.....', '.....', '.....']
    expect(messages(asymmetric, { symmetry: true }).some((m) => m.includes('not rotationally'))).toBe(
      true,
    )
    expect(
      messages(asymmetric, { symmetry: false }).some((m) => m.includes('not rotationally')),
    ).toBe(false)
  })

  it('reports nothing structural for a clean symmetric grid', () => {
    const errors = problemsFor(['##...', '#....', '.....', '....#', '...##'], {
      symmetry: true,
    }).filter((p) => p.severity === 'error')
    expect(errors).toEqual([])
  })
})

describe('analyze — content', () => {
  it('reports missing letters and missing clues per entry', () => {
    const found = messages(['cat', '.b.', '...'])
    expect(found).toContain('1-Across has no clue.')
    expect(found.some((m) => m.startsWith('4-Across is missing'))).toBe(true)
    // A finished entry is not reported as incomplete.
    expect(found.some((m) => m.startsWith('1-Across is missing'))).toBe(false)
  })

  it('accepts an entry once it has both letters and a clue', () => {
    const puzzle = puzzleFrom(['cat', '.b.', '...'], { clues: { 'A:0,0': 'Feline' } })
    const found = analyze(puzzle, computeNumbering(puzzle)).map((p) => p.message)
    expect(found.some((m) => m.includes('1-Across'))).toBe(false)
  })
})

describe('problem targets', () => {
  it('attaches short-entry errors to a slot the grid can resolve to squares', () => {
    const puzzle = puzzleFrom(['..#..', '.....', '.....', '.....', '.....'])
    const numbering = computeNumbering(puzzle)
    const short = analyze(puzzle, numbering).find((p) => p.message.includes('only 2 letters'))

    expect(short?.slotKey).toBe('A:0,0')
    // The editor expands slotKey -> cells to outline the whole entry.
    expect(numbering.byKey.get(short?.slotKey ?? '')?.cells).toEqual([0, 1])
  })

  it('attaches square-level errors to a cell index', () => {
    // Corners sit in an across entry only; the centre sits in a down entry only.
    const puzzle = puzzleFrom(['...', '#.#', '...'])
    const unchecked = analyze(puzzle, computeNumbering(puzzle))
      .filter((p) => p.message.includes('unchecked'))
      .map((p) => p.cellIndex)

    expect(unchecked).toEqual([0, 2, 4, 6, 8])
  })

  it('gives every error either a slot or a square, except whole-grid ones', () => {
    const puzzle = puzzleFrom(['.#.', '###', '...'], { symmetry: true })
    const errors = analyze(puzzle, computeNumbering(puzzle)).filter((p) => p.severity === 'error')
    const unanchored = errors.filter((p) => !p.slotKey && p.cellIndex === undefined)

    expect(errors.length).toBeGreaterThan(0)
    // Only grid-wide problems (symmetry, connectivity) may lack a target.
    expect(unanchored.every((p) => /symmetric|disconnected/.test(p.message))).toBe(true)
  })
})

describe('countRegions', () => {
  it('counts one region for a connected grid', () => {
    expect(countRegions(puzzleFrom(['...', '.#.', '...']))).toBe(1)
  })

  it('counts each isolated pocket separately', () => {
    expect(countRegions(puzzleFrom(['.#.', '###', '.#.']))).toBe(4)
  })
})

describe('gridStats', () => {
  it('summarises the grid', () => {
    const puzzle = puzzleFrom(['##...', '#....', '.....', '....#', '...##'], {
      clues: { 'A:0,2': 'A clue' },
    })
    const stats = gridStats(puzzle, computeNumbering(puzzle))

    expect(stats.entries).toBe(10)
    expect(stats.acrossCount).toBe(5)
    expect(stats.downCount).toBe(5)
    expect(stats.blocks).toBe(6)
    expect(stats.whiteCells).toBe(19)
    expect(stats.averageLength).toBeCloseTo(3.8)
    expect(stats.cluedEntries).toBe(1)
    expect(stats.filledEntries).toBe(0)
  })
})
