import { MAX_SIZE } from './grid'
import { MIN_ENTRY_LENGTH } from './validation'

/** Grid squares hold A-Z or 0-9, so those are the only characters an entry can contain. */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
export const ALPHABET_SIZE = ALPHABET.length

const VALID_ENTRY = /^[A-Z0-9]+$/

/** Index of a character in the alphabet (A-Z are 0-25, digits follow), or -1. */
export function charCode(ch: string): number {
  const c = ch.charCodeAt(0)
  if (c >= 65 && c <= 90) return c - 65
  if (c >= 48 && c <= 57) return c - 48 + 26
  return -1
}

export interface WordInfo {
  word: string
  /** 0-100, the base list's quality judgement. */
  score: number
  /** Times the entry turned up in the Rex Parker corpus of NYT puzzles; 0 when never. */
  seen: number
}

/**
 * Every entry of one length, best first. Sorting by score descending means "everything scoring
 * at least N" is always a prefix, so a minimum score is just a cut-off index.
 */
export interface Bucket {
  words: string[]
  scores: Uint8Array
  seen: Uint16Array
  /**
   * `bits[position * ALPHABET_SIZE + char]` has bit i set when word i has that character at
   * that position. Absent when no word does.
   */
  bits: (Uint32Array | undefined)[]
}

/**
 * Per-square constraints for an entry, in the shape of `Slot.letters`: '' for an open square,
 * one character for a filled one. Rebus squares (2+ characters) aren't supported by the index;
 * check with `hasRebus` first.
 */
export type Squares = readonly string[]

export function hasRebus(squares: Squares): boolean {
  return squares.some((s) => s.length > 1)
}

/** A built index in a form that can be posted between threads. */
export interface WordListData {
  size: number
  buckets: [length: number, bucket: Bucket][]
}

/**
 * Indexed scored word list, answering "which entries fit this pattern" with bitset ANDs.
 *
 * Building one from the full list takes about a second, so the app does it in a worker and
 * posts the result back with `toData` / `fromData`; queries are then fast enough to run
 * synchronously on every selection change.
 */
export class WordList {
  private constructor(
    readonly size: number,
    private readonly buckets: Map<number, Bucket>,
  ) {}

  /**
   * Parse `WORD;score` or `WORD;score;seen` lines. Entries that can't go in a grid (wrong
   * length, characters other than A-Z/0-9) are dropped; duplicates keep their best score.
   */
  static parse(text: string): WordList {
    const best = new Map<string, WordInfo>()
    for (const line of text.split('\n')) {
      const [raw = '', rawScore = '', rawSeen = ''] = line.split(';')
      const word = raw.trim().toUpperCase()
      if (word.length < MIN_ENTRY_LENGTH || word.length > MAX_SIZE) continue
      if (!VALID_ENTRY.test(word)) continue

      const score = Math.max(0, Math.min(100, Math.round(Number(rawScore) || 0)))
      const seen = Math.max(0, Math.round(Number(rawSeen) || 0))
      const existing = best.get(word)
      if (!existing || score > existing.score) best.set(word, { word, score, seen })
    }
    return WordList.fromEntries([...best.values()])
  }

  /** Index entries that are already valid and unique. */
  static fromEntries(entries: WordInfo[]): WordList {
    const byLength = new Map<number, WordInfo[]>()
    for (const entry of entries) {
      const list = byLength.get(entry.word.length)
      if (list) list.push(entry)
      else byLength.set(entry.word.length, [entry])
    }

    const buckets = new Map<number, Bucket>()
    for (const [length, list] of byLength) {
      list.sort((a, b) => b.score - a.score || (a.word < b.word ? -1 : 1))
      const blocks = Math.ceil(list.length / 32)
      const bucket: Bucket = {
        words: list.map((e) => e.word),
        scores: Uint8Array.from(list, (e) => e.score),
        seen: Uint16Array.from(list, (e) => Math.min(e.seen, 0xffff)),
        bits: new Array<Uint32Array | undefined>(length * ALPHABET_SIZE).fill(undefined),
      }

      list.forEach((entry, i) => {
        for (let p = 0; p < length; p++) {
          const slot = p * ALPHABET_SIZE + charCode(entry.word[p] ?? '')
          const bits = (bucket.bits[slot] ??= new Uint32Array(blocks))
          bits[i >>> 5]! |= 1 << (i & 31)
        }
      })
      buckets.set(length, bucket)
    }

    return new WordList(entries.length, buckets)
  }

