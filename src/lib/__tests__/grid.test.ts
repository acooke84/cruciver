import { describe, expect, it } from 'vitest'
import {
  MAX_CELL_LETTERS,
  acceptPencil,
  clearLetters,
  clearPencil,
  hasPencil,
  setLocked,
  writePencil,
  MIN_SIZE,
  fillEntry,
  isSymmetric,
  makeSymmetric,
  mirrorIndex,
  normalizeCellText,
  resizeGrid,
  setBlock,
  setCellText,
} from '../grid'
import { puzzleFrom } from './helpers'

describe('mirrorIndex', () => {
  it('maps a cell to its 180° partner', () => {
    // 3x3: top-left <-> bottom-right, centre maps to itself.
    expect(mirrorIndex(0, 3, 3)).toBe(8)
    expect(mirrorIndex(4, 3, 3)).toBe(4)
    expect(mirrorIndex(2, 3, 3)).toBe(6)
  })
})

describe('setBlock', () => {
  it('mirrors the change when symmetry is on', () => {
    const puzzle = puzzleFrom(['...', '...', '...'], { symmetry: true })
    const grid = setBlock(puzzle, 0, true)
    expect(grid[0]?.block).toBe(true)
    expect(grid[8]?.block).toBe(true)
  })

  it('leaves the partner alone when symmetry is off', () => {
    const puzzle = puzzleFrom(['...', '...', '...'], { symmetry: false })
    const grid = setBlock(puzzle, 0, true)
    expect(grid[0]?.block).toBe(true)
    expect(grid[8]?.block).toBe(false)
  })

  it('clears the letter of a square that becomes a block', () => {
    const puzzle = puzzleFrom(['abc', 'def', 'ghi'])
    expect(setBlock(puzzle, 4, true)[4]).toEqual({ block: true, letter: '' })
  })
})

describe('normalizeCellText', () => {
  it('keeps letters and digits, uppercased', () => {
    expect(normalizeCellText('heart')).toBe('HEART')
    expect(normalizeCellText('one1')).toBe('ONE1')
  })

  it('drops spaces and punctuation', () => {
    expect(normalizeCellText(' t-w o! ')).toBe('TWO')
  })

  it('caps a rebus at the maximum square length', () => {
    expect(normalizeCellText('a'.repeat(MAX_CELL_LETTERS + 4))).toHaveLength(MAX_CELL_LETTERS)
  })
})

describe('setCellText', () => {
  it('uppercases and refuses to write into a block', () => {
    const puzzle = puzzleFrom(['.#.', '...', '...'])
    expect(setCellText(puzzle, 0, 'q')[0]?.letter).toBe('Q')
    expect(setCellText(puzzle, 1, 'q')[1]?.letter).toBe('')
  })

  it('stores a whole word in one square for a rebus', () => {
    const puzzle = puzzleFrom(['...', '...', '...'])
    expect(setCellText(puzzle, 4, 'heart')[4]).toEqual({ block: false, letter: 'HEART' })
  })

  it('clears a square when given empty text', () => {
    const puzzle = puzzleFrom(['abc', 'def', 'ghi'])
    expect(setCellText(puzzle, 0, '')[0]?.letter).toBe('')
  })
})

describe('fillEntry', () => {
  it('writes one character per square and leaves the rest of the grid alone', () => {
    const puzzle = puzzleFrom(['c..', '...', 'xyz'])
    const grid = fillEntry(puzzle, [0, 1, 2], 'CAT')
    expect(grid.slice(0, 3).map((c) => c.letter)).toEqual(['C', 'A', 'T'])
    expect(grid.slice(6).map((c) => c.letter)).toEqual(['X', 'Y', 'Z'])
    expect(puzzle.grid[1]?.letter).toBe('')
  })
})

