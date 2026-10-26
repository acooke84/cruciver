import { useCallback, useEffect, useRef } from 'react'
import type { Direction, Mode, Numbering, Puzzle } from '../types/puzzle'
import { Cell } from './Cell'

interface GridProps {
  puzzle: Puzzle
  numbering: Numbering
  mode: Mode
  selected: number | null
  direction: Direction
  /** Cell index -> the error messages that apply to it, used to mark and explain squares. */
  flags: Map<number, string[]>
  /** Cell index -> a previewed letter, shown pencilled in over empty squares. */
  ghost: Map<number, string>
  /** Cell index -> letters still workable there, for squares with very few (see troubleSpots). */
  trouble: Map<number, number>
  /** Squares selected for a region autofill. */
  region: ReadonlySet<number>
  onSelect: (index: number) => void
  /**
   * Shift+click (`start`) or Shift+drag (`extend`) to the square at `index`, growing the
   * autofill region; `clear` on a plain click, which drops it.
   */
  onRegion: (action: 'start' | 'extend' | 'clear', index: number) => void
  /** `startOfStroke` marks the first cell of a drag so it becomes one undo step. */
  onPaint: (index: number, block: boolean, startOfStroke: boolean) => void
  onKeyDown: (event: React.KeyboardEvent) => void
}

/** Keep the whole grid on screen without scrolling for common sizes. */
function cellSize(cols: number, rows: number): number {
  const largest = Math.max(cols, rows)
  if (largest <= 5) return 62
  if (largest <= 7) return 54
  if (largest <= 9) return 46
  if (largest <= 11) return 42
  if (largest <= 15) return 34
  return 26
}

export function Grid({
  puzzle,
  numbering,
  mode,
  selected,
  direction,
  flags,
  ghost,
  trouble,
  region,
  onSelect,
  onRegion,
  onPaint,
  onKeyDown,
}: GridProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  /** While painting blocks, every cell dragged over is set to this value. */
  const paintValue = useRef<boolean | null>(null)
  /** True while a Shift+drag is stretching the autofill region. */
  const regionDrag = useRef(false)

  useEffect(() => {
    const stop = () => {
      paintValue.current = null
      regionDrag.current = false
    }
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    return () => {
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
  }, [])

  // Keep keyboard entry working after clicking a clue or a toolbar button.
  useEffect(() => {
    if (mode === 'content' && selected !== null) containerRef.current?.focus()
  }, [mode, selected])

  const handlePointerDown = useCallback(
    (index: number, event: React.PointerEvent) => {
      event.preventDefault()
      containerRef.current?.focus()

      if (mode === 'structure') {
        const next = !puzzle.grid[index]?.block
        paintValue.current = next
        onPaint(index, next, true)
      } else if (event.shiftKey) {
        // Shift marks out a region to autofill and leaves the selection where it is.
        regionDrag.current = true
        onRegion('start', index)
      } else {
        onRegion('clear', index)
        onSelect(index)
      }
    },
    [mode, puzzle.grid, onPaint, onSelect, onRegion],
  )

  const handlePointerEnter = useCallback(
    (index: number) => {
      if (mode === 'content' && regionDrag.current) return onRegion('extend', index)
      if (mode !== 'structure' || paintValue.current === null) return
      if (puzzle.grid[index]?.block === paintValue.current) return
      onPaint(index, paintValue.current, false)
    },
    [mode, puzzle.grid, onPaint, onRegion],
  )

  const size = cellSize(puzzle.cols, puzzle.rows)
  const activeSlot =
    selected === null ? undefined : numbering.byCell.get(selected)?.find((s) => s.dir === direction)
  const wordCells = new Set(activeSlot?.cells ?? [])

  return (
    <div
      ref={containerRef}
      role="grid"
      aria-label={`${puzzle.title} grid, ${puzzle.rows} by ${puzzle.cols}`}
      tabIndex={0}
      className="xw"
      onKeyDown={onKeyDown}
      style={{
        gridTemplateColumns: `repeat(${puzzle.cols}, ${size}px)`,
        gridTemplateRows: `repeat(${puzzle.rows}, ${size}px)`,
        fontSize: `${size}px`,
      }}
    >
      {puzzle.grid.map((cell, index) => (
        <Cell
          key={index}
          index={index}
          block={cell.block}
          letter={cell.letter}
          pencil={cell.pencil === true}
          locked={cell.locked === true}
          ghost={ghost.get(index)}
          trouble={mode === 'content' ? trouble.get(index) : undefined}
          number={numbering.numbers.get(index)}
          mode={mode}
          selected={selected === index && mode === 'content'}
          inWord={wordCells.has(index)}
          inRegion={mode === 'content' && region.has(index)}
          problems={flags.get(index)}
          onPointerDown={handlePointerDown}
          onPointerEnter={handlePointerEnter}
        />
      ))}
    </div>
  )
}
