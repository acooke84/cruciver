import { describe, expect, it } from 'vitest'
import { extractPairs, extractTitleClues, isPlausibleAnswer, normalizeAnswer } from './parse.mjs'

const find = (pairs, answer) => pairs.find((p) => p.answer === answer)

describe('normalizeAnswer', () => {
  it('reduces a candidate to grid letters', () => {
    expect(normalizeAnswer('"Moonlight Sonata"')).toBe('MOONLIGHTSONATA')
    expect(normalizeAnswer('pre-K')).toBe('PREK')
    expect(normalizeAnswer('OX-EYE')).toBe('OXEYE')
  })
})

describe('isPlausibleAnswer', () => {
  it('accepts answers in a single case', () => {
    expect(isPlausibleAnswer('DARIA')).toBe(true)
    expect(isPlausibleAnswer('roadsides')).toBe(true)
    expect(isPlausibleAnswer('MOONLIGHT SONATA')).toBe(true)
    expect(isPlausibleAnswer('pre-K')).toBe(true)
  })

  it('rejects multi-word prose in mixed case', () => {
    expect(isPlausibleAnswer('Are Made of This')).toBe(false)
    expect(isPlausibleAnswer('TBT to high school physics')).toBe(false)
  })

  it('rejects a multi-word lowercase gloss', () => {
    // These stand in for the answer rather than being it: "___ egg" is KINDER.
    expect(isPlausibleAnswer('chocolate treat with a toy')).toBe(false)
    expect(isPlausibleAnswer('medieval-themed festival')).toBe(false)
  })

  it('keeps an answer that inline markup split into fragments', () => {
    // "<b>DA</b>PPER <b>DA</b>N" arrives as "DA PPER DA N" once tags are stripped.
    expect(isPlausibleAnswer('DA PPER DA N')).toBe(true)
    expect(normalizeAnswer('DA PPER DA N')).toBe('DAPPERDAN')
  })

  it('rejects sentence punctuation and out-of-range lengths', () => {
    expect(isPlausibleAnswer('also, sometimes you tag a runner')).toBe(false)
    expect(isPlausibleAnswer('X')).toBe(false)
    expect(isPlausibleAnswer('A'.repeat(30))).toBe(false)
    expect(isPlausibleAnswer('1997')).toBe(false)
  })
})

describe('extractPairs — the blog’s four conventions', () => {
  it('reads the answer-first form', () => {
    const pairs = extractPairs('<p>"MOONLIGHT SONATA" (17A: Classic Beethoven piano piece)</p>')
    expect(pairs).toEqual([
      { answer: 'MOONLIGHTSONATA', clue: 'Classic Beethoven piano piece', number: 17, dir: 'A' },
    ])
  })

  it('reads the clue-first form in modern capitals', () => {
    const pairs = extractPairs('<p>39A: Sarcastic title girl of 1990s-2000s MTV ( DARIA ) &mdash;</p>')
    expect(find(pairs, 'DARIA')?.clue).toBe('Sarcastic title girl of 1990s-2000s MTV')
  })

  it('reads the early lowercase clue-first form', () => {
    const pairs = extractPairs('<p>4D: Locales for rest stops (roadsides)</p>')
    expect(find(pairs, 'ROADSIDES')).toMatchObject({ number: 4, dir: 'D' })
  })

  it('reads the bracketed guest-blogger form', () => {
    const html = '<p>11D: SNELLEN [Herman ___, Dutch ophthalmologist known for his testing] &mdash;</p>'
    expect(find(extractPairs(html), 'SNELLEN')?.clue).toBe(
      'Herman ___, Dutch ophthalmologist known for his testing',
    )
  })
})

describe('extractPairs — guarding against prose', () => {
  it('does not run a clue past the end of a bracketed entry', () => {
    // The greedy read of this used to yield "(tbt to high school physics)" as the answer.
    const html =
      '<p>11D: SNELLEN [Herman ___, Dutch ophthalmologist] &mdash; I thought this was the ' +
      'same guy of Snell’s Law fame (tbt to high school physics), but no.</p>'
    const pairs = extractPairs(html)
    expect(pairs.map((p) => p.answer)).toEqual(['SNELLEN'])
  })

  it('drops a pair whose clue has an unbalanced quote', () => {
    // A parenthesis nested inside a quoted title would otherwise supply a bogus answer.
    const html = '<p>45A: 1983 Eurythmics hit whose full title includes "(Are Made of This)"</p>'
    expect(extractPairs(html)).toEqual([])
  })

  it('ignores a parenthetical aside that is not an answer', () => {
    const html = '<p>29D: What tagging a runner results in (also, sometimes he is not out)</p>'
    expect(extractPairs(html)).toEqual([])
  })

  it('deduplicates a pair repeated within one post', () => {
    const html = '<p>2D: Eponym of a chess rating system (ELO)</p><p>2D: Eponym of a chess rating system (ELO)</p>'
    expect(extractPairs(html)).toHaveLength(1)
  })

  it('returns nothing for a post with no grid references', () => {
    expect(extractPairs('<p>Just some commentary about puns.</p>')).toEqual([])
  })

  it('takes the last parenthetical as the answer, not the first', () => {
    // `(acclaimed 2011 documentary)` qualifies the clue; the answer is the group after it.
    const html = '<p>51D: "___ Dreams of Sushi" (acclaimed 2011 documentary) (" JIRO ") &mdash; when</p>'
    expect(extractPairs(html)).toEqual([
      {
        answer: 'JIRO',
        clue: '"___ Dreams of Sushi" (acclaimed 2011 documentary)',
        number: 51,
        dir: 'D',
      },
    ])
  })

  it('rejects a clue that spans two entries', () => {
    const html = '<p>2D: Spirit of the Caribbean / 1D: Fruity pastry (RT)</p>'
    expect(extractPairs(html)).toEqual([])
  })

  it('rejects answers shorter than a legal crossword entry', () => {
    expect(extractPairs('<p>5A: Give a debriefing (TO)</p>')).toEqual([])
  })
})

describe('extractTitleClues', () => {
  it('splits the title into clues and drops the date slug', () => {
    const clues = extractTitleClues(
      'High-end private jet, familiarly / TUE 8-17-26 / Eponym of a chess rating system',
    )
    expect(clues).toEqual([
      'High-end private jet, familiarly',
      'Eponym of a chess rating system',
    ])
  })
})
