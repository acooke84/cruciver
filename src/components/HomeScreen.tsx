import { useRef, useState } from 'react'
import type { PuzzleSummary } from '../types/puzzle'
import { MAX_SIZE, MIN_SIZE, SIZE_PRESETS, clampSize } from '../lib/grid'
import { createPuzzle, duplicatePuzzle } from '../lib/puzzle'
import { navigate } from '../lib/router'
import { exportPuzzle, parsePuzzle, store } from '../storage'
import { usePuzzleList } from '../hooks/usePuzzleList'

export function HomeScreen() {
  const { puzzles, loading, refresh } = usePuzzleList()
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const handleImport = async (file: File) => {
    setError(null)
    try {
      const puzzle = parsePuzzle(await file.text())
      await store.save(puzzle)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file.')
    }
  }

  const handleDuplicate = async (id: string) => {
    const original = await store.get(id)
    if (!original) return
    await store.save(duplicatePuzzle(original))
    await refresh()
  }

  const handleExport = async (id: string) => {
    const puzzle = await store.get(id)
    if (puzzle) exportPuzzle(puzzle)
  }

  const handleDelete = async (summary: PuzzleSummary) => {
    if (!window.confirm(`Delete “${summary.title}”? This cannot be undone.`)) return
    await store.remove(summary.id)
    await refresh()
  }

  const handleRename = async (summary: PuzzleSummary) => {
    const title = window.prompt('Puzzle title', summary.title)
    if (title === null) return
    const puzzle = await store.get(summary.id)
    if (!puzzle) return
    await store.save({
      ...puzzle,
      title: title.trim() || puzzle.title,
      updatedAt: new Date().toISOString(),
    })
    await refresh()
  }

  return (
    <div className="home">
      <div className="home-head">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <span className="on" />
            <span />
            <span className="on" />
            <span />
            <span />
            <span />
            <span className="on" />
            <span />
            <span className="on" />
          </div>
          <div>
            <h1>Cruciver</h1>
            <p className="muted small" style={{ margin: 0 }}>
              Build and design crossword puzzles.
            </p>
          </div>
        </div>

        <div className="home-actions">
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleImport(file)
              e.target.value = ''
            }}
          />
          <button className="btn" onClick={() => fileInput.current?.click()}>
            Import
          </button>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            New puzzle
          </button>
        </div>
      </div>

      {error && (
        <p className="small" style={{ color: 'var(--error)' }}>
          {error}
        </p>
      )}

      {loading ? (
        <p className="empty-note">Loading your puzzles…</p>
      ) : (
        <div className="puzzle-grid">
          <button className="new-card" onClick={() => setCreating(true)}>
            <span className="plus">+</span>
            New puzzle
          </button>

          {puzzles.map((summary) => (
            <article key={summary.id} className="panel puzzle-card">
              <button
                className="puzzle-card-main"
                onClick={() => navigate({ name: 'editor', id: summary.id })}
              >
                <Thumbnail summary={summary} />
                <div className="puzzle-card-meta">
                  <h3>{summary.title}</h3>
                  <p className="tiny muted" style={{ margin: '2px 0 0' }}>
                    {summary.rows} × {summary.cols}
                    {summary.author ? ` · ${summary.author}` : ''}
                  </p>
                  <p className="tiny muted" style={{ margin: '2px 0 0' }}>
                    Edited {formatWhen(summary.updatedAt)}
                  </p>
                  <div
                    className="progress-bar"
                    title={`${Math.round(summary.progress * 100)}% of entries filled`}
                  >
                    <span style={{ width: `${Math.round(summary.progress * 100)}%` }} />
                  </div>
                </div>
              </button>

              <div className="puzzle-card-foot">
                <button className="btn btn-sm btn-ghost" onClick={() => void handleRename(summary)}>
                  Rename
                </button>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => void handleDuplicate(summary.id)}
                >
                  Duplicate
                </button>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => void handleExport(summary.id)}
                >
                  Export
                </button>
                <span className="spacer" />
                <button
                  className="btn btn-sm btn-ghost btn-danger"
                  onClick={() => void handleDelete(summary)}
                  aria-label={`Delete ${summary.title}`}
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {creating && (
        <NewPuzzleDialog
          onCancel={() => setCreating(false)}
          onCreate={async (options) => {
            const puzzle = createPuzzle(options)
            await store.save(puzzle)
            navigate({ name: 'editor', id: puzzle.id })
          }}
        />
      )}
    </div>
  )
}

function Thumbnail({ summary }: { summary: PuzzleSummary }) {
  return (
    <div
      className="thumb"
      aria-hidden="true"
      style={{
        gridTemplateColumns: `repeat(${summary.cols}, 1fr)`,
        gridTemplateRows: `repeat(${summary.rows}, 1fr)`,
      }}
    >
      {summary.blocks.map((block, i) => (
        <i key={i} className={block ? 'block' : undefined} />
      ))}
    </div>
  )
}

function formatWhen(iso: string): string {
  const then = new Date(iso)
  const minutes = Math.round((Date.now() - then.getTime()) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} h ago`
  if (minutes < 60 * 24 * 7) return `${Math.round(minutes / (60 * 24))} d ago`
  return then.toLocaleDateString()
}

interface NewPuzzleDialogProps {
  onCancel: () => void
  onCreate: (options: {
    title: string
    rows: number
    cols: number
    symmetry: boolean
  }) => Promise<void>
}

function NewPuzzleDialog({ onCancel, onCreate }: NewPuzzleDialogProps) {
  const [title, setTitle] = useState('')
  const [rows, setRows] = useState(15)
  const [cols, setCols] = useState(15)
  const [symmetry, setSymmetry] = useState(true)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (busy) return
    setBusy(true)
    await onCreate({ title, rows, cols, symmetry })
  }

  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label="New puzzle"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>New puzzle</h2>
        <div className="dialog-body">
          <div className="field">
            <label htmlFor="new-title">Title</label>
            <input
              id="new-title"
              className="input"
              value={title}
              autoFocus
              placeholder="Untitled puzzle"
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submit()
              }}
            />
          </div>

          <div className="field">
            <label>Size</label>
            <div className="preset-row">
              {SIZE_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  className={
                    'chip' + (rows === preset.rows && cols === preset.cols ? ' active' : '')
                  }
                  onClick={() => {
                    setRows(preset.rows)
                    setCols(preset.cols)
                  }}
                >
                  {preset.label} <span className="tiny">· {preset.note}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="row">
            <div className="field grow">
              <label htmlFor="new-rows">Rows</label>
              <input
                id="new-rows"
                className="input"
                type="number"
                min={MIN_SIZE}
                max={MAX_SIZE}
                value={rows}
                onChange={(e) => setRows(clampSize(Number(e.target.value) || rows))}
              />
            </div>
            <div className="field grow">
              <label htmlFor="new-cols">Columns</label>
              <input
                id="new-cols"
                className="input"
                type="number"
                min={MIN_SIZE}
                max={MAX_SIZE}
                value={cols}
                onChange={(e) => setCols(clampSize(Number(e.target.value) || cols))}
              />
            </div>
          </div>

          <label className="switch">
            <input
              type="checkbox"
              checked={symmetry}
              onChange={(e) => setSymmetry(e.target.checked)}
            />
            <span>
              <strong>180° rotational symmetry</strong>
              <br />
              <span className="tiny muted">The usual convention. You can switch it off later.</span>
            </span>
          </label>
        </div>

        <div className="dialog-foot">
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => void submit()} disabled={busy}>
            Create puzzle
          </button>
        </div>
      </div>
    </div>
  )
}
