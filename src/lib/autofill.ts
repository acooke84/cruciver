import type { Puzzle } from '../types/puzzle'
import { computeNumbering } from './slots'
import { ALPHABET_SIZE, charCode, hasRebus, type Bucket, type WordList } from './wordlist'

export interface FillOptions {
  /** Only entries scoring at least this go in. */
  minScore: number
  /** Drives tie-breaks and candidate jitter, so a different seed finds a different fill. */
  seed: number
  /** Give up after this many words have been tried. */
  maxSteps?: number
  /**
   * Grid squares to fill; the whole grid when absent. Everything outside stays as it is —
   * pencil included — and constrains the fill. Only entries with an open square inside are
   * searched, and only squares inside are reported.
   */
  region?: number[]
}

export type FillOutcome =
  | {
      status: 'filled'
      /** Squares to pencil in: [grid index, letter]. */
      letters: [number, string][]
      /** Entries that were open and are now filled. */
      entries: number
      steps: number
    }
  /** The grid can't be filled as it stands; `slotKey` is the entry that ran out of options. */
  | { status: 'stuck'; slotKey: string; steps: number }
  /** Every combination was ruled out. `hardest` is the entry that failed most often. */
  | { status: 'exhausted'; hardest?: string; steps: number }
  | { status: 'budget'; hardest?: string; steps: number }

const DEFAULT_MAX_STEPS = 50_000
/** Most candidates tried per entry; the domain is walked best first, so these are the best. */
const MAX_CANDIDATES = 60
/** Random points added to each candidate's score, so reruns explore different fills. */
const JITTER = 10
/**
 * Dead ends before the first restart. Search times are heavy-tailed — the same grid can take
 * a hundred steps or a hundred thousand depending on early choices — so restarting early and
 * often, allowing a little more each time, beats digging deeper. Tuned on hard 11×11 and
 * 15×15 grids with stacked long entries.
 */
const FIRST_RESTART = 20
const RESTART_GROWTH = 1.2
/**
 * Entries with more candidates than this skip the letter-support check: with that many words
 * nearly every letter is supported anyway, and the check reads every one of them. They're
 * checked as soon as pruning brings them under the limit.
 */
const SUPPORT_LIMIT = 1_000

/** Open squares only ever take A-Z, so a square's possible letters fit in one 26-bit mask. */
const LETTERS = 26
const ALL_LETTERS = (1 << LETTERS) - 1

interface SearchSlot {
  key: string
  cells: number[]
  bucket: Readonly<Bucket>
  /** Bit i set while word i of the bucket still fits. */
  domain: Uint32Array
  count: number
  /** True once a word has been chosen for it. */
  assigned: boolean
}

/** State changes, recorded so a backtrack can roll them back exactly. */
type TrailEntry =
  | { kind: 'mask'; cell: number; mask: number }
  | { kind: 'domain'; slot: number; domain: Uint32Array; count: number; stamp: number }
  | { kind: 'assign'; slot: number; word: string }

interface Frame {
  slot: number
  /** Word indices into the slot's bucket, in the order to try them. */
  candidates: number[]
  next: number
  /** Trail length when the frame was pushed — undoing to here clears its current attempt. */
  mark: number
}

const EMPTY_BUCKET: Bucket = { words: [], scores: new Uint8Array(0), seen: new Uint16Array(0), bits: [] }

/** Small, fast, seedable PRNG (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function popcount(n: number): number {
  n = n - ((n >>> 1) & 0x55555555)
  n = (n & 0x33333333) + ((n >>> 2) & 0x33333333)
  return (((n + (n >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24
}

function countBits(bits: Uint32Array): number {
  let n = 0
  for (let b = 0; b < bits.length; b++) n += popcount(bits[b]!)
  return n
}

/** Lowest set bit's position. */
const lowBit = (m: number) => 31 - Math.clz32(m & -m)

/**
 * Fill every open square of a grid from the word list — a constraint search in the spirit of
 * wave function collapse:
 *
 * - **Superposition.** Every open square holds the set of letters it could still take, and
 *   every entry the set of words (a bitset over the word list) that still fit.
 * - **Propagate.** When a square loses a letter, each entry through it drops the words using
 *   that letter there; any letter an entry can no longer support is then removed from its
 *   squares in turn, rippling outward until nothing changes (arc consistency).
 * - **Collapse the most constrained entry first** — fewest fitting words, weighted by how
 *   often it has caused trouble before (dom/wdeg) — trying its best-scoring words in turn.
 * - **Backtrack** when propagation empties an entry, and **restart** with fresh jitter after
 *   a growing number of dead ends. The trouble weights carry over, so each restart tackles
 *   the hard corners earlier.
 *
 * Typed letters are fixed; pencilled ones are treated as open, so rerunning replaces an
 * earlier fill. Entries through a rebus square are left out, and no entry is used twice.
 *
 * With a `region`, only pencil inside it counts as open, and only entries with an open square
 * inside it are searched. Open squares outside that those entries cross are still solved for
 * — the entry has to be a real word — but aren't reported, and entries wholly outside aren't
 * checked, so they may be left harder (or impossible) to fill.
 *
 * The search runs in slices via `run`, so a worker can report progress and stay cancellable.
 */
