import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { WordListState } from '../hooks/useWordList'
import {
  DEFAULT_OVERRIDE_SCORE,
  normalizeWord,
  removeWordOverride,
  setWordOverride,
  useWordOverrides,
  wordProblem,
} from '../hooks/useWordOverrides'

/** Scores offered when adding or rescoring a word — the list's own scores are mostly tens. */
const SCORE_STEPS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
/** Rows rendered at once; the filter narrows a long list down. */
const SHOWN = 200

/*
 * Whether the dialog is open, and with what filter. Kept outside React so the Fill panel and
 * the suggestion list can both open it without threading callbacks through the editor.
 */
let session: { filter: string; id: number } | null = null
let nextSession = 1
const listeners = new Set<() => void>()

function setSession(next: typeof session) {
  session = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Open the "my words" dialog, optionally filtered to show one word. */
export function openMyWords(filter = '') {
  setSession({ filter, id: nextSession++ })
}

interface ScoreSelectProps {
  value: number | 'banned'
  onChange: (value: number | 'banned') => void
  /** Accessible name, since the select often stands without a visible label. */
  label: string
  className?: string
}

/** A 0-100 score in steps of ten, or "Never suggest". Keeps an off-step current value. */
export function ScoreSelect({ value, onChange, label, className = 'input' }: ScoreSelectProps) {
  const steps =
    typeof value === 'number' && !SCORE_STEPS.includes(value)
      ? [...SCORE_STEPS, value].sort((a, b) => a - b)
      : SCORE_STEPS
  return (
    <select
      className={className}
      aria-label={label}
      value={String(value)}
      onChange={(e) => onChange(e.target.value === 'banned' ? 'banned' : Number(e.target.value))}
    >
      {steps.map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
      <option value="banned">Never suggest</option>
    </select>
  )
}

/**
 * The per-browser word manager: add entries the list lacks, rescore ones it has, and ban ones
 * that should never be suggested or autofilled. Changes apply as soon as they're made.
 */
export function MyWordsDialog({ wordList }: { wordList: WordListState }) {
  const current = useSyncExternalStore(subscribe, () => session)
  if (!current) return null
  // Keyed by session so each opening starts from its own filter and an empty form.
  return <MyWordsBody key={current.id} initialFilter={current.filter} wordList={wordList} />
}

function MyWordsBody({
  initialFilter,
  wordList,
}: {
  initialFilter: string
  wordList: WordListState
}) {
  const overrides = useWordOverrides()
  const [word, setWord] = useState('')
  const [value, setValue] = useState<number | 'banned'>(DEFAULT_OVERRIDE_SCORE)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState(initialFilter)

  const close = () => setSession(null)

  // Esc closes from anywhere, not just while focus is inside the dialog.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSession(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const ready = wordList.status === 'ready' ? wordList : null

  const entries = useMemo(
    () => Object.entries(overrides).sort(([a], [b]) => (a < b ? -1 : 1)),
    [overrides],
  )
  const needle = normalizeWord(filter)
  const shown = needle ? entries.filter(([w]) => w.includes(needle)) : entries

  const add = (event: React.FormEvent) => {
    event.preventDefault()
    const normalized = normalizeWord(word)
    const problem = wordProblem(normalized)
    if (problem) return setError(problem)
    setWordOverride(normalized, value)
    setError(null)
    setWord('')
    // Keep the new word visible if a filter would otherwise hide it.
    if (needle && !normalized.includes(needle)) setFilter('')
  }

  const banned = entries.filter(([, v]) => v === 'banned').length

  return (
    <div className="dialog-backdrop" onClick={close}>
      <div
        className="dialog dialog-wide"
        role="dialog"
        aria-modal="true"
        aria-label="My words"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>My words</h2>
        <div className="dialog-body">
          <p className="tiny muted mywords-note">
            Your scores replace the word list's, words you add join it, and banned words are never
            suggested or autofilled. Saved in this browser.
          </p>

          <form className="mywords-add" onSubmit={add}>
            <input
              className="input"
              value={word}
              placeholder="Add a word…"
              aria-label="Word"
              autoFocus
              onChange={(e) => {
                setWord(e.target.value)
                setError(null)
              }}
            />
            <ScoreSelect value={value} onChange={setValue} label="Score for the new word" />
            <button className="btn btn-primary btn-sm" type="submit">
              Add
            </button>
          </form>
          {error && <p className="tiny mywords-error">{error}</p>}

          <div className="mywords-head">
            <input
              className="input"
              value={filter}
              placeholder="Filter"
              aria-label="Filter my words"
              onChange={(e) => setFilter(e.target.value)}
            />
            <span className="tiny muted mywords-count">
              {entries.length} {entries.length === 1 ? 'word' : 'words'}
              {banned > 0 && ` · ${banned} banned`}
            </span>
          </div>

          {entries.length === 0 ? (
            <p className="tiny muted mywords-note">
              Nothing yet. Add words here, or hover a suggestion and choose ×.
            </p>
          ) : shown.length === 0 ? (
            <p className="tiny muted mywords-note">No words match “{filter}”.</p>
          ) : (
            <div className="mywords-list">
              {shown.slice(0, SHOWN).map(([w, v]) => {
                const base = ready?.baseScores[w]
                return (
                  <div className="mywords-row" key={w}>
                    <span className="sugg-word grow">{w}</span>
                    <span className="tiny muted" title="Score in the word list">
                      {base === undefined ? 'not in list' : `list ${base}`}
                    </span>
                    <ScoreSelect
                      value={v}
                      onChange={(next) => setWordOverride(w, next)}
                      label={`Score for ${w}`}
                      className="input mywords-score"
                    />
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => removeWordOverride(w)}
                      title={
                        base === undefined
                          ? 'Remove from the word list'
                          : `Back to the list's score of ${base}`
                      }
                      aria-label={`Remove ${w}`}
                    >
                      ×
                    </button>
                  </div>
                )
              })}
              {shown.length > SHOWN && (
                <p className="tiny muted mywords-note">
                  Showing {SHOWN} of {shown.length} — filter to find the rest.
                </p>
              )}
            </div>
          )}
        </div>
        <div className="dialog-foot">
          {ready?.updating && <span className="tiny muted grow">Updating word list…</span>}
          <button className="btn" onClick={close}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
