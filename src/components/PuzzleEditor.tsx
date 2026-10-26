import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Direction, Mode, Slot } from '../types/puzzle'
import { colOf, idx, rowOf, setBlock, setCellText } from '../lib/grid'
import { navigate } from '../lib/router'
import { usePuzzle, type SaveState } from '../hooks/usePuzzle'
import { useFillSettings } from '../hooks/useFillSettings'
import { useWordList } from '../hooks/useWordList'
import { troubleSpots } from '../lib/trouble'
import { ContentPanel } from './ContentPanel'
import { Grid } from './Grid'
import { ModeTabs } from './ModeTabs'
import { StructurePanel } from './StructurePanel'

const SAVE_LABEL: Record<SaveState, string> = {
  idle: 'Up to date',
  dirty: 'Unsaved changes',
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Save failed',
}

export function PuzzleEditor({ id }: { id: string }) {
  const controller = usePuzzle(id)
  const { puzzle, numbering, problems, stats, update, undo, redo, canUndo, canRedo } = controller
  const wordList = useWordList()
  const { minScore, showTrouble } = useFillSettings()

  const [mode, setMode] = useState<Mode>('structure')
  const [selected, setSelected] = useState<number | null>(null)
  const [direction, setDirection] = useState<Direction>('A')
  /** A suggestion being hovered, to pencil into the active entry's open squares. */
  const [preview, setPreview] = useState<string | null>(null)
  /** Opposite corners of the rectangle marked out for a region autofill. */
  const [regionRect, setRegionRect] = useState<{ anchor: number; corner: number } | null>(null)

  const isWhite = useCallback((index: number) => puzzle?.grid[index]?.block === false, [puzzle])

  /** The entry running through the selected square in the current direction. */
  const activeSlot = useMemo((): Slot | undefined => {
    if (selected === null) return undefined
    const through = numbering.byCell.get(selected)
    return through?.find((s) => s.dir === direction) ?? through?.[0]
  }, [selected, direction, numbering])

  // A preview belongs to the entry and letters it was offered for; any edit makes it stale.
  useEffect(() => setPreview(null), [activeSlot?.key, mode, puzzle?.grid])

  const ghost = useMemo(() => {
    const map = new Map<number, string>()
    if (preview && activeSlot) {
      activeSlot.cells.forEach((cell, i) => {
        const ch = preview[i]
        if (ch) map.set(cell, ch)
      })
    }
    return map
  }, [preview, activeSlot])

  const trouble = useMemo(
    () =>
      wordList.status === 'ready' && showTrouble && mode === 'content'
        ? troubleSpots(wordList.list, numbering, minScore)
        : new Map<number, number>(),
    [wordList, numbering, minScore, showTrouble, mode],
  )

  /** Every non-block square inside the region rectangle, in grid order. */
  const region = useMemo((): number[] => {
    if (!puzzle || !regionRect) return []
    const { cols, grid } = puzzle
    const { anchor, corner } = regionRect
    const r0 = Math.min(rowOf(anchor, cols), rowOf(corner, cols))
    const r1 = Math.max(rowOf(anchor, cols), rowOf(corner, cols))
    const c0 = Math.min(colOf(anchor, cols), colOf(corner, cols))
    const c1 = Math.max(colOf(anchor, cols), colOf(corner, cols))
    const cells: number[] = []
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const i = idx(r, c, cols)
        if (grid[i]?.block === false) cells.push(i)
      }
    }
    return cells
  }, [puzzle, regionRect])
  const regionSet = useMemo(() => new Set(region), [region])

  // A region is only meaningful in Content mode, on the grid it was drawn on.
  useEffect(() => setRegionRect(null), [mode, puzzle?.rows, puzzle?.cols])

  const handleRegion = useCallback(
    (action: 'start' | 'extend' | 'clear', index: number) => {
      if (action === 'clear') {
        setRegionRect(null)
      } else if (action === 'extend') {
        setRegionRect((prev) => (prev ? { ...prev, corner: index } : prev))
      } else {
        // Shift+click stretches from the selected square, like extending a text selection.
        setRegionRect((prev) => ({ anchor: selected ?? prev?.anchor ?? index, corner: index }))
      }
    },
    [selected],
  )

  // Keep the selection on a real square as the grid changes underneath it.
  useEffect(() => {
    if (!puzzle) return
    if (selected !== null && (selected >= puzzle.grid.length || !isWhite(selected))) {
      setSelected(null)
    }
  }, [puzzle, selected, isWhite])

  // Entering Content mode with nothing selected lands on the first open square.
  useEffect(() => {
    if (mode !== 'content' || selected !== null || !puzzle) return
    const first = puzzle.grid.findIndex((c) => !c.block)
    if (first >= 0) setSelected(first)
  }, [mode, selected, puzzle])

  const selectCell = useCallback(
    (index: number) => {
      if (!isWhite(index)) return
      // Clicking the already-selected square flips between Across and Down.
      if (selected === index) setDirection((d) => (d === 'A' ? 'D' : 'A'))
      else setSelected(index)
    },
    [isWhite, selected],
  )

  const selectSlot = useCallback((slot: Slot) => {
    setDirection(slot.dir)
    setSelected(slot.cells[0] ?? null)
    setMode('content')
  }, [])

  const jumpToSlot = useCallback(
    (slotKey: string) => {
      const slot = numbering.byKey.get(slotKey)
      if (slot) selectSlot(slot)
    },
    [numbering, selectSlot],
  )

  const jumpToCell = useCallback(
    (index: number) => {
      if (isWhite(index)) setSelected(index)
    },
    [isWhite],
  )

  const paint = useCallback(
    (index: number, block: boolean, startOfStroke: boolean) =>
      // Only the first cell of a drag opens an undo step, so one stroke undoes as a unit.
      update((current) => ({ ...current, grid: setBlock(current, index, block) }), {
        history: startOfStroke,
      }),
    [update],
  )

  /**
   * Step one square along `dir`. `skipBlocks` is for arrow navigation, which hops over black
   * squares; letter entry leaves it off so the cursor stops at the end of the entry.
   */
  const step = useCallback(
    (from: number, dir: Direction, delta: 1 | -1, skipBlocks: boolean): number | null => {
      if (!puzzle) return null
      let r = rowOf(from, puzzle.cols)
      let c = colOf(from, puzzle.cols)

      for (;;) {
        if (dir === 'A') c += delta
        else r += delta
        if (r < 0 || c < 0 || r >= puzzle.rows || c >= puzzle.cols) return null

        const next = idx(r, c, puzzle.cols)
        if (isWhite(next)) return next
        if (!skipBlocks) return null
      }
    },
    [puzzle, isWhite],
  )

  /** Move to the first square of the next (or previous) entry in reading order. */
  const stepEntry = useCallback(
    (delta: 1 | -1) => {
      const ordered = numbering.slots
      if (ordered.length === 0) return
      const at = activeSlot ? ordered.findIndex((s) => s.key === activeSlot.key) : -1
      const next = ordered[(at + delta + ordered.length) % ordered.length]
      if (next) selectSlot(next)
    },
    [numbering, activeSlot, selectSlot],
  )

  const handleGridKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (!puzzle || event.metaKey || event.ctrlKey || event.altKey) return
      if (mode !== 'content') return
      const key = event.key

      if (key === 'Tab' || key === 'Enter') {
        event.preventDefault()
        stepEntry(key === 'Tab' && event.shiftKey ? -1 : 1)
        return
      }

      // Esc drops a region before it drops the selection.
      if (key === 'Escape' && regionRect) {
        event.preventDefault()
        setRegionRect(null)
        return
      }

      if (selected === null) return

      if (key === 'Escape') {
        event.preventDefault()
        setSelected(null)
        return
      }

      if (key === ' ') {
        event.preventDefault()
        setDirection((d) => (d === 'A' ? 'D' : 'A'))
        return
      }

      const arrows: Record<string, { dir: Direction; delta: 1 | -1 } | undefined> = {
        ArrowLeft: { dir: 'A', delta: -1 },
        ArrowRight: { dir: 'A', delta: 1 },
        ArrowUp: { dir: 'D', delta: -1 },
        ArrowDown: { dir: 'D', delta: 1 },
      }
      const arrow = arrows[key]
      if (arrow) {
        event.preventDefault()
        // A perpendicular arrow turns the cursor before it moves, as in most solvers.
        if (arrow.dir !== direction) {
          setDirection(arrow.dir)
          return
        }
        const next = step(selected, arrow.dir, arrow.delta, true)
        if (next !== null) setSelected(next)
        return
      }

      // Locked squares can't be typed over or erased; the cursor still moves through them.
      const editable = (index: number) => puzzle.grid[index]?.locked !== true

      if (key === 'Backspace' || key === 'Delete') {
        event.preventDefault()
        const cell = puzzle.grid[selected]
        if (cell?.letter) {
          if (editable(selected)) {
            update((current) => ({ ...current, grid: setCellText(current, selected, '') }))
          }
          if (key === 'Backspace') {
            const prev = step(selected, direction, -1, false)
            if (prev !== null) setSelected(prev)
          }
        } else {
          const prev = step(selected, direction, -1, false)
          if (prev !== null) {
            if (editable(prev)) {
              update((current) => ({ ...current, grid: setCellText(current, prev, '') }))
            }
            setSelected(prev)
          }
        }
        return
      }

      if (/^[a-zA-Z]$/.test(key)) {
        event.preventDefault()
        if (editable(selected)) {
          update((current) => ({ ...current, grid: setCellText(current, selected, key) }))
        }
        const next = step(selected, direction, 1, false)
        if (next !== null) setSelected(next)
      }
    },
    [puzzle, mode, selected, direction, regionRect, step, stepEntry, update],
  )

  // Undo/redo, except while the caret is in a text field.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return
      const target = event.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return
      event.preventDefault()
      if (event.shiftKey) redo()
      else undo()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undo, redo])

  /**
   * Squares to mark on the grid, with the reasons why. Problems attached to an entry (a
   * two-letter word, say) mark every square of that entry; problems attached to a single
   * square mark just that one.
   */
  const flags = useMemo(() => {
    const map = new Map<number, string[]>()
    const add = (cell: number, message: string) => {
      const existing = map.get(cell)
      if (existing) existing.push(message)
      else map.set(cell, [message])
    }

    for (const problem of problems) {
      if (problem.severity !== 'error') continue
      if (problem.cellIndex !== undefined) add(problem.cellIndex, problem.message)
      if (problem.slotKey) {
        for (const cell of numbering.byKey.get(problem.slotKey)?.cells ?? []) {
          add(cell, problem.message)
        }
      }
    }
    return map
  }, [problems, numbering])

  const errorCount = problems.filter((p) => p.severity === 'error').length

  if (controller.loading) {
    return (
      <p className="empty-note" style={{ paddingTop: 60 }}>
        Loading…
      </p>
    )
  }

  if (controller.notFound || !puzzle) {
    return (
      <div className="home">
        <h1>Puzzle not found</h1>
        <p className="muted">It may have been deleted from this browser.</p>
        <button className="btn btn-primary" onClick={() => navigate({ name: 'home' })}>
          Back to puzzles
        </button>
      </div>
    )
  }

  const setField = (field: 'title' | 'author', value: string) =>
    update((current) => ({ ...current, [field]: value }), { history: false })

  return (
    <div className="editor">
      <header className="editor-bar">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate({ name: 'home' })}>
          ← Puzzles
        </button>

        <input
          className="title-input"
          value={puzzle.title}
          aria-label="Puzzle title"
          onChange={(e) => setField('title', e.target.value)}
        />
        <input
          className="title-input"
          value={puzzle.author}
          aria-label="Author"
          placeholder="by…"
          style={{ maxWidth: 150, fontWeight: 400, fontSize: 14 }}
          onChange={(e) => setField('author', e.target.value)}
        />

        <ModeTabs mode={mode} onChange={setMode} />

        <span className="spacer" />

        <button className="btn btn-sm" onClick={undo} disabled={!canUndo} title="Ctrl+Z">
          Undo
        </button>
        <button className="btn btn-sm" onClick={redo} disabled={!canRedo} title="Ctrl+Shift+Z">
          Redo
        </button>
        <button className="btn btn-sm" onClick={() => navigate({ name: 'print', id: puzzle.id })}>
          Print
        </button>
        <span className={`save-pill ${controller.saveState}`}>
          {SAVE_LABEL[controller.saveState]}
        </span>
      </header>

      <div className="editor-body">
        <div className="grid-stage">
          <Grid
            puzzle={puzzle}
            numbering={numbering}
            mode={mode}
            selected={selected}
            direction={direction}
            flags={flags}
            ghost={ghost}
            trouble={trouble}
            region={regionSet}
            onSelect={selectCell}
            onRegion={handleRegion}
            onPaint={paint}
            onKeyDown={handleGridKeyDown}
          />
          {errorCount > 0 && (
            <p className="error-summary">
              <span className="dot" />
              {errorCount} structural {errorCount === 1 ? 'problem' : 'problems'} — the marked
              squares need attention.
            </p>
          )}

          <p className="hint-bar">
            {mode === 'structure' ? (
              <>
                Click or drag across squares to place blocks.
                {puzzle.symmetry && ' Each one mirrors to the opposite corner.'}
              </>
            ) : (
              <>
                Type to fill the grid. <kbd>Space</kbd> flips Across/Down, <kbd>Tab</kbd> jumps to
                the next entry, <kbd>arrows</kbd> move, <kbd>Esc</kbd> deselects. <kbd>Shift</kbd>
                +drag marks squares to autofill. Blue letters are pencilled in by autofill.
              </>
            )}
          </p>
        </div>

        <div className="side-rail">
          {mode === 'structure' ? (
            <StructurePanel
              puzzle={puzzle}
              stats={stats}
              problems={problems}
              update={update}
              onJumpToCell={jumpToCell}
              onJumpToSlot={jumpToSlot}
            />
          ) : (
            <ContentPanel
              puzzle={puzzle}
              numbering={numbering}
              stats={stats}
              problems={problems}
              activeSlot={activeSlot}
              selectedCell={selected}
              region={region}
              update={update}
              onSelectSlot={selectSlot}
              onSelectCell={jumpToCell}
              onJumpToSlot={jumpToSlot}
              onPreview={setPreview}
            />
          )}
        </div>
      </div>
    </div>
  )
}
