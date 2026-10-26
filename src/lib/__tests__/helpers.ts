import type { Puzzle } from '../../types/puzzle'

/**
 * Build a puzzle from an ASCII sketch: `#` is a block, `.` is an empty square, and any
 * letter is a filled square. One string per row.
 */
export function puzzleFrom(rows: string[], overrides: Partial<Puzzle> = {}): Puzzle {
  const height = rows.length
  const width = rows[0]?.length ?? 0
  if (rows.some((r) => r.length !== width)) throw new Error('ragged test grid')

  return {
    id: 'test',
    title: 'Test',
    author: '',
    rows: height,
    cols: width,
    symmetry: false,
    grid: rows.flatMap((row) =>
      [...row].map((ch) => ({
        block: ch === '#',
        letter: ch === '#' || ch === '.' ? '' : ch.toUpperCase(),
      })),
    ),
    clues: {},
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}
