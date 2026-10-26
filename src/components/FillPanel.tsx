import { useEffect, useRef, useState } from 'react'
import type { Numbering, Puzzle } from '../types/puzzle'
import { MIN_SCORE_OPTIONS, setFillSettings, useFillSettings } from '../hooks/useFillSettings'
import { startAutofill, type AutofillRun, type WordListState } from '../hooks/useWordList'
import { acceptPencil, clearPencil, hasPencil, writePencil } from '../lib/grid'
import { MIN_ENTRY_LENGTH } from '../lib/validation'

/** How long a search may run before it gives up. */
const TIME_LIMIT_MS = 30_000

interface FillPanelProps {
  puzzle: Puzzle
  numbering: Numbering
  wordList: WordListState
  update: (fn: (current: Puzzle) => Puzzle) => void
  onJumpToSlot: (slotKey: string) => void
}

interface Message {
  tone: 'ok' | 'warn'
  text: string
  /** An entry to offer a jump to. */
  slotKey?: string
  hint?: string
}

function slotLabel(numbering: Numbering, key: string): string {
  const slot = numbering.byKey.get(key)
  return slot ? `${slot.number}-${slot.dir === 'A' ? 'Across' : 'Down'}` : 'an entry'
}

/**
 * Word list settings and autofill: run a search in the engine worker, pencil the result into
 * the grid, then keep or erase it. Typed letters are never touched.
 */
export function FillPanel({ puzzle, numbering, wordList, update, onJumpToSlot }: FillPanelProps) {
  const { minScore, showTrouble } = useFillSettings()
  const [running, setRunning] = useState<{ steps: number } | null>(null)
  const [message, setMessage] = useState<Message | null>(null)
  const runRef = useRef<AutofillRun | null>(null)

  // Leaving the puzzle stops any search still going.
  useEffect(() => () => runRef.current?.cancel(), [])

  const pencilled = hasPencil(puzzle)
  // Pencilled squares count as open: autofill is free to replace them.
  const open = puzzle.grid.some((cell) => !cell.block && (cell.letter === '' || cell.pencil))
  const ready = wordList.status === 'ready'
  // No word list entry is shorter than the minimum, so a too-short entry can never fill.
  const tooShort = numbering.slots.find((slot) => slot.length < MIN_ENTRY_LENGTH)

  const autofill = async () => {
    setMessage(null)
    setRunning({ steps: 0 })
    const run = startAutofill(
      puzzle,
      { minScore, seed: Math.floor(Math.random() * 2 ** 31), timeLimitMs: TIME_LIMIT_MS },
      (steps) => setRunning({ steps }),
    )
    runRef.current = run
    const { outcome, timedOut, elapsedMs } = await run.result
    if (runRef.current !== run) return
    runRef.current = null
    setRunning(null)

    const took =
      elapsedMs < 1000 ? 'under a second' : `${(elapsedMs / 1000).toFixed(elapsedMs < 10_000 ? 1 : 0)}s`
    if (outcome?.status === 'filled') {
      // Replace any earlier fill wholesale; one undo step takes the whole thing back out.
      update((current) => ({
        ...current,
        grid: writePencil({ ...current, grid: clearPencil(current) }, outcome.letters),
      }))
      const n = outcome.entries
      setMessage({
        tone: 'ok',
        text: `Filled ${n} ${n === 1 ? 'entry' : 'entries'} in ${took}.`,
        hint: 'Change anything you like — typed letters stay put next time. Try another fill for a different one.',
      })
    } else if (outcome?.status === 'stuck') {
      setMessage({
        tone: 'warn',
        text: `Nothing in the word list fits ${slotLabel(numbering, outcome.slotKey)} with the letters already typed${minScore > 0 ? ` at score ${minScore}+` : ''}.`,
        slotKey: outcome.slotKey,
        hint: 'Change a letter there, or lower the minimum score.',
      })
    } else if (outcome || timedOut) {
      const hardest = outcome && 'hardest' in outcome ? outcome.hardest : undefined
      setMessage({
        tone: 'warn',
        text:
          (timedOut ? `No fill found in ${took}.` : `Couldn't find a fill.`) +
          (hardest ? ` The hardest spot was ${slotLabel(numbering, hardest)}.` : ''),
        slotKey: hardest,
        hint: 'Lower the minimum score, change letters in the hardest spot, or add a block to break up long stacked entries.',
      })
    } else {
      setMessage({ tone: 'warn', text: 'Stopped.' })
    }
  }

  const stop = () => runRef.current?.cancel()

  return (
    <section className="panel">
      <div className="panel-head">
        <h3>Fill</h3>
        <label className="tiny muted fill-score">
          min score
          <select
            className="input"
            value={minScore}
            onChange={(e) => setFillSettings({ minScore: Number(e.target.value) })}
          >
            {MIN_SCORE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="panel-body">
        {running ? (
          <div className="fill-row">
            <span className="fill-spinner" aria-hidden="true" />
            <span className="small grow">
              Searching… {running.steps > 0 && `${running.steps.toLocaleString()} words tried`}
            </span>
            <button className="btn btn-sm" onClick={stop}>
              Stop
            </button>
          </div>
        ) : (
          <div className="fill-row">
            <button
              className="btn btn-primary btn-sm"
              onClick={() => void autofill()}
              disabled={!ready || !open || tooShort !== undefined}
              title={!open ? 'Every square already has a typed letter' : undefined}
            >
              {pencilled ? 'Try another fill' : 'Autofill grid'}
            </button>
            {pencilled && (
              <>
                <button
                  className="btn btn-sm"
                  onClick={() => update((current) => ({ ...current, grid: acceptPencil(current) }))}
                  title="Turn every pencilled letter into a typed one"
                >
                  Keep fill
                </button>
                <button
                  className="btn btn-sm"
                  onClick={() => update((current) => ({ ...current, grid: clearPencil(current) }))}
                  title="Erase every pencilled letter"
                >
                  Erase fill
                </button>
              </>
            )}
          </div>
        )}

        {!ready && (
          <p className="tiny muted fill-note">
            {wordList.status === 'loading' && 'Loading word list…'}
            {wordList.status === 'missing' && 'Autofill needs a word list — see the README.'}
            {wordList.status === 'error' && `Couldn't load the word list: ${wordList.message}`}
          </p>
        )}

        {tooShort && (
          <div className="fill-message warn">
            <span>
              Autofill needs every entry to be at least {MIN_ENTRY_LENGTH} letters, and{' '}
              {slotLabel(numbering, tooShort.key)} is only {tooShort.length}.
            </span>
            <span className="tiny muted">Fix it in Structure mode first.</span>
          </div>
        )}

        {message && !tooShort && (
          <div className={`fill-message ${message.tone}`}>
            <span>{message.text}</span>
            {message.hint && <span className="tiny muted">{message.hint}</span>}
            {message.slotKey && (
              <button className="link tiny" onClick={() => onJumpToSlot(message.slotKey!)}>
                Go to {slotLabel(numbering, message.slotKey)} →
              </button>
            )}
          </div>
        )}

        {ready && !running && !message && !tooShort && (
          <p className="tiny muted fill-note">
            Autofill pencils the open squares in blue, leaving everything you've typed alone. Lock
            theme entries in the entry panel to protect them from editing and clearing.
          </p>
        )}

        <label className="tiny fill-toggle">
          <input
            type="checkbox"
            checked={showTrouble}
            onChange={(e) => setFillSettings({ showTrouble: e.target.checked })}
          />
          Mark squares where few or no letters work
        </label>
      </div>
    </section>
  )
}
