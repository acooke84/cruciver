# Cruciver

A web app for **constructing** crossword puzzles — laying out the grid, filling the answers,
and writing the clues.

```bash
npm install
npm run dev      # http://localhost:5173
```

Other scripts: `npm test` (Vitest), `npm run typecheck`, `npm run build`, and
`npm run wordlist` to build the fill-suggestion word list (see below).

## The three screens

**Home** lists every puzzle saved in this browser, with a thumbnail, size, last-edited time
and a fill-progress bar. From here you can create, resume, rename, duplicate, export, import
or delete a puzzle.

**Structure mode** is where the grid takes shape:

- Size presets from 5×5 up to 21×21, or set rows and columns directly (3–25).
- Click or drag across squares to place black squares. With 180° rotational symmetry on
  (the default) each one mirrors to the opposite corner automatically.
- Live statistics: entry count, block count and percentage, open squares, average entry length.
- A structure check that flags two-letter entries, unchecked squares, isolated squares,
  disconnected regions, and symmetry violations. Click any problem to jump to it.
- Offending squares are marked directly on the grid — a red wash, border and corner wedge,
  with the reason on hover. Entry-level problems mark every square of the entry, so a
  two-letter word lights up both of its squares; square-level problems mark just the one.
  A count sits under the grid whenever anything is wrong.

Resizing keeps everything that still fits, anchored to the top-left.

**Content mode** is where the puzzle gets filled:

- Type straight into the grid. The cursor advances along the current entry and stops at its
  end rather than running into the next word.
- <kbd>Space</kbd> flips between Across and Down, <kbd>Tab</kbd> / <kbd>Shift</kbd>+<kbd>Tab</kbd>
  move between entries, arrow keys move the cursor (a perpendicular arrow turns first),
  <kbd>Backspace</kbd> deletes and steps back, <kbd>Esc</kbd> deselects.
- <kbd>Shift</kbd>+click or <kbd>Shift</kbd>+drag marks out a rectangle of squares for
  autofill (see below); a plain click or <kbd>Esc</kbd> drops it.
- The entry inspector is where editing happens: the active entry's clue, its pattern (each
  square coloured by how pinned down it is by the entry crossing it), fill suggestions from
  the word list, and a **Lock** button that protects the entry's letters (see below).
- The Fill panel autofills the open squares and marks trouble spots on the grid (see below).
- Across and Down clue lists are a read-only overview that stays in sync with the grid — click
  a clue to jump to its entry, and the list scrolls to follow the cursor.
- A to-do panel counts filled entries and written clues and lists what is still missing.

**Print view** (`Print` in the toolbar) renders a numbered empty grid with two-column clue
lists, plus a *Show answers* toggle for a solution sheet.

Everything autosaves ~400 ms after you stop typing. <kbd>Ctrl</kbd>+<kbd>Z</kbd> undoes and
<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> redoes, up to 50 steps; a whole drag of black
squares undoes as one step.

## Word list and fill suggestions

The entry inspector suggests entries for the active slot from a scored word list:

- Everything that fits the letters already in the entry, best score first, minus entries
  already used elsewhere in the grid. The *min score* control in the Fill panel (remembered
  per browser) hides weaker fill here, in autofill, and in the trouble-spot marks.
- A meter on each suggestion shows how many options its **tightest crossing** would have left
  — green is wide open, amber is under five, red means it strands a crossing entirely.
  Stranding suggestions sink to the bottom; hover the meter to see which crossing it is.
- Hover a suggestion to pencil it into the grid; click to write it in (one undo step).
- *NYT×n* marks entries seen in the Rex Parker corpus below. A filled entry shows its own score
  (pick another to rescore it), or offers to add it to your words when it isn't in the list.

### My words

The list is a starting point; your taste overrides it. **Edit my words…** in the Fill panel
opens a per-browser list of your own judgements (kept in `localStorage`):

- **A score** (0–100) replaces the list's score for that entry, or adds the entry if the list
  doesn't have it.
- **Never suggest** bans an entry outright. The × that appears when you hover a suggestion
  does the same in one click.