  static fromData(data: WordListData): WordList {
    return new WordList(data.size, new Map(data.buckets))
  }

  /** The index plus the buffers to transfer (rather than copy) when posting it. */
  toData(): { data: WordListData; transfer: ArrayBuffer[] } {
    const transfer: ArrayBuffer[] = []
    for (const bucket of this.buckets.values()) {
      transfer.push(bucket.scores.buffer as ArrayBuffer, bucket.seen.buffer as ArrayBuffer)
      for (const bits of bucket.bits) if (bits) transfer.push(bits.buffer as ArrayBuffer)
    }
    return { data: { size: this.size, buckets: [...this.buckets] }, transfer }
  }

  /** The entry spelled exactly `word`, if listed at all. */
  lookup(word: string): WordInfo | undefined {
    return this.matches([...word.toUpperCase()])[0]
  }

  /** Raw index for one length — for the autofill search, which works on bitsets directly. */
  bucket(length: number): Readonly<Bucket> | undefined {
    return this.buckets.get(length)
  }

  /**
   * Bitset of the words fitting `squares` with at least `minScore`, or undefined when nothing
   * of that length exists. Bits beyond the score cut-off are always clear.
   */
  match(squares: Squares, minScore: number): Uint32Array | undefined {
    const bucket = this.buckets.get(squares.length)
    if (!bucket || hasRebus(squares)) return undefined

    const limit = cutoff(bucket.scores, minScore)
    const blocks = Math.ceil(limit / 32)
    const result = new Uint32Array(blocks).fill(0xffffffff)

    for (let p = 0; p < squares.length; p++) {
      const ch = squares[p]
      if (!ch) continue
      const code = charCode(ch)
      const bits = code < 0 ? undefined : bucket.bits[p * ALPHABET_SIZE + code]
      if (!bits) return new Uint32Array(0)
      for (let b = 0; b < blocks; b++) result[b]! &= bits[b]!
    }

    // Clear the bits past the cut-off in the final, partially used block.
    const tail = limit & 31
    if (tail && blocks > 0) result[blocks - 1]! &= (1 << tail) - 1
    return result
  }

  /** How many entries fit `squares` with at least `minScore`. */
  count(squares: Squares, minScore = 0): number {
    const bits = this.match(squares, minScore)
    if (!bits) return 0
    let n = 0
    for (let b = 0; b < bits.length; b++) n += popcount(bits[b]!)
    return n
  }

  /**
   * Visit entries fitting `squares` with at least `minScore`, best first, until `visit` returns
   * false. Cheaper than `matches` when only the first few are wanted.
   */
  forEachMatch(
    squares: Squares,
    minScore: number,
    visit: (word: string, score: number, seen: number) => boolean | void,
  ): void {
    const bucket = this.buckets.get(squares.length)
    const bits = this.match(squares, minScore)
    if (!bucket || !bits) return

    for (let b = 0; b < bits.length; b++) {
      let block = bits[b]!
      while (block !== 0) {
        const low = block & -block
        const i = (b << 5) + 31 - Math.clz32(low)
        if (visit(bucket.words[i]!, bucket.scores[i]!, bucket.seen[i]!) === false) return
        block ^= low
      }
    }
  }

  /** Entries fitting `squares` with at least `minScore`, best first. */
  matches(squares: Squares, minScore = 0): WordInfo[] {
    const out: WordInfo[] = []
    this.forEachMatch(squares, minScore, (word, score, seen) => {
      out.push({ word, score, seen })
    })
    return out
  }
}

/** Number of leading entries scoring at least `minScore`, given scores sorted descending. */
function cutoff(scores: Uint8Array, minScore: number): number {
  let lo = 0
  let hi = scores.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (scores[mid]! >= minScore) lo = mid + 1
    else hi = mid
  }
  return lo
}

function popcount(n: number): number {
  n = n - ((n >>> 1) & 0x55555555)
  n = (n & 0x33333333) + ((n >>> 2) & 0x33333333)
  return (((n + (n >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24
}
