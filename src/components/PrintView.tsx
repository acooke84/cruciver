import { useEffect, useState } from 'react'
import type { Puzzle, Slot } from '../types/puzzle'
import { computeNumbering } from '../lib/slots'
import { navigate } from '../lib/router'
import { store } from '../storage'
import { letterFontSize } from './Cell'

export function PrintView({ id }: { id: string }) {
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAnswers, setShowAnswers] = useState(false)

  useEffect(() => {
    let cancelled = false
    store.get(id).then((loaded) => {
      if (cancelled) return
      setPuzzle(loaded)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [id])

  if (loading) return <p className="empty-note">Loading…</p>

  if (!puzzle) {
    return (
      <div className="home">
        <h1>Puzzle not found</h1>
        <button className="btn btn-primary" onClick={() => navigate({ name: 'home' })}>
          Back to puzzles
        </button>
      </div>
    )
  }

  const numbering = computeNumbering(puzzle)
  const across = numbering.slots.filter((s) => s.dir === 'A')
  const down = numbering.slots.filter((s) => s.dir === 'D')
  const size = puzzle.cols > 15 ? 22 : puzzle.cols > 11 ? 28 : 34

  return (
    <div className="print-page">
      <div className="print-toolbar">
        <button className="btn" onClick={() => navigate({ name: 'editor', id })}>
          ← Back to editor
        </button>
        <label className="switch">
          <input
            type="checkbox"
            checked={showAnswers}
            onChange={(e) => setShowAnswers(e.target.checked)}
          />
          <span>Show answers</span>
        </label>
        <span style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={() => window.print()}>
          Print
        </button>
      </div>

      <div className="print-sheet">
        <header className="print-head">
          <h2>{puzzle.title}</h2>
          {puzzle.author && <p className="muted small">by {puzzle.author}</p>}
        </header>

        <div className="print-grid-wrap">
          <div
            className="xw"
            style={{
              gridTemplateColumns: `repeat(${puzzle.cols}, ${size}px)`,
              gridTemplateRows: `repeat(${puzzle.rows}, ${size}px)`,
              fontSize: `${size}px`,
            }}
          >
            {puzzle.grid.map((cell, index) => (
              <div key={index} className={'xw-cell' + (cell.block ? ' block' : '')}>
                {!cell.block && numbering.numbers.has(index) && (
                  <span className="num">{numbering.numbers.get(index)}</span>
                )}
                {!cell.block && showAnswers && cell.letter && (
                  <span
                    className={'letter' + (cell.letter.length > 1 ? ' rebus' : '')}
                    style={{ fontSize: letterFontSize(cell.letter.length) }}
                  >
                    {cell.letter}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="print-clues">
          <ClueColumn title="Across" slots={across} clues={puzzle.clues} />
          <ClueColumn title="Down" slots={down} clues={puzzle.clues} />
        </div>
      </div>
    </div>
  )
}

function ClueColumn({
  title,
  slots,
  clues,
}: {
  title: string
  slots: Slot[]
  clues: Record<string, string>
}) {
  return (
    <div>
      <h4>{title}</h4>
      <ol>
        {slots.map((slot) => (
          <li key={slot.key}>
            <b>{slot.number}</b>
            <span>
              {clues[slot.key]?.trim() || <em className="muted">(no clue yet)</em>}{' '}
              <span className="muted">({slot.letterCount})</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}
