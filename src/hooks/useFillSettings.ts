import { useSyncExternalStore } from 'react'

export const MIN_SCORE_OPTIONS = [0, 30, 40, 50, 60, 70]

export interface FillSettings {
  /** Entries below this score are never suggested, autofilled, or counted as options. */
  minScore: number
  /** Mark squares with few or no workable letters on the grid. */
  showTrouble: boolean
}

const KEY = 'cruciver:fillSettings'
const DEFAULTS: FillSettings = { minScore: 50, showTrouble: true }

function read(): FillSettings {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    const parsed = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<FillSettings>
    return {
      minScore: MIN_SCORE_OPTIONS.includes(Number(parsed.minScore))
        ? Number(parsed.minScore)
        : DEFAULTS.minScore,
      showTrouble: typeof parsed.showTrouble === 'boolean' ? parsed.showTrouble : DEFAULTS.showTrouble,
    }
  } catch {
    return DEFAULTS
  }
}

/* Shared across every component that reads it, and remembered per browser. */
let settings = read()
const listeners = new Set<() => void>()

export function setFillSettings(patch: Partial<FillSettings>) {
  settings = { ...settings, ...patch }
  localStorage.setItem(KEY, JSON.stringify(settings))
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useFillSettings(): FillSettings {
  return useSyncExternalStore(subscribe, () => settings)
}
