import type { Problem, Severity } from '../types/puzzle'

interface ValidationPanelProps {
  problems: Problem[]
  onJumpToCell: (index: number) => void
  onJumpToSlot: (slotKey: string) => void
  /** Restrict the list to one severity; omit to show everything. */
  only?: Severity
  title?: string
  emptyNote?: string
}

const MAX_SHOWN = 40

export function ValidationPanel({
  problems,
  onJumpToCell,
  onJumpToSlot,
  only,
  title = 'Problems',
  emptyNote = 'Nothing to fix.',
}: ValidationPanelProps) {
  const filtered = only ? problems.filter((p) => p.severity === only) : problems
  const shown = filtered.slice(0, MAX_SHOWN)
  const hidden = filtered.length - shown.length

  const errors = filtered.filter((p) => p.severity === 'error').length
  const warnings = filtered.length - errors

  return (
    <section className="panel">
      <div className="panel-head">
        <h3>{title}</h3>
        <div className="row" style={{ gap: 5 }}>
          {errors > 0 && <span className="badge error">{errors}</span>}
          {warnings > 0 && <span className="badge warning">{warnings}</span>}
          {filtered.length === 0 && <span className="badge ok">Clear</span>}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="empty-note">{emptyNote}</p>
      ) : (
        <div className="problem-list">
          {shown.map((problem, i) => (
            <button
              key={`${problem.message}-${i}`}
              className={`problem ${problem.severity}`}
              onClick={() => {
                if (problem.slotKey) onJumpToSlot(problem.slotKey)
                else if (problem.cellIndex !== undefined) onJumpToCell(problem.cellIndex)
              }}
            >
              <span className="dot" />
              <span>{problem.message}</span>
            </button>
          ))}
          {hidden > 0 && <p className="empty-note">+ {hidden} more</p>}
        </div>
      )}
    </section>
  )
}