describe('pencil and lock', () => {
  it('pencils only into empty or already-pencilled squares', () => {
    const puzzle = puzzleFrom(['ab.', '...', '...'])
    puzzle.grid[3] = { block: false, letter: 'Q', pencil: true }
    const grid = writePencil(puzzle, [
      [0, 'X'], // typed — kept
      [2, 'C'], // empty — pencilled
      [3, 'D'], // pencilled — replaced
    ])
    expect(grid[0]).toEqual({ block: false, letter: 'A' })
    expect(grid[2]).toEqual({ block: false, letter: 'C', pencil: true })
    expect(grid[3]).toEqual({ block: false, letter: 'D', pencil: true })
  })

  it('keeps or erases pencil without touching ink', () => {
    const puzzle = puzzleFrom(['a..', '...', '...'])
    puzzle.grid = writePencil(puzzle, [[1, 'B']])
    expect(hasPencil(puzzle)).toBe(true)

    const kept = acceptPencil(puzzle)
    expect(kept[1]).toEqual({ block: false, letter: 'B' })
    const erased = clearPencil(puzzle)
    expect(erased[1]?.letter).toBe('')
    expect(erased[0]?.letter).toBe('A')
  })

  it('erases pencil only in the given squares', () => {
    const puzzle = puzzleFrom(['a..', '...', '...'])
    puzzle.grid = writePencil(puzzle, [
      [1, 'B'],
      [2, 'C'],
      [4, 'D'],
    ])
    const erased = clearPencil(puzzle, [0, 1, 4])
    expect(erased[0]).toEqual({ block: false, letter: 'A' })
    expect(erased[1]).toEqual({ block: false, letter: '' })
    expect(erased[2]).toEqual({ block: false, letter: 'C', pencil: true })
    expect(erased[4]).toEqual({ block: false, letter: '' })
  })

  it('protects locked squares from typing, filling and clearing', () => {
    const puzzle = puzzleFrom(['abc', '...', '...'])
    puzzle.grid = setLocked(puzzle, [0, 1, 2], true)

    expect(setCellText(puzzle, 0, 'z')[0]?.letter).toBe('A')
    expect(fillEntry(puzzle, [0, 1, 2], 'XYZ').slice(0, 3).map((c) => c.letter)).toEqual(['A', 'B', 'C'])
    expect(writePencil(puzzle, [[0, 'Q']])[0]?.letter).toBe('A')
    expect(clearLetters(puzzle).slice(0, 3).map((c) => c.letter)).toEqual(['A', 'B', 'C'])
  })

  it('locks only filled squares, and unlocks back to ink', () => {
    const puzzle = puzzleFrom(['a..', '...', '...'])
    puzzle.grid = writePencil(puzzle, [[1, 'B']])
    const locked = setLocked(puzzle, [0, 1, 2], true)
    expect(locked[0]).toEqual({ block: false, letter: 'A', locked: true })
    // Locking a pencilled letter inks it.
    expect(locked[1]).toEqual({ block: false, letter: 'B', locked: true })
    expect(locked[2]).toEqual({ block: false, letter: '' })

    const unlocked = setLocked({ ...puzzle, grid: locked }, [0, 1], false)
    expect(unlocked[0]).toEqual({ block: false, letter: 'A' })
  })
})

describe('resizeGrid', () => {
  it('keeps overlapping cells when growing, anchored top-left', () => {
    const puzzle = puzzleFrom(['ab', 'c#'])
    const grid = resizeGrid(puzzle, 3, 3)

    expect(grid).toHaveLength(9)
    expect(grid[0]?.letter).toBe('A')
    expect(grid[1]?.letter).toBe('B')
    expect(grid[3]?.letter).toBe('C')
    expect(grid[4]?.block).toBe(true)
    expect(grid[8]).toEqual({ block: false, letter: '' })
  })

  it('drops cells that fall outside when shrinking', () => {
    const puzzle = puzzleFrom(['abcd', 'efgh', 'ijkl', 'mnop'])
    const grid = resizeGrid(puzzle, 3, 3)

    expect(grid).toHaveLength(9)
    expect(grid.map((c) => c.letter)).toEqual([...'ABC', ...'EFG', ...'IJK'])
  })

  it('refuses to shrink below the minimum size', () => {
    const puzzle = puzzleFrom(['abc', 'def', 'ghi'])
    expect(resizeGrid(puzzle, 1, 1)).toHaveLength(MIN_SIZE * MIN_SIZE)
  })
})

describe('symmetry helpers', () => {
  it('detects an asymmetric grid', () => {
    expect(isSymmetric(puzzleFrom(['#..', '...', '...']))).toBe(false)
    expect(isSymmetric(puzzleFrom(['#..', '...', '..#']))).toBe(true)
  })

  it('repairs a grid by unioning each block with its partner', () => {
    const puzzle = puzzleFrom(['#..', '...', '...'])
    const repaired = makeSymmetric(puzzle)
    expect(repaired[0]?.block).toBe(true)
    expect(repaired[8]?.block).toBe(true)
    expect(isSymmetric({ ...puzzle, grid: repaired })).toBe(true)
  })
})