export class FillSearch {
  private readonly minScore: number
  private readonly maxSteps: number
  private readonly random: () => number
  /** Squares that may be reported; null for the whole grid. */
  private readonly region: Set<number> | null

  private readonly slots: SearchSlot[] = []
  /** Grid square -> [slot index, position in slot] for each search slot through it. */
  private readonly slotsAt = new Map<number, [number, number][]>()
  /** Possible letters per open square; 0 for blocks and typed squares. */
  private readonly masks: Int32Array
  private readonly weights: number[]
  /** Words in the grid, with multiplicity, so none is used twice. */
  private readonly used = new Map<string, number>()
  /** Which attempt last saved each slot's domain, so it's copied at most once per attempt. */
  private readonly savedStamp: number[]
  private readonly queued: boolean[]
  private readonly scratch: Uint32Array
  /** Per position of the entry being checked: the letters its remaining words use there. */
  private readonly support = new Int32Array(32)

  private trail: TrailEntry[] = []
  private stack: Frame[] = []
  private queue: number[] = []
  private stamp = 0
  private baseMark = 0
  /** The entry that emptied during the last failed propagation, or -1. */
  private failed = -1
  private started = false
  private steps = 0
  private wipeouts = 0
  private restartAt = FIRST_RESTART

  constructor(list: WordList, puzzle: Puzzle, options: FillOptions) {
    this.minScore = options.minScore
    this.maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS
    this.random = rng(options.seed)

    this.region = options.region ? new Set(options.region) : null
    const inRegion = (i: number) => !this.region || this.region.has(i)

    const grid = puzzle.grid.map((cell, i) =>
      cell.pencil && inRegion(i) ? { block: false, letter: '' } : cell,
    )
    this.masks = new Int32Array(grid.length)
    grid.forEach((cell, i) => {
      if (!cell.block && cell.letter === '') this.masks[i] = ALL_LETTERS
    })

    let largest = 0
    for (const slot of computeNumbering({ ...puzzle, grid }).slots) {
      if (slot.complete) {
        this.use(slot.answer, 1)
        continue
      }
      if (hasRebus(slot.letters)) continue
      // Entries with nothing to fill in the region are someone else's problem.
      if (!slot.cells.some((cell, at) => slot.letters[at] === '' && inRegion(cell))) continue

      const bucket = list.bucket(slot.length) ?? EMPTY_BUCKET
      const domain = list.match(slot.letters, this.minScore) ?? new Uint32Array(0)
      // Open squares only take letters, so drop entries with a digit where one would go.
      slot.letters.forEach((letter, at) => {
        if (letter) return
        for (let digit = LETTERS; digit < ALPHABET_SIZE; digit++) {
          const bits = bucket.bits[at * ALPHABET_SIZE + digit]
          if (bits) for (let b = 0; b < domain.length; b++) domain[b]! &= ~bits[b]!
        }
      })
      const index = this.slots.length
      this.slots.push({
        key: slot.key,
        cells: slot.cells,
        bucket,
        domain,
        count: countBits(domain),
        assigned: false,
      })
      largest = Math.max(largest, domain.length)
      slot.cells.forEach((cell, at) => {
        const through = this.slotsAt.get(cell)
        if (through) through.push([index, at])
        else this.slotsAt.set(cell, [[index, at]])
      })
    }

    this.weights = this.slots.map(() => 0)
    this.savedStamp = this.slots.map(() => -1)
    this.queued = this.slots.map(() => false)
    this.scratch = new Uint32Array(largest)
  }

  /** Words tried so far. */
  get progress(): number {
    return this.steps
  }

