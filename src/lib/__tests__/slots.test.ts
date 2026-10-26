import { describe, expect, it } from 'vitest'
import { completionRatio, computeNumbering, crossingSlot, slotAt } from '../slots'
import { puzzleFrom } from './helpers'

/**
 * A standard symmetric 5×5 mini:
 *
 *   # # 1 2 3
 *   # 4 . . .
 *   5 . . . .
 *   6 . . . #
 *   7 . . # #
 */
const MINI = ['##...', '#....', '.....', '....#', '...##']

describe('computeNumbering', () => {
  it('numbers cells in reading order, one number per starting square', () => {
    const numbering = computeNumbering(puzzleFrom(MINI))
    const numbers = [...numbering.numbers.entries()].sort((a, b) => a[1] - b[1])

    // [grid index, clue number] — indices are row-major in a 5-wide grid.
    expect(numbers).toEqual([
      [2, 1],
      [3, 2],
      [4, 3],
      [6, 4],
      [10, 5],
      [15, 6],
      [20, 7],
    ])
  })

  it('produces the expected across and down entries', () => {
    const { slots } = computeNumbering(puzzleFrom(MINI))
    const describe_ = (dir: 'A' | 'D') =>
      slots.filter((s) => s.dir === dir).map((s) => `${s.number}:${s.length}`)

    expect(describe_('A')).toEqual(['1:3', '4:4', '5:5', '6:4', '7:3'])
    expect(describe_('D')).toEqual(['1:5', '2:4', '3:3', '4:4', '5:3'])
  })

  it('gives a shared number to a square that starts both directions', () => {
    const { byKey } = computeNumbering(puzzleFrom(MINI))
    expect(byKey.get('A:1,1')?.number).toBe(4)
    expect(byKey.get('D:1,1')?.number).toBe(4)
  })

  it('ignores runs of a single square', () => {
    // The middle column is a lone square between two blocks in row 1.
    const { slots } = computeNumbering(puzzleFrom(['...', '#.#', '...']))
    expect(slots.some((s) => s.length === 1)).toBe(false)
  })

  it('reads letters into the pattern and marks completeness', () => {
    const { byKey } = computeNumbering(puzzleFrom(['cat', 'a.b', 'top']))
    const across = byKey.get('A:0,0')
    const down = byKey.get('D:0,1')

    expect(across?.pattern).toBe('CAT')
    expect(across?.answer).toBe('CAT')
    expect(across?.complete).toBe(true)
    expect(down?.pattern).toBe('A.O')
    expect(down?.answer).toBe('')
    expect(down?.complete).toBe(false)
  })

  it('counts a rebus square as one square but as many letters', () => {
    // The centre square holds AND, so 4-Across spells "CANDY" across three squares.
    const puzzle = puzzleFrom(['c.y', '...', '...'])
    puzzle.grid[1] = { block: false, letter: 'AND' }
    const across = computeNumbering(puzzle).byKey.get('A:0,0')

    expect(across?.length).toBe(3)
    expect(across?.letterCount).toBe(5)
    expect(across?.pattern).toBe('CANDY')
    expect(across?.answer).toBe('CANDY')
    expect(across?.complete).toBe(true)
  })

  it('counts an empty square as one letter', () => {
    const { byKey } = computeNumbering(puzzleFrom(['c.t', '...', '...']))
    expect(byKey.get('A:0,0')?.letterCount).toBe(3)
  })
})

describe('slot lookup', () => {
  it('finds the entry through a square in each direction', () => {
    const numbering = computeNumbering(puzzleFrom(MINI))
    // Row 2, col 2 -> index 12, inside 5-Across and 1-Down.
    expect(slotAt(numbering, 12, 'A')?.number).toBe(5)
    expect(slotAt(numbering, 12, 'D')?.number).toBe(1)
    expect(crossingSlot(numbering, 12, 'A')?.number).toBe(1)
  })
})

describe('completionRatio', () => {
  it('reports the share of entries that are fully filled', () => {
    // Six entries in an open 3×3; only the top row is finished.
    const numbering = computeNumbering(puzzleFrom(['cat', '.b.', '...']))
    expect(numbering.slots).toHaveLength(6)
    expect(completionRatio(numbering)).toBeCloseTo(1 / 6)
  })

  it('is zero for a grid with no entries', () => {
    expect(completionRatio(computeNumbering(puzzleFrom(['###', '###', '###'])))).toBe(0)
  })
})
