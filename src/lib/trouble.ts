import type { Numbering } from '../types/puzzle'
import { charCode, hasRebus, type WordList } from './wordlist'

/** Squares with this many workable letters or fewer are worth flagging. */
export const TIGHT_LETTERS = 2
/**
 * Entries with more fitting words than this are assumed to allow any letter anywhere. Reading
 * every word of a wide-open entry would be slow and almost never finds anything.
 */
const ENUMERATE_LIMIT = 2_000

const ALL_LETTERS = (1 << 26) - 1

function popcount(n: number): number {
  n = n - ((n >>> 1) & 0x55555555)
  n = (n & 0x33333333) + ((n >>> 2) & 0x33333333)
  return (((n + (n >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24
}

/**
 * Open squares that are close to unfillable: grid index -> how many letters could still go
 * there given the words fitting both entries through it. 0 means nothing works — usually an
 * entry no word fits. Only squares at or under `TIGHT_LETTERS` are included.
 *
 * Every letter on the grid counts, pencilled or not: this is about what's there now.
 */
export function troubleSpots(list: WordList, numbering: Numbering, minScore: number): Map<number, number> {
  /** Grid index -> letters the entries through it allow, for entries narrow enough to read. */
  const allowed = new Map<number, number>()
  const narrow = (cell: number, mask: number) => allowed.set(cell, (allowed.get(cell) ?? ALL_LETTERS) & mask)

  for (const slot of numbering.slots) {
    if (slot.complete || hasRebus(slot.letters)) continue
    const count = list.count(slot.letters, minScore)
    if (count > ENUMERATE_LIMIT) continue

    const masks = new Array<number>(slot.length).fill(0)
    list.forEachMatch(slot.letters, minScore, (word) => {
      for (let i = 0; i < word.length; i++) {
        const code = charCode(word[i]!)
        if (code >= 0 && code < 26) masks[i]! |= 1 << code
      }
    })
    slot.cells.forEach((cell, i) => {
      if (!slot.letters[i]) narrow(cell, masks[i]!)
    })
  }

  const trouble = new Map<number, number>()
  for (const [cell, mask] of allowed) {
    const n = popcount(mask)
    if (n <= TIGHT_LETTERS) trouble.set(cell, n)
  }
  return trouble
}
