import { describe, expect, it } from 'vitest'
import { computeNumbering } from '../slots'
import { troubleSpots } from '../trouble'
import { WordList } from '../wordlist'
import { puzzleFrom } from './helpers'

const list = WordList.parse(['CAT;60', 'COT;60', 'CUT;20', 'ACE;60', 'TEE;60', 'TOE;60'].join('\n'))

describe('troubleSpots', () => {
  it('marks the open squares of an entry nothing fits with 0', () => {
    const puzzle = puzzleFrom(['QQ.', '...', '...'])
    expect(troubleSpots(list, computeNumbering(puzzle), 0).get(2)).toBe(0)
  })

  it('counts only the letters both entries through a square allow', () => {
    // Square 1 sits in C?T, which allows A, O or U, and in an empty down entry, whose words
    // start with C, A or T. Only A is in both.
    const puzzle = puzzleFrom(['C.T', '...', '...'])
    expect(troubleSpots(list, computeNumbering(puzzle), 0).get(1)).toBe(1)
  })

  it('applies the minimum score', () => {
    // At 30+ CUT drops out and so do the down words starting with C... except CAT and COT,
    // which survive — so square 1 still has exactly A.
    const puzzle = puzzleFrom(['C.T', '...', '...'])
    expect(troubleSpots(list, computeNumbering(puzzle), 30).get(1)).toBe(1)
    // At 70+ nothing fits at all.
    expect(troubleSpots(list, computeNumbering(puzzle), 70).get(1)).toBe(0)
  })

  it('leaves squares with plenty of options out', () => {
    // Twenty-six words ?AA: the first square can take any letter.
    const roomy = WordList.parse(
      Array.from({ length: 26 }, (_, i) => `${String.fromCharCode(65 + i)}AA;50`).join('\n'),
    )
    const puzzle = puzzleFrom(['...', '###', '###'])
    expect(troubleSpots(roomy, computeNumbering(puzzle), 0).has(0)).toBe(false)
  })
})
