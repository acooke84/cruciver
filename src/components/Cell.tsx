import type { Mode } from '../types/puzzle'

/**
 * Font size for a square's contents, as an `em` against the grid's per-cell font size.
 *
 * A rebus shrinks in inverse proportion to its length so the whole word keeps landing inside the
 * square: at roughly 0.65em of width per uppercase character, `1.3 / length` fills about 85% of
 * the square whatever the length. Short contents are capped at the ordinary single-letter size.
 */
export function letterFontSize(length: number): string {
  return `${Math.max(0.14, Math.min(0.62, 1.3 / Math.max(1, length))).toFixed(3)}em`
}

interface CellProps {
  index: number
  block: boolean
  letter: string
  /** Pencilled in by autofill rather than typed. */
  pencil: boolean
  locked: boolean
  /** A previewed letter to pencil in while the square is empty. */
  ghost: string | undefined
  /** How many letters could still go here, when that's worryingly few (see troubleSpots). */
  trouble: number | undefined
  number: number | undefined
  mode: Mode
  selected: boolean
  /** True for every square of the entry running in the active direction. */
  inWord: boolean
  /** Part of the region selected for autofill. */
  inRegion: boolean
  /** Error messages affecting this square; undefined when the square is fine. */
  problems: string[] | undefined
  onPointerDown: (index: number, event: React.PointerEvent) => void
  onPointerEnter: (index: number, event: React.PointerEvent) => void
}

export function Cell({
  index,
  block,
  letter,
  pencil,
  locked,
  ghost,
  trouble,
  number,
  mode,
  selected,
  inWord,
  inRegion,
  problems,
  onPointerDown,
  onPointerEnter,
}: CellProps) {
  const flagged = problems !== undefined && problems.length > 0

  const classes = ['xw-cell', mode]
  if (block) classes.push('block')
  if (selected) classes.push('selected')
  else if (inWord) classes.push('in-word')
  if (inRegion) classes.push('in-region')
  if (flagged) classes.push('flagged')
  if (locked) classes.push('locked')
  if (trouble !== undefined) classes.push(trouble === 0 ? 'trouble-dead' : 'trouble-tight')

  const clue = number !== undefined ? `, clue ${number}` : ''
  const content = block ? 'black square' : letter || 'empty'
  const reason = flagged ? `. ${problems.join(' ')}` : ''
  const state =
    (locked ? ', locked' : '') +
    (pencil ? ', pencilled' : '') +
    (inRegion ? ', in fill selection' : '')
  const troubleNote =
    trouble === undefined
      ? undefined
      : trouble === 0
        ? 'No letter works here'
        : `Only ${trouble} ${trouble === 1 ? 'letter works' : 'letters work'} here`
  const tooltip = [...(problems ?? []), ...(troubleNote ? [troubleNote] : [])].join('\n')

  return (
    <div
      role="gridcell"
      aria-label={`Square ${index + 1}${clue}: ${content}${state}${reason}${troubleNote ? `. ${troubleNote}` : ''}`}
      aria-selected={selected}
      aria-invalid={flagged || undefined}
      title={tooltip || undefined}
      className={classes.join(' ')}
      onPointerDown={(e) => onPointerDown(index, e)}
      onPointerEnter={(e) => onPointerEnter(index, e)}
    >
      {!block && number !== undefined && <span className="num">{number}</span>}
      {!block && locked && <span className="lock" aria-hidden="true" />}
      {!block && letter && (
        <span
          className={'letter' + (letter.length > 1 ? ' rebus' : '') + (pencil ? ' pencil' : '')}
          style={{ fontSize: letterFontSize(letter.length) }}
        >
          {letter}
        </span>
      )}
      {!block && !letter && ghost && (
        <span className="letter ghost" aria-hidden="true">
          {ghost}
        </span>
      )}
    </div>
  )
}
