import type { Numbering, Slot } from '../types/puzzle'
import { crossingSlot } from './slots'
import { hasRebus, type WordInfo, type WordList } from './wordlist'

export interface Suggestion extends WordInfo {
  /**
   * Fewest entries left for any crossing entry once this one is written in — 0 means it
   * strands a crossing. Infinity when it fills no open square that another entry crosses.
   */
  crossOptions: number
  /** The crossing entry left with `crossOptions`, when there is one. */
  tightest?: Slot
}

export type SuggestionResult =
  | { status: 'rebus' }
  | {
      status: 'ok'
      /** Every entry that fits, before `limit`. */
      total: number
      /** How many of those leave every crossing at least one option. */
      viable: number
      suggestions: Suggestion[]
    }

export interface SuggestOptions {
  /** Ignore entries scoring below this, both as candidates and when counting crossings. */
  minScore: number
  /** Most suggestions to return. */
  limit: number
}

/**
 * Rank the entries that could fill `slot`: everything that fits its committed letters and
 * isn't already used elsewhere in the grid, with entries that would strand a crossing sunk to
 * the bottom and the rest ordered by score.
 *
 * Checking crossings is cheap because the answer depends only on which letter lands in each
 * open square — so it is worked out at most once per square per letter, however many
 * candidates share that letter.
 */
export function suggest(
  list: WordList,
  numbering: Numbering,
  slot: Slot,
  { minScore, limit }: SuggestOptions,
): SuggestionResult {
  if (hasRebus(slot.letters)) return { status: 'rebus' }

  const used = new Set(
    numbering.slots.filter((s) => s.complete && s.key !== slot.key).map((s) => s.answer),
  )

  const checks = slot.cells.flatMap((cell, i) => {
    if (slot.letters[i]) return []
    const cross = crossingSlot(numbering, cell, slot.dir)
    // A rebus in the crossing makes it unmatchable; don't let it veto every candidate.
    if (!cross || hasRebus(cross.letters)) return []
    return [{ i, cross, at: cross.cells.indexOf(cell), counts: new Map<string, number>() }]
  })

  const scored: Suggestion[] = []
  for (const candidate of list.matches(slot.letters, minScore)) {
    if (used.has(candidate.word)) continue

    let crossOptions = Infinity
    let tightest: Slot | undefined
    for (const check of checks) {
      const ch = candidate.word[check.i] ?? ''
      let n = check.counts.get(ch)
      if (n === undefined) {
        const squares = [...check.cross.letters]
        squares[check.at] = ch
        n = list.count(squares, minScore)
        check.counts.set(ch, n)
      }
      if (n < crossOptions) {
        crossOptions = n
        tightest = check.cross
      }
    }
    scored.push({ ...candidate, crossOptions, tightest })
  }

  scored.sort(
    (a, b) =>
      Number(b.crossOptions > 0) - Number(a.crossOptions > 0) ||
      b.score - a.score ||
      b.crossOptions - a.crossOptions,
  )

  return {
    status: 'ok',
    total: scored.length,
    viable: scored.filter((s) => s.crossOptions > 0).length,
    suggestions: scored.slice(0, limit),
  }
}
