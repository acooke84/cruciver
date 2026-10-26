import type { Mode } from '../types/puzzle'

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: 'structure', label: 'Structure', hint: 'size & blocks' },
  { id: 'content', label: 'Content', hint: 'answers & clues' },
]

export function ModeTabs({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) {
  return (
    <div className="mode-tabs" role="tablist" aria-label="Editing mode">
      {MODES.map((m) => (
        <button
          key={m.id}
          role="tab"
          aria-selected={mode === m.id}
          className={'mode-tab' + (mode === m.id ? ' active' : '')}
          onClick={() => onChange(m.id)}
        >
          {m.label}
          <small>{m.hint}</small>
        </button>
      ))}
    </div>
  )
}
