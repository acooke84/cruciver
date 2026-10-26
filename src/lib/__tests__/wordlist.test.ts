import { describe, expect, it } from 'vitest'
import { WordList } from '../wordlist'

const words = (list: WordList, squares: string[], minScore = 0) =>
  list.matches(squares, minScore).map((w) => w.word)

describe('WordList.parse', () => {
  it('reads score and optional seen count', () => {
    const list = WordList.parse('OREO;90;29\nAREA;60\n')
    expect(list.lookup('OREO')).toEqual({ word: 'OREO', score: 90, seen: 29 })
    expect(list.lookup('AREA')).toEqual({ word: 'AREA', score: 60, seen: 0 })
  })

  it('drops entries that cannot go in a grid and keeps the best duplicate', () => {
    const list = WordList.parse('ox;50\nCAFÉ;50\nHI THERE;50\nerie;20\nERIE;70\n\n')
    expect(list.size).toBe(1)
    expect(list.lookup('ERIE')?.score).toBe(70)
    expect(list.lookup('OX')).toBeUndefined()
  })
})

describe('WordList.parse with overrides', () => {
  const text = ['CRAB;80;5', 'CRIB;60', 'DRAB;70', 'GRAB;40'].join('\n')

  it('drops banned entries from matches, counts and lookups', () => {
    const list = WordList.parse(text, { CRAB: 'banned' })
    expect(words(list, ['', 'R', '', 'B'])).toEqual(['DRAB', 'CRIB', 'GRAB'])
    expect(list.count(['C', 'R', '', 'B'])).toBe(1)
    expect(list.lookup('CRAB')).toBeUndefined()
    expect(list.size).toBe(3)
  })

  it('rescores entries, changing their rank and whether a minimum lets them in', () => {
    const list = WordList.parse(text, { GRAB: 95, CRAB: 20 })
    expect(words(list, ['', 'R', '', 'B'])).toEqual(['GRAB', 'DRAB', 'CRIB', 'CRAB'])
    expect(words(list, ['', 'R', '', 'B'], 50)).toEqual(['GRAB', 'DRAB', 'CRIB'])
    // The seen count survives a rescore.
    expect(list.lookup('CRAB')).toEqual({ word: 'CRAB', score: 20, seen: 5 })
  })

  it('adds entries the base list lacks, and ignores ones that cannot go in a grid', () => {
    const list = WordList.parse(text, { BRAB: 65, XY: 90, 'NO WAY': 90 })
    expect(list.lookup('BRAB')).toEqual({ word: 'BRAB', score: 65, seen: 0 })
    expect(words(list, ['', 'R', 'A', 'B'], 65)).toEqual(['CRAB', 'DRAB', 'BRAB'])
    expect(list.size).toBe(5)
  })
})

describe('WordList matching', () => {
  const list = WordList.parse(
    ['CRAB;80', 'CRIB;60', 'CRUB;10', 'DRAB;70', 'SCRUB;50', 'R2D2;40'].join('\n'),
  )

  it('matches fixed letters and leaves open squares free, best first', () => {
    expect(words(list, ['C', 'R', '', 'B'])).toEqual(['CRAB', 'CRIB', 'CRUB'])
    expect(words(list, ['', '', 'A', ''])).toEqual(['CRAB', 'DRAB'])
    expect(words(list, ['', '', '', '', ''])).toEqual(['SCRUB'])
  })

  it('applies the minimum score to matches and counts alike', () => {
    expect(words(list, ['C', 'R', '', 'B'], 60)).toEqual(['CRAB', 'CRIB'])
    expect(list.count(['C', 'R', '', 'B'], 61)).toBe(1)
  })

  it('handles digits, absent letters, and lengths with no entries', () => {
    expect(words(list, ['R', '2', '', ''])).toEqual(['R2D2'])
    expect(list.count(['Q', '', '', ''])).toBe(0)
    expect(list.count(['', '', ''])).toBe(0)
  })

  it('treats a rebus square as unmatchable rather than guessing', () => {
    expect(list.count(['CR', 'A', 'B'])).toBe(0)
  })

  it('stays correct across bitset block boundaries', () => {
    // 70 entries spans three 32-bit blocks; the cut-off lands mid-block.
    const entries = Array.from({ length: 70 }, (_, i) => ({
      word: `A${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + Math.floor(i / 26))}`,
      score: 100 - i,
      seen: 0,
    }))
    const big = WordList.fromEntries(entries)
    expect(big.count(['A', '', ''])).toBe(70)
    expect(big.count(['A', '', ''], 100 - 40)).toBe(41)
    expect(big.count(['', '', 'C'])).toBe(18)
  })

  it('survives a round trip through its transferable form', () => {
    const { data } = list.toData()
    const copy = WordList.fromData(structuredClone(data))
    expect(words(copy, ['C', 'R', '', 'B'])).toEqual(['CRAB', 'CRIB', 'CRUB'])
    expect(copy.size).toBe(list.size)
  })
})
