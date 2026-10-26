import { useEffect, useRef } from 'react'
import type { Slot } from '../types/puzzle'

interface ClueListProps {
  title: string
  slots: Slot[]
  clues: Record<string, string>
  activeKey: string | undefined
  onSelect: (slot: Slot) => void
}

/** Read-only overview of one direction's clues; editing happens in the slot inspector. */
export function ClueList({ title, slots, clues, activeKey, onSelect }: ClueListProps) {
  const listRef = useRef<HTMLDivElement>(null)

  // Follow the selection when it moves via the grid rather than a click in this list.
  useEffect(() => {
    if (!activeKey) return
    const row = listRef.current?.querySelector(`[data-key="${CSS.escape(activeKey)}"]`)
    row?.scrollIntoView({ block: 'nearest' })
  }, [activeKey])

  return (
    <section className="panel">
      <div className="panel-head">
        <h3>{title}</h3>
        <span className="tiny muted">{slots.length}</span>
      </div>

      {slots.length === 0 ? (
        <p className="empty-note">No entries yet — add open squares in Structure mode.</p>
      ) : (
        <div className="clue-list" ref={listRef}>
          {slots.map((slot) => (
            <div
              key={slot.key}
              data-key={slot.key}
              className={'clue-row' + (slot.key === activeKey ? ' active' : '')}
              onPointerDown={() => onSelect(slot)}
            >
              <span className="num">{slot.number}</span>
              <div className="stack">
                {clues[slot.key] ? (
                  <span className="clue-text">{clues[slot.key]}</span>
                ) : (
                  <span className="clue-text missing">No clue yet</span>
                )}
                <span className={'answer' + (slot.complete ? ' complete' : '')}>
                  {slot.pattern.replace(/\./g, '·')}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
