import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Numbering, Problem, Puzzle } from '../types/puzzle'
import { computeNumbering } from '../lib/slots'
import { analyze, gridStats, type GridStats } from '../lib/validation'
import { store } from '../storage'

const SAVE_DEBOUNCE_MS = 400
const HISTORY_LIMIT = 50

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

export interface UpdateOptions {
  /** Set false for changes that shouldn't become their own undo step (typing a clue). */
  history?: boolean
}

export interface PuzzleController {
  puzzle: Puzzle | null
  loading: boolean
  notFound: boolean
  saveState: SaveState
  numbering: Numbering
  problems: Problem[]
  stats: GridStats
  update(fn: (current: Puzzle) => Puzzle, options?: UpdateOptions): void
  undo(): void
  redo(): void
  canUndo: boolean
  canRedo: boolean
}

const EMPTY_NUMBERING: Numbering = {
  slots: [],
  numbers: new Map(),
  byCell: new Map(),
  byKey: new Map(),
}

const EMPTY_STATS: GridStats = {
  entries: 0,
  acrossCount: 0,
  downCount: 0,
  blocks: 0,
  whiteCells: 0,
  blockRatio: 0,
  averageLength: 0,
  filledEntries: 0,
  cluedEntries: 0,
}

export function usePuzzle(id: string): PuzzleController {
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [history, setHistory] = useState({ undo: 0, redo: 0 })

  /**
   * The live puzzle, mirrored into a ref. Undo/redo bookkeeping happens here rather than
   * inside a setState updater: React may invoke an updater more than once for a single
   * change, which would push duplicate history entries.
   */
  const puzzleRef = useRef<Puzzle | null>(null)
  const past = useRef<Puzzle[]>([])
  const future = useRef<Puzzle[]>([])
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  /** Suppresses the autosave that would otherwise fire right after the initial load. */
  const skipNextSave = useRef(true)

  const commit = useCallback((next: Puzzle | null) => {
    puzzleRef.current = next
    setPuzzle(next)
    setHistory({ undo: past.current.length, redo: future.current.length })
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setNotFound(false)
    skipNextSave.current = true
    past.current = []
    future.current = []

    store.get(id).then((loaded) => {
      if (cancelled) return
      commit(loaded)
      setNotFound(loaded === null)
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [id, commit])

  // Debounced autosave.
  useEffect(() => {
    if (!puzzle) return
    if (skipNextSave.current) {
      skipNextSave.current = false
      return
    }

    setSaveState('dirty')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      setSaveState('saving')
      store
        .save(puzzle)
        .then(() => setSaveState('saved'))
        .catch(() => setSaveState('error'))
    }, SAVE_DEBOUNCE_MS)

    return () => clearTimeout(saveTimer.current)
  }, [puzzle])

  const update = useCallback<PuzzleController['update']>(
    (fn, options) => {
      const current = puzzleRef.current
      if (!current) return

      const next = fn(current)
      if (next === current) return

      if (options?.history !== false) {
        past.current = [...past.current, current].slice(-HISTORY_LIMIT)
        future.current = []
      }
      commit({ ...next, updatedAt: new Date().toISOString() })
    },
    [commit],
  )

  const undo = useCallback(() => {
    const current = puzzleRef.current
    const previous = past.current.at(-1)
    if (!current || !previous) return

    past.current = past.current.slice(0, -1)
    future.current = [...future.current, current]
    commit(previous)
  }, [commit])

  const redo = useCallback(() => {
    const current = puzzleRef.current
    const next = future.current.at(-1)
    if (!current || !next) return

    future.current = future.current.slice(0, -1)
    past.current = [...past.current, current]
    commit(next)
  }, [commit])

  const numbering = useMemo(
    () => (puzzle ? computeNumbering(puzzle) : EMPTY_NUMBERING),
    [puzzle],
  )
  const problems = useMemo(() => (puzzle ? analyze(puzzle, numbering) : []), [puzzle, numbering])
  const stats = useMemo(
    () => (puzzle ? gridStats(puzzle, numbering) : EMPTY_STATS),
    [puzzle, numbering],
  )

  return {
    puzzle,
    loading,
    notFound,
    saveState,
    numbering,
    problems,
    stats,
    update,
    undo,
    redo,
    canUndo: history.undo > 0,
    canRedo: history.redo > 0,
  }
}