Overrides apply everywhere the word list is used — suggestions, autofill and the trouble-spot
marks — because the engine rebuilds its index with them applied (a second or so for the full
list; the panel says *Updating word list…* meanwhile, and the previous list keeps answering).
Entries must be 3–25 characters of A–Z or 0–9; spaces are dropped, so *ice age* becomes
ICEAGE.

## Autofill

**Autofill grid** in the Fill panel fills every open square and **pencils** the result in
blue. Pencilled letters are provisional: **Try another fill** replaces them with a different
fill, **Keep fill** turns them into ordinary typed letters, **Erase fill** removes them, and
typing over one inks it. Typed letters are never changed, so the usual loop is: type the
entries you care about, autofill around them, keep what you like, repeat. The whole fill
undoes as one step.

To fill just one corner, <kbd>Shift</kbd>+drag across it (or <kbd>Shift</kbd>+click from the
selected square) and choose **Fill selection**. Only the marked squares are written; every
letter outside them — typed *or* pencilled — stays put and constrains the fill, so you can
fill a grid section by section and keep the parts you like. Pencil inside the selection is
replaced, as with a whole-grid fill. Entries crossing the selection must still come out as
real words, but entries entirely outside it aren't checked: empty squares outside the
selection aren't guaranteed to remain fillable afterwards. If that happens, widen the
selection or fill the whole grid.

**Lock** (in the entry inspector) protects an entry's letters from typing, *Clear letters*
and autofill — useful for theme entries. Locked squares get a small corner notch.

With *Mark squares where few or no letters work* on, open squares that only one or two letters
could fill get amber stripes, and squares where nothing works get red ones — usually a sign
that an entry has no word left. Hover a square for the count.

How it works (`src/lib/autofill.ts`) — a constraint search in the spirit of wave function
collapse:

- Every open square holds the set of letters it could still take; every entry, the set of
  words that still fit, as a bitset over the word list.
- Committing a word narrows its squares, which prunes the crossing entries' words, which can
  rule out letters in *their* squares, and so on until nothing changes (arc consistency). A
  word is only kept if no entry empties along the way.
- The next entry to fill is the one with the fewest words left, weighted by how often it has
  caused dead ends; its best-scoring words are tried first, with a little random jitter so
  reruns differ.
- Dead ends backtrack. Because search times are heavy-tailed, it also restarts early and
  often with fresh jitter, keeping what it learned about the troublesome entries.

It runs in the same worker that indexes the word list, in short slices so it can report
progress and be stopped, and gives up after 30 seconds. Newspaper-style grids typically fill
in well under a second at min score 50–60. Grids with stacked long entries (three 11s or 15s
on top of each other) are genuinely hard: they may need a few seconds, a lower minimum score,
or an extra block. When a search fails it names the entry that caused the most dead ends.

### Building the word list

The list isn't checked in. Build it once:

```bash
mkdir -p data/sources/cwl
curl -L -o data/sources/cwl/xwordlist.dict \
  https://raw.githubusercontent.com/Crossword-Nexus/collaborative-word-list/main/xwordlist.dict
npm run wordlist        # → public/wordlist.txt
```

