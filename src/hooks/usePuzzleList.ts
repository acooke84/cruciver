import { useCallback, useEffect, useState } from 'react'
import type { PuzzleSummary } from '../types/puzzle'
import { store } from '../storage'

export function usePuzzleList() {
  const [puzzles, setPuzzles] = useState<PuzzleSummary[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const list = await store.list()
    setPuzzles(list)
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { puzzles, loading, refresh }
}
