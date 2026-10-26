import { useSyncExternalStore } from 'react'
import { MAX_SIZE } from '../lib/grid'
import { MIN_ENTRY_LENGTH } from '../lib/validation'
import { isValidEntry, type WordOverrides } from '../lib/wordlist'

/** Score given to a word added without one — middling, so it's usable but not preferred. */
export const DEFAULT_OVERRIDE_SCORE = 50

const KEY = 'cruciver:wordOverrides'

/** Uppercase with spaces dropped, so "ice age" and "ICEAGE" name the same entry. */
export function normalizeWord(input: string): string {
  return input.replace(/\s+/g, '').toUpperCase()
}

/** Why `word` (already normalized) can't be in the list, or null when it can. */
export function wordProblem(word: string): string | null {
  if (word === '') return 'Type a word first.'
  if (!/^[A-Z0-9]+$/.test(word)) return 'Only letters A–Z and digits can go in a grid.'
  if (word.length < MIN_ENTRY_LENGTH) return `Entries need at least ${MIN_ENTRY_LENGTH} letters.`
  if (word.length > MAX_SIZE) return `Entries can't be longer than ${MAX_SIZE} letters.`
  return null
}

function read(): WordOverrides {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    if (typeof raw !== 'object' || raw === null) return {}
    // Drop anything malformed rather than let one bad entry lose the rest.
    const clean: Record<string, number | 'banned'> = {}
    for (const [word, value] of Object.entries(raw)) {
      if (!isValidEntry(word)) continue
      if (value === 'banned') clean[word] = value
      else if (typeof value === 'number' && value >= 0 && value <= 100)
        clean[word] = Math.round(value)
    }
    return clean
  } catch {
    return {}
  }
}

/* One copy for the whole page, remembered per browser. Replaced, never mutated, on change. */
let overrides = read()
const listeners = new Set<() => void>()

function save(next: WordOverrides) {
  overrides = next
  localStorage.setItem(KEY, JSON.stringify(overrides))
  for (const listener of listeners) listener()
}

/**
 * Give `word` a score of its own (adding it if the list lacks it) or ban it from suggestions
 * and autofill. `word` should be normalized and valid; anything else is ignored.
 */
export function setWordOverride(word: string, value: number | 'banned') {
  if (wordProblem(word)) return
  save({
    ...overrides,
    [word]: value === 'banned' ? value : Math.max(0, Math.min(100, Math.round(value))),
  })
}

/** Go back to the base list's judgement of `word`. */
export function removeWordOverride(word: string) {
  if (!(word in overrides)) return
  const next = { ...overrides }
  delete next[word]
  save(next)
}

/** The current overrides, for code outside React (the word list engine). */
export function getWordOverrides(): WordOverrides {
  return overrides
}

export function subscribeWordOverrides(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useWordOverrides(): WordOverrides {
  return useSyncExternalStore(subscribeWordOverrides, () => overrides)
}
