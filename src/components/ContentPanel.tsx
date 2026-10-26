import type { Numbering, Problem, Puzzle, Slot } from '../types/puzzle'
import { acrossSlots, downSlots } from '../lib/slots'
import { clearLetters, fillEntry, setCellText, setLocked } from '../lib/grid'
import { useWordList } from '../hooks/useWordList'
import type { GridStats } from '../lib/validation'
import { ClueList } from './ClueList'
import { FillPanel } from './FillPanel'
import { MyWordsDialog } from './MyWordsDialog'
import { SlotInspector } from './SlotInspector'
import { ValidationPanel } from './ValidationPanel'

interface ContentPanelProps {
  puzzle: Puzzle
  numbering: Numbering
  stats: GridStats
  problems: Problem[]
  activeSlot: Slot | undefined
  selectedCell: number | null
  /** Squares marked out for a region autofill; empty when there's no region. */
  region: number[]
  update: (fn: (current: Puzzle) => Puzzle, options?: { history?: boolean }) => void
  onSelectSlot: (slot: Slot) => void
  onSelectCell: (index: number) => void
  onJumpToSlot: (slotKey: string) => void
  /** Pencil a suggestion into the active entry, or clear the preview with null. */
  onPreview: (word: string | null) => void
}

export function ContentPanel({
  puzzle,
  numbering,
  stats,
  problems,
  activeSlot,
  selectedCell,
  region,
  update,
  onSelectSlot,
  onSelectCell,
  onJumpToSlot,
  onPreview,
}: ContentPanelProps) {
  const wordList = useWordList()

  const setClue = (slotKey: string, text: string) =>
    // Typing a clue shouldn't create an undo step per keystroke.
    update((current) => ({ ...current, clues: { ...current.clues, [slotKey]: text } }), {
      history: false,
    })

  const setSquare = (index: number, text: string, startOfEdit: boolean) =>
    // Only the first keystroke opens an undo step, so one edit of a square undoes as a unit.
    update((current) => ({ ...current, grid: setCellText(current, index, text) }), {
      history: startOfEdit,
    })

  const applySuggestion = (word: string) => {
    if (!activeSlot) return
    // The whole entry goes in as one undo step.
    update((current) => ({ ...current, grid: fillEntry(current, activeSlot.cells, word) }))
  }

  const slotLocked = activeSlot?.cells.some((cell) => puzzle.grid[cell]?.locked) ?? false
  const toggleLock = () => {
    if (!activeSlot) return
    update((current) => ({ ...current, grid: setLocked(current, activeSlot.cells, !slotLocked) }))
  }

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <h3>Progress</h3>
          <button
            className="btn btn-sm"
            onClick={() => update((current) => ({ ...current, grid: clearLetters(current) }))}
            disabled={puzzle.grid.every((c) => c.letter === '' || c.locked)}
            title="Empties every square except locked ones"
          >
            Clear letters
          </button>
        </div>
        <div className="panel-body">
          <div className="stat-grid">
            <div className="stat">
              <b>
                {stats.filledEntries}/{stats.entries}
              </b>
              <span>Entries filled</span>
            </div>
            <div className="stat">
              <b>
                {stats.cluedEntries}/{stats.entries}
              </b>
              <span>Clues written</span>
            </div>
          </div>
        </div>
      </section>

      <FillPanel
        puzzle={puzzle}
        numbering={numbering}
        wordList={wordList}
        region={region}
        update={update}
        onJumpToSlot={onJumpToSlot}
      />

      <SlotInspector
        slot={activeSlot}
        numbering={numbering}
        selectedCell={selectedCell}
        selectedText={selectedCell === null ? '' : (puzzle.grid[selectedCell]?.letter ?? '')}
        selectedLocked={selectedCell !== null && puzzle.grid[selectedCell]?.locked === true}
        pencilled={activeSlot?.cells.filter((cell) => puzzle.grid[cell]?.pencil) ?? []}
        locked={slotLocked}
        onToggleLock={toggleLock}
        clue={activeSlot ? (puzzle.clues[activeSlot.key] ?? '') : ''}
        onClueChange={setClue}
        wordList={wordList}
        onPreview={onPreview}
        onApplySuggestion={applySuggestion}
        onSelectCell={onSelectCell}
        onSetSquare={setSquare}
      />

      <div className="clue-columns">
        <ClueList
          title="Across"
          slots={acrossSlots(numbering)}
          clues={puzzle.clues}
          activeKey={activeSlot?.key}
          onSelect={onSelectSlot}
        />
        <ClueList
          title="Down"
          slots={downSlots(numbering)}
          clues={puzzle.clues}
          activeKey={activeSlot?.key}
          onSelect={onSelectSlot}
        />
      </div>

      <ValidationPanel
        problems={problems}
        onJumpToCell={onSelectCell}
        onJumpToSlot={onJumpToSlot}
        title="To do"
        emptyNote="Every entry is filled and clued. This puzzle is ready."
      />

      <MyWordsDialog wordList={wordList} />
    </>
  )
}