The base is the [Collaborative Word List](https://github.com/Crossword-Nexus/collaborative-word-list)
(MIT, ~565k entries in `WORD;score` form) — a hand-curated, community-maintained list started
by Crossword Nexus in 2021, reflecting constructors' judgement rather than any one
publication's archive. Any list in that format works with `--base`. If the
Rex corpus is present it contributes seen-in-NYT counts, but no entries — its answers include
themer wordplay and accent-stripped junk (ESPAOL for ESPAÑOL) that don't belong in fill.

The app indexes the list in a Web Worker (about a second for the full list) and hands the
page a copy, which answers pattern queries with bitset intersections — fast enough to re-rank
every candidate against its crossings on each keystroke. The worker keeps its own copy for
autofill. Each copy is about 24 MB of bitsets plus the 564k words themselves — very roughly
45 MB, so around 90–100 MB for the two. The worker also holds on to the parsed entries so it
can rebuild without re-downloading when your words change.

## Answer corpus

`tools/rex/scrape.mjs` builds a clue/answer corpus by reading the Blogger JSON feed of
[Rex Parker Does the NYT Crossword Puzzle](https://rexwordpuzzle.blogspot.com/).

```bash
node tools/rex/scrape.mjs                # whole archive (~7,400 posts, ~4 min)
node tools/rex/scrape.mjs --limit 200    # quick sample
node tools/rex/scrape.mjs --resume       # continue after an interruption
```

Output lands in `data/` (git-ignored — regenerate it locally rather than redistributing clue
text harvested from someone else's blog):

| file | contents |
| --- | --- |
| `clues.jsonl` | one `{answer, clue, number, dir, date, url}` per line |
| `wordlist.txt` | `ANSWER<TAB>count`, most frequent first |
| `summary.json` | run statistics and a length histogram |

The scraper respects the site's `robots.txt` (only `/search` and `/share-widget` are
disallowed), identifies itself in the User-Agent, sleeps between requests, and retries with
exponential backoff. It checkpoints after each page, so `--resume` picks up where it left off.

### What this corpus is and is not

It is **not** a complete record of each puzzle. The blog discusses a subset of each grid's
entries and posts the solved grid as an image, so roughly 10 of a puzzle's ~76 entries are
recoverable as text. Coverage skews toward theme answers and entries the blogger found
notable — which means unusual fill is over-represented and routine short fill is
under-represented, relative to a real puzzle.

Extraction handles the four conventions the blog has used over its twenty years:

```
"MOONLIGHT SONATA" (17A: Classic Beethoven piano piece)    answer-first
39A: Sarcastic title girl of 1990s-2000s MTV (DARIA) —     clue-first
4D: Locales for rest stops (roadsides)                     clue-first, early lowercase
11D: SNELLEN [Herman ___, Dutch ophthalmologist]           bracketed, guest bloggers
```

`tools/rex/parse.test.mjs` covers all four plus the failure modes that produced bad rows
during development: prose captured as an answer, a clue running past its entry into the
following commentary, a parenthesis nested inside a quoted title, and a clue followed by a
qualifier before the answer (`51D: "___ Dreams of Sushi" (acclaimed 2011 documentary)
("JIRO")` — the answer is the *last* group, not the first).

## How it fits together

```
src/
  types/puzzle.ts        Puzzle, Cell, Slot, Problem
  lib/
    grid.ts              create / resize / block-toggle / symmetry
    slots.ts             numbering and across-down entry extraction
    validation.ts        problem detection and grid statistics
    puzzle.ts            new-puzzle and duplicate factories
    wordlist.ts          scored word list with a per-position bitset index
    wordlist.worker.ts   word engine: indexes the list off the main thread, runs autofill
    suggest.ts           ranks entries for a slot and checks what they leave the crossings
    autofill.ts          the fill search (propagation, backtracking, restarts)
    trouble.ts           finds open squares with few or no workable letters
    router.ts            hash routing (#/, #/puzzle/:id, #/puzzle/:id/print)
  storage/               PuzzleStore interface + localStorage adapter + JSON import/export
  hooks/                 usePuzzle (state, autosave, undo), usePuzzleList, useWordList (engine),
                         useFillSettings (min score, trouble marks), useWordOverrides (my words)
  components/            HomeScreen, PuzzleEditor, Grid, Structure/Content panels, PrintView
```

Two decisions worth knowing about:

**Clues are keyed by start position, not clue number** — `A:row,col` rather than `1-Across`.
Numbers are derived from the block layout and shift whenever a block moves, so number-keyed
clues would scramble the moment you edit the grid.

**Storage sits behind an interface.** `src/storage/types.ts` defines `PuzzleStore` (`list`,
`get`, `save`, `remove`), and `src/storage/index.ts` binds it to the localStorage adapter.
Every method is async, so swapping in a server-backed adapter means writing one new file and
changing that one binding — no UI code touches storage directly.

Because puzzles live in browser storage, they are per-browser and are lost if you clear site
data. Use **Export** on the home screen to keep a JSON copy; **Import** brings it back (always
as a new puzzle, so it never overwrites what you already have).