  /** Advance up to `budget` steps. Returns the outcome when finished, null to keep going. */
  run(budget: number): FillOutcome | null {
    if (!this.started) {
      this.started = true
      // An entry nothing fits as it stands is the clearest thing to report, so check first.
      const empty = this.slots.find((slot) => slot.count === 0)
      if (empty) return { status: 'stuck', slotKey: empty.key, steps: 0 }

      this.slots.forEach((_, s) => this.enqueue(s))
      if (!this.propagate()) {
        return { status: 'stuck', slotKey: this.slots[this.failed]!.key, steps: 0 }
      }
      this.baseMark = this.trail.length
      if (!this.descend()) return this.filled()
    }

    for (let n = 0; n < budget; n++) {
      const frame = this.stack[this.stack.length - 1]
      if (!frame) return { status: 'exhausted', hardest: this.hardest(), steps: this.steps }

      this.undoTo(frame.mark)
      if (frame.next >= frame.candidates.length) {
        this.weights[frame.slot]!++
        this.wipeouts++
        this.stack.pop()
        if (this.stack.length === 0) {
          return { status: 'exhausted', hardest: this.hardest(), steps: this.steps }
        }
        if (this.wipeouts >= this.restartAt) this.restart()
        continue
      }

      const word = frame.candidates[frame.next++]!
      if (++this.steps >= this.maxSteps) {
        return { status: 'budget', hardest: this.hardest(), steps: this.steps }
      }
      this.stamp++
      if (!this.assign(frame.slot, word)) {
        // Blame the entry that emptied: that's where the trouble is.
        if (this.failed >= 0) this.weights[this.failed]!++
        continue
      }
      if (!this.descend()) return this.filled()
    }
    return null
  }

  /** Push a frame for the next entry to fill; false when every entry is filled. */
  private descend(): boolean {
    const slot = this.choose()
    if (slot < 0) return false
    this.stack.push({ slot, candidates: this.candidates(slot), next: 0, mark: this.trail.length })
    return true
  }

  private restart() {
    this.undoTo(this.baseMark)
    this.stack = []
    this.wipeouts = 0
    this.restartAt = Math.ceil(this.restartAt * RESTART_GROWTH)
    this.descend()
  }

  private filled(): FillOutcome {
    const letters: [number, string][] = []
    this.masks.forEach((mask, cell) => {
      // One letter left. Squares outside every search slot (beside a rebus) keep a full mask.
      // Squares outside the region were solved only to keep their entries real words.
      if (this.region && !this.region.has(cell)) return
      if (mask !== 0 && (mask & (mask - 1)) === 0) {
        letters.push([cell, String.fromCharCode(65 + lowBit(mask))])
      }
    })
    return { status: 'filled', letters, entries: this.slots.length, steps: this.steps }
  }

  private hardest(): string | undefined {
    let best = -1
    let max = 0
    this.weights.forEach((w, s) => {
      if (w > max) {
        max = w
        best = s
      }
    })
    return best >= 0 ? this.slots[best]!.key : undefined
  }

  private use(word: string, delta: 1 | -1) {
    const n = (this.used.get(word) ?? 0) + delta
    if (n > 0) this.used.set(word, n)
    else this.used.delete(word)
  }

  /** The unfilled entry to collapse next: fewest options relative to its trouble record. */
  private choose(): number {
    let best = -1
    let bestValue = Infinity
    for (let s = 0; s < this.slots.length; s++) {
      const slot = this.slots[s]!
      if (slot.assigned) continue
      // Longer entries break ties: they constrain more of the grid. The jitter breaks the rest.
      const value =
        slot.count / (1 + this.weights[s]!) - slot.cells.length * 1e-3 - this.random() * 1e-4
      if (value < bestValue) {
        bestValue = value
        best = s
      }
    }
    return best
  }

  /** The best still-fitting words for entry `s`, lightly shuffled by jitter. */
  private candidates(s: number): number[] {
    const { domain, bucket } = this.slots[s]!
    const found: { index: number; key: number }[] = []

    outer: for (let b = 0; b < domain.length; b++) {
      let block = domain[b]!
      while (block !== 0) {
        const low = block & -block
        block ^= low
        const index = (b << 5) + 31 - Math.clz32(low)
        const word = bucket.words[index]!
        if (this.used.has(word)) continue
        found.push({ index, key: bucket.scores[index]! + this.random() * JITTER })
        if (found.length >= MAX_CANDIDATES) break outer
      }
    }
    return found.sort((a, b) => b.key - a.key).map((c) => c.index)
  }

  /** Commit word `index` to entry `s` and propagate; false if that empties some entry. */
  private assign(s: number, index: number): boolean {
    const slot = this.slots[s]!
    const word = slot.bucket.words[index]!
    this.failed = -1
    this.trail.push({ kind: 'assign', slot: s, word })
    slot.assigned = true
    this.use(word, 1)

    for (let i = 0; i < slot.cells.length; i++) {
      const cell = slot.cells[i]!
      if (this.masks[cell] === 0) continue
      if (!this.restrict(cell, 1 << charCode(word[i]!), s)) return this.clearQueue()
    }
    return this.propagate()
  }

