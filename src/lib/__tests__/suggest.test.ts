import { describe, expect, it } from 'vitest'
import type { Slot } from '../../types/puzzle'
import { computeNumbering } from '../slots'
import { suggest } from '../suggest'
import { WordList } from '../wordlist'
import { puzzleFrom } from './helpers'

/**
 * A 3×3 with every square checked:
 *
 *   1 2 3
 *   4 . .
 *   5 . .
 */
const list = WordList.parse(
  ['CAT;90', 'COT;80', 'CUT;30', 'ARE;70', 'TEE;60', 'ACE;50', 'TOE;40', 'CAB;20'].join('\n'),
)

function slotFor(rows: string[], key: string) {
  const numbering = computeNumbering(puzzleFrom(rows))
  const slot = numbering.byKey.get(key)
  if (!slot) throw new Error(`no slot ${key}`)
  return { numbering, slot }
}

describe('suggest', () => {
  it('lists fitting entries best first', () => {
    const { numbering, slot } = slotFor(['C..', '...', '...'], 'A:0,0')
    const result = suggest(list, numbering, slot, { minScore: 0, limit: 10 })
    if (result.status !== 'ok') throw new Error('expected suggestions')
    expect(result.suggestions.map((s) => s.word)).toEqual(['CAT', 'COT', 'CUT', 'CAB'])
  })

  it('sinks entries that would leave a crossing with no options', () => {
    // CAB would make 3-Down start with B, which nothing in the list does. COT and CUT strand
    // 2-Down the same way (nothing starts with O or U), leaving CAT as the only viable fill.
    const { numbering, slot } = slotFor(['C..', '...', '...'], 'A:0,0')
    const result = suggest(list, numbering, slot, { minScore: 0, limit: 10 })
    if (result.status !== 'ok') throw new Error('expected suggestions')

    const cab = result.suggestions.find((s) => s.word === 'CAB')
    expect(cab?.crossOptions).toBe(0)
    expect(cab?.tightest?.key).toBe('D:0,2')
    expect(result.suggestions.at(-1)?.word).toBe('CAB')
    expect(result.viable).toBe(1)
  })

  it('reports the tightest crossing count for viable entries', () => {
    // Placing CAT puts A atop 2-Down (A??: ARE, ACE) and T atop 3-Down (T??: TEE, TOE).
    const { numbering, slot } = slotFor(['C..', '...', '...'], 'A:0,0')
    const result = suggest(list, numbering, slot, { minScore: 0, limit: 10 })
    if (result.status !== 'ok') throw new Error('expected suggestions')
    expect(result.suggestions[0]).toMatchObject({ word: 'CAT', crossOptions: 2 })
  })

  it('respects the minimum score for candidates and crossings', () => {
    const { numbering, slot } = slotFor(['C..', '...', '...'], 'A:0,0')
    const result = suggest(list, numbering, slot, { minScore: 45, limit: 10 })
    if (result.status !== 'ok') throw new Error('expected suggestions')
    // T?? now only has TEE; CUT and CAB fall below the bar.
    expect(result.suggestions.map((s) => [s.word, s.crossOptions])).toEqual([
      ['CAT', 1],
      ['COT', 0],
    ])
  })

  it('leaves out entries already used elsewhere in the grid', () => {
    const { numbering, slot } = slotFor(['...', '...', 'CAT'], 'A:0,0')
    const result = suggest(list, numbering, slot, { minScore: 0, limit: 10 })
    if (result.status !== 'ok') throw new Error('expected suggestions')
    expect(result.suggestions.map((s) => s.word)).not.toContain('CAT')
  })

  it('declines entries that run through a rebus square', () => {
    const puzzle = puzzleFrom(['...', '...', '...'])
    puzzle.grid[0] = { block: false, letter: 'CA' }
    const numbering = computeNumbering(puzzle)
    const slot = numbering.byKey.get('A:0,0')!
    expect(suggest(list, numbering, slot, { minScore: 0, limit: 10 }).status).toBe('rebus')
  })

  it('offers digits only where one is already typed', () => {
    const digits = WordList.parse('B2BS;90\nBOBS;50')
    const open = slotFor(['....', '####', '####', '####'], 'A:0,0')
    const fixed = slotFor(['B2..', '####', '####', '####'], 'A:0,0')
    const words = (s: { numbering: ReturnType<typeof computeNumbering>; slot: Slot }) => {
      const result = suggest(digits, s.numbering, s.slot, { minScore: 0, limit: 10 })
      return result.status === 'ok' ? result.suggestions.map((x) => x.word) : []
    }
    expect(words(open)).toEqual(['BOBS'])
    expect(words(fixed)).toEqual(['B2BS'])
  })

  it('caps the list but still reports the full total', () => {
    const { numbering, slot } = slotFor(['C..', '...', '...'], 'A:0,0')
    const result = suggest(list, numbering, slot, { minScore: 0, limit: 2 })
    if (result.status !== 'ok') throw new Error('expected suggestions')
    expect(result.suggestions).toHaveLength(2)
    expect(result.total).toBe(4)
  })
})
