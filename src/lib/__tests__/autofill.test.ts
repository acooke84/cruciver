import { describe, expect, it } from 'vitest'
import type { Puzzle } from '../../types/puzzle'
import { autofill, FillSearch, type FillOutcome } from '../autofill'
import { computeNumbering } from '../slots'
import { WordList } from '../wordlist'
import { puzzleFrom } from './helpers'

/** Apply a fill's letters to a copy of the puzzle. */
function applied(puzzle: Puzzle, outcome: FillOutcome): Puzzle {
  if (outcome.status !== 'filled') throw new Error(`expected a fill, got ${outcome.status}`)
  const grid = puzzle.grid.map((c) => ({ ...c }))
  for (const [i, letter] of outcome.letters) grid[i] = { block: false, letter }
  return { ...puzzle, grid }
}

function answers(puzzle: Puzzle): string[] {
  return computeNumbering(puzzle).slots.map((s) => s.answer)
}

/** Every entry complete, in the list at `minScore`, and none repeated. */
function expectValid(puzzle: Puzzle, list: WordList, minScore = 0) {
  const all = answers(puzzle)
  expect(all.every((a) => a !== '')).toBe(true)
  for (const a of all) expect(list.lookup(a)?.score ?? -1).toBeGreaterThanOrEqual(minScore)
  expect(new Set(all).size).toBe(all.length)
}

// Three symmetric 3×3 word squares (rows read the same as columns) plus some noise.
const THREES = WordList.parse(
  [
    ...['BAT', 'ARE', 'TEN'].map((w) => `${w};60`),
    ...['CAT', 'ODE', 'WED', 'COW', 'ADE', 'TED'].map((w) => `${w};70`),
    ...['SAD', 'APE', 'DEN', 'SAT'].map((w) => `${w};50`),
    ...['ACE', 'ARC', 'EAR', 'ERA', 'TAR', 'RAT'].map((w) => `${w};40`),
  ].join('\n'),
)

describe('autofill', () => {
  it('fills an empty grid with valid, distinct entries', () => {
    const puzzle = puzzleFrom(['...', '...', '...'])
    const result = applied(puzzle, autofill(THREES, puzzle, { minScore: 0, seed: 1 }))
    expectValid(result, THREES)
  })

  it('keeps typed letters and builds around them', () => {
    const puzzle = puzzleFrom(['c..', '...', '...'])
    const outcome = autofill(THREES, puzzle, { minScore: 0, seed: 1 })
    const result = applied(puzzle, outcome)
    expect(result.grid[0]?.letter).toBe('C')
    expect(outcome.status === 'filled' && outcome.letters.some(([i]) => i === 0)).toBe(false)
    expectValid(result, THREES)
  })

  it('treats pencilled letters as open and replaces them if it must', () => {
    const puzzle = puzzleFrom(['...', '...', '...'])
    // A pencilled Z can't be part of any entry, so keeping it would make the grid unfillable.
    puzzle.grid[0] = { block: false, letter: 'Z', pencil: true }
    const outcome = autofill(THREES, puzzle, { minScore: 0, seed: 1 })
    expect(outcome.status).toBe('filled')
    expect(outcome.status === 'filled' && outcome.letters.find(([i]) => i === 0)?.[1]).not.toBe('Z')
  })

  it('reports an entry that nothing fits before searching', () => {
    const puzzle = puzzleFrom(['qq.', '...', '...'])
    expect(autofill(THREES, puzzle, { minScore: 0, seed: 1 })).toMatchObject({
      status: 'stuck',
      slotKey: 'A:0,0',
    })
  })

  it('gives up when the entries fit alone but not together', () => {
    // Every entry has candidates, but no 3×3 square can be built from these two words.
    // Propagation may prove that before any word is tried, or the search may run dry.
    const list = WordList.parse('ABC;50\nDEF;50')
    const outcome = autofill(list, puzzleFrom(['...', '...', '...']), { minScore: 0, seed: 1 })
    expect(['stuck', 'exhausted']).toContain(outcome.status)
  })

  it('honours the minimum score', () => {
    const puzzle = puzzleFrom(['...', '...', '...'])
    const result = applied(puzzle, autofill(THREES, puzzle, { minScore: 60, seed: 1 }))
    expectValid(result, THREES, 60)
  })

  it('is deterministic for a seed and varies across seeds', () => {
    const puzzle = puzzleFrom(['...', '...', '...'])
    const fill = (seed: number) => answers(applied(puzzle, autofill(THREES, puzzle, { minScore: 0, seed })))
    expect(fill(7)).toEqual(fill(7))
    const distinct = new Set(Array.from({ length: 12 }, (_, seed) => fill(seed).join()))
    expect(distinct.size).toBeGreaterThan(1)
  })

  it('stops at the step budget', () => {
    // A 3×3 takes at least three words, so a budget of one can't finish it.
    const outcome = autofill(THREES, puzzleFrom(['...', '...', '...']), {
      minScore: 0,
      seed: 1,
      maxSteps: 1,
    })
    expect(outcome.status).toBe('budget')
  })

  it('runs in slices, returning null until it finishes', () => {
    const puzzle = puzzleFrom(['...', '...', '...'])
    const search = new FillSearch(THREES, puzzle, { minScore: 0, seed: 3 })
    let outcome: FillOutcome | null = null
    let slices = 0
    while (!outcome) {
      outcome = search.run(1)
      slices++
    }
    expect(slices).toBeGreaterThan(1)
    expectValid(applied(puzzle, outcome), THREES)
  })

  it('leaves entries through a rebus square alone', () => {
    const puzzle = puzzleFrom(['...', '...', '...'])
    puzzle.grid[0] = { block: false, letter: 'CA' }
    const outcome = autofill(THREES, puzzle, { minScore: 0, seed: 1 })
    // Row 0 and column 0 both run through the rebus; the other four entries still fill.
    expect(outcome).toMatchObject({ status: 'filled', entries: 4 })
  })
})