  /**
   * Narrow a square's possible letters to `allowed`, pruning the domains of the entries through
   * it (other than `except`, which is the one asking). False when an entry is left empty.
   */
  private restrict(cell: number, allowed: number, except: number): boolean {
    const old = this.masks[cell]!
    const next = old & allowed
    if (next === old) return true
    if (next === 0) {
      this.failed = except
      return false
    }
    this.trail.push({ kind: 'mask', cell, mask: old })
    this.masks[cell] = next

    for (const [s, at] of this.slotsAt.get(cell) ?? []) {
      if (s === except || this.slots[s]!.assigned) continue
      this.prune(s, at, next, old & ~next)
      if (this.slots[s]!.count === 0) {
        this.failed = s
        return false
      }
      this.enqueue(s)
    }
    return true
  }

  /**
   * Keep only the words of entry `s` with one of the `keep` letters at position `at` — by
   * intersecting with the kept letters or subtracting the `removed` ones, whichever is fewer.
   */
  private prune(s: number, at: number, keep: number, removed: number) {
    const slot = this.slots[s]!
    this.save(s)
    const { domain, bucket } = slot
    const base = at * ALPHABET_SIZE

    if (popcount(removed) < popcount(keep)) {
      for (let m = removed; m !== 0; m &= m - 1) {
        const bits = bucket.bits[base + lowBit(m)]
        if (!bits) continue
        for (let b = 0; b < domain.length; b++) domain[b]! &= ~bits[b]!
      }
    } else {
      const filter = this.scratch.subarray(0, domain.length)
      filter.fill(0)
      for (let m = keep; m !== 0; m &= m - 1) {
        const bits = bucket.bits[base + lowBit(m)]
        if (!bits) continue
        for (let b = 0; b < domain.length; b++) filter[b]! |= bits[b]!
      }
      for (let b = 0; b < domain.length; b++) domain[b]! &= filter[b]!
    }
    slot.count = countBits(domain)
  }

  /** Snapshot a slot's domain before its first change in this attempt. */
  private save(s: number) {
    if (this.savedStamp[s] === this.stamp) return
    const slot = this.slots[s]!
    this.trail.push({
      kind: 'domain',
      slot: s,
      domain: slot.domain.slice(),
      count: slot.count,
      stamp: this.savedStamp[s]!,
    })
    this.savedStamp[s] = this.stamp
  }

  private enqueue(s: number) {
    if (this.queued[s]) return
    this.queued[s] = true
    this.queue.push(s)
  }

  /**
   * Remove letters that no remaining word supports, until nothing changes. False if an entry
   * empties along the way.
   */
  private propagate(): boolean {
    while (this.queue.length > 0) {
      const s = this.queue.pop()!
      this.queued[s] = false
      const slot = this.slots[s]!
      if (slot.assigned) continue
      if (slot.count === 0) {
        this.failed = s
        return this.clearQueue()
      }
      if (slot.count > SUPPORT_LIMIT) continue

      // Which letters each square can still take, read straight off the remaining words —
      // cheaper than testing every letter's bitset once the domain is this small.
      const supported = this.support.fill(0, 0, slot.cells.length)
      const { domain, bucket } = slot
      for (let b = 0; b < domain.length; b++) {
        for (let block = domain[b]!; block !== 0; block &= block - 1) {
          const word = bucket.words[(b << 5) + lowBit(block)]!
          for (let at = 0; at < word.length; at++) {
            const code = word.charCodeAt(at) - 65
            if (code >= 0 && code < LETTERS) supported[at]! |= 1 << code
          }
        }
      }

      for (let at = 0; at < slot.cells.length; at++) {
        const cell = slot.cells[at]!
        const mask = this.masks[cell]!
        if (mask === 0) continue
        const allowed = mask & supported[at]!
        if (allowed !== mask && !this.restrict(cell, allowed, s)) return this.clearQueue()
      }
    }
    return true
  }

  private clearQueue(): false {
    for (const s of this.queue) this.queued[s] = false
    this.queue = []
    return false
  }

  private undoTo(mark: number) {
    while (this.trail.length > mark) {
      const entry = this.trail.pop()!
      if (entry.kind === 'mask') {
        this.masks[entry.cell] = entry.mask
      } else if (entry.kind === 'domain') {
        const slot = this.slots[entry.slot]!
        slot.domain = entry.domain
        slot.count = entry.count
        this.savedStamp[entry.slot] = entry.stamp
      } else {
        this.slots[entry.slot]!.assigned = false
        this.use(entry.word, -1)
      }
    }
  }
}

/** Run a search to completion in one go — for tests and small grids. */
export function autofill(list: WordList, puzzle: Puzzle, options: FillOptions): FillOutcome {
  const search = new FillSearch(list, puzzle, options)
  for (;;) {
    const outcome = search.run(10_000)
    if (outcome) return outcome
  }
}
