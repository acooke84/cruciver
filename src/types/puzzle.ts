/** A single square in the grid. A block is a black square; otherwise it holds a letter. */
export interface Cell {
  block: boolean
  /**
   * Uppercase A-Z / 0-9, or '' when empty. Normally one character; a rebus square holds up to
   * `MAX_CELL_LETTERS` of them.
   */
  letter: string
  /**
   * The letter was pencilled in by autofill: shown differently, and fair game for the next
   * autofill run until it's accepted (or typed over), which makes it ordinary ink.
   */
  pencil?: boolean
  /** Protected from typing, clearing and autofill — for theme entries. Only set on filled squares. */
  locked?: boolean
}

export type Direction = 'A' | 'D'

export interface Puzzle {
  id: string
  title: string
  author: string
  rows: number
  cols: number
  /** When true, toggling a block mirrors it through 180° rotational symmetry. */
  symmetry: boolean
  /** Row-major, length rows * cols. */
  grid: Cell[]
  /**
   * Clue text keyed by slot start position rather than clue number, because numbers are
   * derived and shift whenever a block moves. Key format: `A:row,col` / `D:row,col`.
   */
  clues: Record<string, string>
  createdAt: string
  updatedAt: string
}

/** Lightweight record used by the home screen so it need not parse every full puzzle. */
export interface PuzzleSummary {
  id: string
  title: string
  author: string
  rows: number
  cols: number
  updatedAt: string
  createdAt: string
  /** 0-1, share of slots that are completely filled. */
  progress: number
  /** Row-major booleans for the thumbnail: true = block. */
  blocks: boolean[]
}

/** A contiguous run of two or more white cells — one across or down entry. */
export interface Slot {
  /** `A:row,col` / `D:row,col`. Stable across renumbering. */
  key: string
  number: number
  dir: Direction
  row: number
  col: number
  /** Grid indices of every cell in the slot, in reading order. */
  cells: number[]
  /** Current contents per cell, with '' for empty cells and 2+ characters for a rebus. */
  letters: string[]
  /** Letters joined, with '.' standing in for each empty cell. */
  pattern: string
  /** Letters joined with empties dropped — only meaningful when `complete`. */
  answer: string
  /** Number of squares. This is what the minimum-entry-length rule measures. */
  length: number
  /** Number of characters the answer spells, counting an empty square as one. Differs from
   * `length` only when the entry runs through a rebus square. */
  letterCount: number
  complete: boolean
}

export interface Numbering {
  slots: Slot[]
  /** Grid index -> clue number, for cells that start at least one slot. */
  numbers: Map<number, number>
  /** Grid index -> the slots that pass through it. */
  byCell: Map<number, Slot[]>
  /** Slot key -> slot. */
  byKey: Map<string, Slot>
}

export type Severity = 'error' | 'warning'

export interface Problem {
  severity: Severity
  message: string
  /** Present when the problem is attached to a specific entry. */
  slotKey?: string
  /** Present when the problem is attached to a specific square. */
  cellIndex?: number
}

export type Mode = 'structure' | 'content'
