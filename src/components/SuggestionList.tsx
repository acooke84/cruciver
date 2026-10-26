import { useMemo } from 'react'
import type { Numbering, Slot } from '../types/puzzle'
import type { WordListState } from '../hooks/useWordList'
import { useFillSettings } from '../hooks/useFillSettings'
import { suggest, type Suggestion } from '../lib/suggest'

const SHOWN = 100

const slotName = (slot: Slot) => `${slot.number}-${slot.dir === 'A' ? 'Across' : 'Down'}`

/** Meter fill for a crossing count, on a log scale where 1,000+ options reads as wide open. */
function crossWidth(n: number): number {
  if (!Number.isFinite(n)) return 1
  return Math.min(1, Math.log10(n + 1) / 3)
}

function crossTone(n: number): 'dead' | 'tight' | 'open' {
  if (n === 0) return 'dead'
  return n < 5 ? 'tight' : 'open'
}

function crossTitle(s: Suggestion): string {
  if (!s.tightest) return 'No open crossings'
  const name = slotName(s.tightest)
  if (s.crossOptions === 0) return `Leaves no entry that fits ${name}`
  const n = s.crossOptions
  return `Tightest crossing: ${name}, with ${n.toLocaleString()} ${n === 1 ? 'option' : 'options'}`
}

interface SuggestionListProps {
  wordList: WordListState
  numbering: Numbering
  slot: Slot
  /** Show `word` as a pencilled preview in the grid, or clear it with null. */
  onPreview: (word: string | null) => void
  onApply: (word: string) => void
}

/** Ranked entries for the active slot, with a check on what each would leave its crossings. */
export function SuggestionList({
  wordList,
  numbering,
  slot,
  onPreview,
  onApply,
}: SuggestionListProps) {
  const { minScore } = useFillSettings()

  const list = wordList.status === 'ready' ? wordList.list : null
  const result = useMemo(
    () => (list && !slot.complete ? suggest(list, numbering, slot, { minScore, limit: SHOWN }) : null),
    [list, numbering, slot, minScore],
  )

  const head = (
    <div className="sugg-head">
      <span className="sugg-title">Suggestions</span>
      <span className="spacer" />
      <span className="tiny muted" title="Set in the Fill panel">
        score {minScore}+
      </span>
    </div>
  )

  if (wordList.status !== 'ready') {
    return (
      <div className="field">
        {head}
        <p className="tiny muted sugg-note">
          {wordList.status === 'loading' && 'Loading word list…'}
          {wordList.status === 'missing' && (
            <>
              No word list yet. Build one with <code>npm run wordlist</code> (see the README).
            </>
          )}
          {wordList.status === 'error' && `Couldn't load the word list: ${wordList.message}`}
        </p>
      </div>
    )
  }

  if (slot.complete) {
    const info = /^[A-Z0-9]+$/.test(slot.answer) ? wordList.list.lookup(slot.answer) : undefined
    return (
      <div className="field">
        {head}
        <p className="tiny sugg-note">
          {info ? (
            <>
              <b className="sugg-word">{info.word}</b> scores {info.score}
              {info.seen > 0 && <>, seen {info.seen}× in the NYT corpus</>}.
            </>
          ) : (
            <>
              <b className="sugg-word">{slot.answer}</b>{' '}
              <span className="muted">isn't in the word list.</span>
            </>
          )}
        </p>
      </div>
    )
  }

  if (!result || result.status === 'rebus') {
    return (
      <div className="field">
        {head}
        <p className="tiny muted sugg-note">
          Suggestions aren't available for an entry that runs through a rebus square.
        </p>
      </div>
    )
  }

  return (
    <div className="field">
      {head}
      <span className="tiny muted">
        {result.total === 0
          ? `Nothing in the word list fits${minScore > 0 ? ` at ${minScore}+` : ''}.`
          : `${result.total.toLocaleString()} fit · ${result.viable.toLocaleString()} keep every crossing open`}
      </span>

      {result.suggestions.length > 0 && (
        <div className="sugg-list" role="listbox" onMouseLeave={() => onPreview(null)}>
          {result.suggestions.map((s) => {
            const tone = crossTone(s.crossOptions)
            return (
              <button
                key={s.word}
                role="option"
                aria-selected={false}
                className={'sugg-row' + (tone === 'dead' ? ' dead' : '')}
                // Keep keyboard focus on the grid so typing carries on after a click.
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => onPreview(s.word)}
                onFocus={() => onPreview(s.word)}
                onBlur={() => onPreview(null)}
                onClick={() => {
                  onPreview(null)
                  onApply(s.word)
                }}
              >
                <span className="sugg-word">{s.word}</span>
                {s.seen > 0 && (
                  <span className="sugg-seen" title={`Seen ${s.seen}× in the NYT corpus`}>
                    NYT×{s.seen}
                  </span>
                )}
                <span className="spacer" />
                <span className="sugg-cross" title={crossTitle(s)}>
                  <i className={tone} style={{ width: `${crossWidth(s.crossOptions) * 100}%` }} />
                </span>
                <span className="sugg-score" title="Word list score">
                  {s.score}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {result.total > result.suggestions.length && (
        <span className="tiny muted">
          Showing the top {result.suggestions.length} of {result.total.toLocaleString()} — raise
          the minimum score in the Fill panel, or fill a crossing letter, to narrow it down.
        </span>
      )}
    </div>
  )
}
