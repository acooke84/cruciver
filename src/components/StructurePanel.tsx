import type { Problem, Puzzle } from '../types/puzzle'
import {
  MAX_SIZE,
  MIN_SIZE,
  SIZE_PRESETS,
  clearBlocks,
  clampSize,
  makeSymmetric,
  resizeGrid,
} from '../lib/grid'
import { randomBlocks } from '../lib/generate'
import type { GridStats } from '../lib/validation'
import { ValidationPanel } from './ValidationPanel'

interface StructurePanelProps {
  puzzle: Puzzle
  stats: GridStats
  problems: Problem[]
  update: (fn: (current: Puzzle) => Puzzle) => void
  onJumpToCell: (index: number) => void
  onJumpToSlot: (slotKey: string) => void
}

export function StructurePanel({
  puzzle,
  stats,
  problems,
  update,
  onJumpToCell,
  onJumpToSlot,
}: StructurePanelProps) {
  const setSize = (rows: number, cols: number) =>
    update((current) => ({
      ...current,
      rows: clampSize(rows),
      cols: clampSize(cols),
      grid: resizeGrid(current, rows, cols),
    }))

  const toggleSymmetry = (on: boolean) =>
    update((current) => ({
      ...current,
      symmetry: on,
      // Turning symmetry on repairs the grid so the setting is never immediately violated.
      grid: on ? makeSymmetric(current) : current.grid,
    }))

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <h3>Grid size</h3>
          <span className="tiny muted">
            {puzzle.rows} × {puzzle.cols}
          </span>
        </div>
        <div className="panel-body">
          <div className="preset-row">
            {SIZE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                className={
                  'chip' +
                  (puzzle.rows === preset.rows && puzzle.cols === preset.cols ? ' active' : '')
                }
                onClick={() => setSize(preset.rows, preset.cols)}
                title={preset.note}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="row">
            <div className="field grow">
              <label htmlFor="rows-stepper">Rows</label>
              <Stepper
                id="rows-stepper"
                value={puzzle.rows}
                onChange={(v) => setSize(v, puzzle.cols)}
              />
            </div>
            <div className="field grow">
              <label htmlFor="cols-stepper">Columns</label>
              <Stepper
                id="cols-stepper"
                value={puzzle.cols}
                onChange={(v) => setSize(puzzle.rows, v)}
              />
            </div>
          </div>

          <p className="tiny muted" style={{ margin: 0 }}>
            Resizing keeps everything that still fits, anchored to the top-left.
          </p>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h3>Blocks</h3>
        </div>
        <div className="panel-body">
          <label className="switch">
            <input
              type="checkbox"
              checked={puzzle.symmetry}
              onChange={(e) => toggleSymmetry(e.target.checked)}
            />
            <span>
              <strong>180° rotational symmetry</strong>
              <br />
              <span className="tiny muted">
                Mirrors every block you place to the opposite corner.
              </span>
            </span>
          </label>

          <div className="row wrap">
            <button
              className="btn btn-sm"
              onClick={() => update((current) => ({ ...current, grid: randomBlocks(current) }))}
              title="Replace the block pattern with a random one that passes every structure check"
            >
              Random layout
            </button>
            <button
              className="btn btn-sm"
              onClick={() => update((current) => ({ ...current, grid: clearBlocks(current) }))}
              disabled={stats.blocks === 0}
            >
              Clear all blocks
            </button>
            <button
              className="btn btn-sm"
              onClick={() => update((current) => ({ ...current, grid: makeSymmetric(current) }))}
              disabled={puzzle.symmetry}
              title="Union each block with its rotational partner"
            >
              Make symmetric
            </button>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h3>Statistics</h3>
        </div>
        <div className="panel-body">
          <div className="stat-grid">
            <div className="stat">
              <b>{stats.entries}</b>
              <span>
                Entries · {stats.acrossCount}A / {stats.downCount}D
              </span>
            </div>
            <div className="stat">
              <b>{stats.blocks}</b>
              <span>Blocks · {Math.round(stats.blockRatio * 100)}%</span>
            </div>
            <div className="stat">
              <b>{stats.whiteCells}</b>
              <span>Open squares</span>
            </div>
            <div className="stat">
              <b>{stats.averageLength.toFixed(1)}</b>
              <span>Avg. entry length</span>
            </div>
          </div>
        </div>
      </section>

      <ValidationPanel
        problems={problems}
        onJumpToCell={onJumpToCell}
        onJumpToSlot={onJumpToSlot}
        only="error"
        title="Structure check"
        emptyNote="No structural problems. Every square is checked and connected."
      />
    </>
  )
}

function Stepper({
  id,
  value,
  onChange,
}: {
  id: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <div className="stepper">
      <button
        className="btn btn-sm"
        onClick={() => onChange(value - 1)}
        disabled={value <= MIN_SIZE}
        aria-label="Decrease"
      >
        −
      </button>
      <input
        id={id}
        className="input value"
        type="number"
        min={MIN_SIZE}
        max={MAX_SIZE}
        value={value}
        onChange={(e) => {
          const parsed = Number(e.target.value)
          if (Number.isFinite(parsed) && parsed >= MIN_SIZE && parsed <= MAX_SIZE) onChange(parsed)
        }}
        style={{ width: 62, textAlign: 'center' }}
      />
      <button
        className="btn btn-sm"
        onClick={() => onChange(value + 1)}
        disabled={value >= MAX_SIZE}
        aria-label="Increase"
      >
        +
      </button>
    </div>
  )
}
