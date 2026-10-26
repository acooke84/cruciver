import { useRef } from 'react'
import type { Numbering, Slot } from '../types/puzzle'
import { MAX_CELL_LETTERS } from '../lib/grid'
import { crossingSlot } from '../lib/slots'
import type { WordListState } from '../hooks/useWordList'
import { SuggestionList } from './SuggestionList'

interface SlotInspectorProps {
  slot: Slot | undefined
  numbering: Numbering
  selectedCell: number | null
  /** Current contents of the selected square, '' when empty. */
  selectedText: string
  selectedLocked: boolean
  /** Squares of the entry holding pencilled letters. */
  pencilled: number[]
  /** Whether any square of the entry is locked. */
  locked: boolean
  onToggleLock: () => void
  /** Clue for the active entry, '' when unwritten. */
  clue: string
  onClueChange: (slotKey: string, text: string) => void
  wordList: WordListState
  /** Pencil a suggestion into the grid, or clear the preview with null. */
  onPreview: (word: string | null) => void
  onApplySuggestion: (word: string) => void
  onSelectCell: (index: number) => void
  /** `startOfEdit` opens an undo step, so a whole rebus edit undoes as a unit. */
  onSetSquare: (index: number, text: string, startOfEdit: boolean) => void
}

type CrossState = 'unchecked' | 'cross-complete' | 'cross-partial' | 'cross-empty'

function crossState(numbering: Numbering, cellIndex: number, dir: Slot['dir']): CrossState {
  const cross = crossingSlot(numbering, cellIndex, dir)
  if (!cross) return 'unchecked'
  if (cross.complete) return 'cross-complete'
  return cross.letters.some((l) => l !== '') ? 'cross-partial' : 'cross-empty'
}

/**
 * The editing surface for the active entry: its clue, plus fill assistance — what is already
 * committed, how much each square is pinned down by the entry crossing it, and ranked
 * suggestions from the word list. Also where a square's contents are typed directly, which is
 * the only way to enter a rebus.
 */
export function SlotInspector({
  slot,
  numbering,
  selectedCell,
  selectedText,
  selectedLocked,
  pencilled,
  locked,
  onToggleLock,
  clue,
  onClueChange,
  wordList,
  onPreview,
  onApplySuggestion,
  onSelectCell,
  onSetSquare,
}: SlotInspectorProps) {
  /** False once the first keystroke of an editing session has opened its undo step. */
  const startOfEdit = useRef(true)

  if (!slot) {
    return (
      <section className="panel">
        <div className="panel-head">
          <h3>Entry</h3>
        </div>
        <p className="empty-note">Select a square in the grid to inspect its entry.</p>
      </section>
    )
  }

  const empty = slot.letters.filter((l) => l === '').length
  const crossings = slot.cells.map((cell) => crossState(numbering, cell, slot.dir))
  const constrained = crossings.filter(
    (s) => s === 'cross-complete' || s === 'cross-partial',
  ).length
  const positionInSlot = selectedCell === null ? -1 : slot.cells.indexOf(selectedCell)

  return (
    <section className="panel">
      <div className="panel-head">
        <h3>
          {slot.number}-{slot.dir === 'A' ? 'Across' : 'Down'}
        </h3>
        <span className="tiny muted grow">
          {slot.length} squares
          {slot.letterCount !== slot.length && ` · ${slot.letterCount} letters`} ·{' '}
          {empty === 0 ? 'complete' : `${empty} open`}
        </span>
        <button
          className={'btn btn-sm' + (locked ? ' active' : '')}
          onClick={onToggleLock}
          disabled={!locked && empty === slot.length}
          title={
            locked
              ? 'Allow this entry to be edited again'
              : 'Protect the letters in this entry from typing, clearing and autofill'
          }
        >
          {locked ? 'Unlock' : 'Lock'}
        </button>
      </div>

      <div className="panel-body">
        <div className="field">
          <label htmlFor="slot-clue">Clue</label>
          <textarea
            id="slot-clue"
            className="input"
            rows={2}
            value={clue}
            placeholder={`Clue for ${slot.number}-${slot.dir === 'A' ? 'Across' : 'Down'} (${slot.letterCount} letters)`}
            onChange={(e) => onClueChange(slot.key, e.target.value.replace(/\s*\n\s*/g, ' '))}
            onKeyDown={(e) => {
              // Clues are one line (pasted newlines are flattened too); the textarea is only there so
              // long ones wrap.
              if (e.key === 'Enter') e.preventDefault()
            }}
          />
        </div>

        <div className="pattern">
          {slot.cells.map((cellIndex, i) => {
            const letter = slot.letters[i] ?? ''
            const classes = ['pattern-cell', crossings[i] ?? 'cross-empty']
            if (!letter) classes.push('empty')
            if (letter.length > 1) classes.push('rebus')
            if (pencilled.includes(cellIndex)) classes.push('pencil')
            if (cellIndex === selectedCell) classes.push('current')

            return (
              <button
                key={cellIndex}
                className={classes.join(' ')}
                onClick={() => onSelectCell(cellIndex)}
                title={`Square ${i + 1} of ${slot.length}`}
              >
                {letter || '?'}
              </button>
            )
          })}
        </div>

        {selectedCell !== null && positionInSlot >= 0 && (
          <div className="field">
            <label htmlFor="square-contents">
              Square contents{' '}
              <span className="tiny muted">
                — square {positionInSlot + 1} of {slot.length}
              </span>
            </label>
            <input
              id="square-contents"
              className="input"
              value={selectedText}
              disabled={selectedLocked}
              maxLength={MAX_CELL_LETTERS}
              placeholder="empty"
              autoComplete="off"
              spellCheck={false}
              onFocus={() => {
                startOfEdit.current = true
              }}
              onBlur={() => {
                startOfEdit.current = true
              }}
              onChange={(e) => {
                onSetSquare(selectedCell, e.target.value, startOfEdit.current)
                startOfEdit.current = false
              }}
            />
            <span className="tiny muted">
              {selectedLocked
                ? 'This square is locked. Unlock the entry to change it.'
                : `More than one character makes it a rebus square — up to ${MAX_CELL_LETTERS}.`}
            </span>
          </div>
        )}

        <SuggestionList
          wordList={wordList}
          numbering={numbering}
          slot={slot}
          onPreview={onPreview}
          onApply={onApplySuggestion}
        />

        <div className="legend">
          <span>
            <i style={{ background: '#f0faf4', borderColor: '#b7e0c8' }} />
            crossing complete
          </span>
          <span>
            <i style={{ background: 'var(--cross)', borderColor: '#e6d38a' }} />
            crossing partial
          </span>
          <span>
            <i style={{ background: 'var(--surface-2)' }} />
            crossing empty
          </span>
          <span>
            <i style={{ background: 'var(--error-soft)', borderColor: '#efc4c9' }} />
            unchecked
          </span>
        </div>

        <p className="tiny muted" style={{ margin: 0 }}>
          {constrained} of {slot.length} squares are pinned down by a crossing entry.
        </p>
      </div>
    </section>
  )
}
