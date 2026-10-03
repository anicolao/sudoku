# Puzzle links and shared work

Document status: implemented sharing and import contract. This document defines
the readable URL format, its validation and privacy boundary, and the rules a
future format version must preserve.

## 1. Product contract

Sharing remains local-first:

- no sharing server, account, URL shortener, analytics endpoint, hosted QR API,
  or remote puzzle database;
- no solution embedded in a URL or QR code;
- all parsing, solving, uniqueness checking, logical rating, encoding, and QR
  rendering happen in the browser;
- incoming data remains ephemeral until it validates and the user explicitly
  accepts it;
- existing local games are never silently replaced.

The app supports three presentations of one readable format:

| Purpose | URL form | Contents |
| --- | --- | --- |
| Start a clean puzzle | `?p=<81 cells>` | Literal givens only |
| Start with basic candidates | `?p=<81 cells>&givens=basic` | Literal givens plus locally computed row/column/box candidates |
| Show puzzle work or a pattern hint | `?p=<81 cells>_<field>...` | Givens, placements, candidates, optional progress metadata, and optional persistent pattern cells |
| Walk through shared work | `?p=<progress>&view=walkthrough` | The same progress, presented as ordered instructional placements |

Neither choice represents synchronization. The recipient creates an independent
local attempt. A work link includes time, hinted cells, mistakes, and settings
when the corresponding optional fields are present. Source event history, undo
history, device identity, and other History entries are never included in these
puzzle links. Entire-history analysis uses the separate local download described
below.

## 2. Puzzle links

A puzzle URL contains exactly one `p` query parameter. Its first field is 81
ASCII characters in row-major order: digits `1`–`9` are givens and `.` is
empty. With no following fields, the recipient starts with no work.

```text
https://sudoku.annasdadpress.com/?p=53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79
```

Literal givens are deliberately readable and small. The URL does not claim a
solution, ID, level, seed, technique, or clue count.

The optional sibling parameter `givens=basic` starts every empty cell with all
digits not already present in its original row, column, or box. This is only a
candidate calculation: singleton candidates stay as small notes, and no solving
technique is applied. The option is parsed before work, so explicit note edits
or placements in `p` are replayed on top of the computed candidates. Repeated,
conflicting, or unknown `givens` values are rejected with an unsupported-option
message. Omitting the parameter retains the blank-note behavior.

Opening a link:

1. renders **Checking shared puzzle…** without writing an event;
2. validates and solves the givens in a worker with a two-second default
   deadline;
3. shows level, clue count, work counts, and a short local fingerprint only
   after success;
4. waits for **Start this puzzle**, **Open shared work**, or **Open walkthrough**;
5. appends one `game/imported` origin and removes `p` with
   `history.replaceState` after consent.

A puzzle that is unique but beyond the implemented logical curriculum is
accepted as **Custom**. Uniqueness, not curriculum classification, is the
playability boundary for an imported puzzle.

If the tab-selected game is active, the consent card offers **Keep current
puzzle** or **Abandon current and open shared puzzle**. The latter appends the
ordinary abandonment event before the import. Merely visiting a link never
abandons anything.

## 3. Readable puzzle-work grammar

Work and metadata follow the initial board as underscore-separated fields. Row
and column coordinates are one-based digits. The decoded grammar is:

```text
payload       = givens ("_" field)*
givens        = 81 × ("." | "1" … "9")
field         = action | metadata
action        = placement | note-add | note-remove
placement     = row column value
note-add      = row column "+" candidates "+"
note-remove   = row column "-" candidates "-"
candidates    = 1 … 9 unique digits
metadata      = "time=" milliseconds
              | "hints=" coordinates ("," coordinates)*
              | "mistakes=" count
              | "settings=" setting-bits
              | "pattern=" coordinates ("," coordinates)*
coordinates   = row column
setting-bits  = 8 × ("0" | "1" | "-")
```

For example, `548` places 8 in r5c4, `54+489+` adds candidates 4, 8,
and 9 there, and `54-4-` removes candidate 4. In a literal URL, `+` is
percent-encoded as `%2B` and `=` as `%3D`; `URLSearchParams` decodes them before
parsing.

Actions are applied from left to right. A placement replaces an earlier value
and clears that cell's notes. A note action is rejected if the cell currently
has a value. All work must target cells that were empty in the givens. Candidate
removal is idempotent, so removing an absent candidate has no effect. Wrong
values, conflicting values, and notes that do not match the solution are valid
player work and are reconstructed rather than corrected.

When the app creates a work link, it serializes the current board in row-major
order: one placement per filled editable cell and grouped note actions per
noted cell. For a `givens=basic` attempt, these actions are differences from the
computed baseline, so deleted candidates are explicit note removals and added
candidates are explicit note additions. Consecutive note edits with the same cell and operation are
coalesced into one action with unique sorted candidates. Thus a cell's surviving
candidates are never expanded into one action per digit. The format accepts at
most 512 actions and 4,096 decoded characters.

Every metadata field is optional, may appear in any order, and may appear only
once. `time` is active elapsed time in milliseconds, bounded at 365 days.
`hints` lists the coordinates of cells previously revealed by a hint, including
a cell the player later overwrote or erased. Its length is the hint count.
`mistakes` is bounded at 1,000,000. `settings` contains eight positions
in this order: check mistakes, auto-remove notes, show timer, number-first,
notes-first, bold notes, large notes, and highlight matching notes. `0` is off,
`1` is on, and `-` omits that individual setting. At least one position must be
included. Unknown metadata is rejected instead of ignored.

`pattern` lists distinct cells to display with the walkthrough's pale-green
**Rule pattern** highlight. For example, `pattern=12,18,72,78` highlights
r1c2, r1c8, r7c2, and r7c8. Pattern cells may be given or editable and reveal
neither a digit nor a target cell. They remain highlighted through edits,
reloads, and restarts. A clean puzzle link may contain `pattern` without any
work or progress fields.

The app's sharing links preserve pattern cells when the source puzzle contains
them. **Share puzzle with work** emits time and mistakes even when
zero, emits hinted cells when there are any, and emits all eight settings. Its
canonical order is placements and notes, then pattern, time, hints, mistakes, and the
settings bundle. Hand-written links may omit any or all of these additions;
omitted progress starts at zero and omitted settings retain the recipient's
current preference.

### Walkthrough view selector

An optional sibling query parameter, `view=walkthrough`, asks the recipient to
present the shared placement actions as a solve walkthrough. It is accepted
only when `p` contains at least one placement; metadata remains optional.
Unknown or repeated `view` values are rejected.

The shared puzzle is still validated and remains ephemeral until explicit
consent. The ready card offers **Open walkthrough**; accepting it writes the
same single import origin, displays the existing analysis progress bar, and
opens at placement 1 without first showing the play board. If another puzzle is
active, the existing abandon-or-keep consent remains in force.

Placement actions are analyzed in their URL order. Notes between placements are
replayed into subsequent board states but are not walkthrough steps. Because the
format carries one final elapsed time rather than per-action timestamps, each
shared walkthrough step displays that shared time. The Share dialog never emits
`view=walkthrough`; it is reserved for intentionally authored links such as
those printed in the book.

## 4. Sharing flow

Share is available during active play and from every History card. The dialog
offers:

- **Share puzzle only** — prepare clean givens without changing the source;
- **Share puzzle with work** — prepare current values, candidates, time, hinted
  cells, mistakes, and settings.

Neither choice pauses the source game or appends an event. The ready dialog
contains a locally rendered QR, **Copy link**, optional native **Share link…**,
and **Done**.

The work stream is stored atomically with the recipient's `game/imported`
origin. It is an initial board state, not imported undo history: undo applies
only to moves made after opening the link. A fully filled valid stream opens as
a completed game; partial work opens as an active game.

### Candidate-ready starts

The preferred candidate-ready form is `?p=<81 cells>&givens=basic`. Its locally
computed note matrix becomes the attempt's immutable fresh-start baseline.
Restart removes later placements and note edits, resets the normal progress
counters, and recomputes the same supplied state from the original givens.
Opening the original URL again creates another fresh notes-ready attempt even
if an older copy is saved locally.

Legacy links that explicitly add the complete candidate matrix remain valid. A
note-only link without progress metadata that leaves every editable cell with
at least one candidate still establishes that matrix as its restart baseline.
When that matrix exactly equals the basic candidates, subsequent fresh sharing
and printed QRs use the compact option.

The Share dialog then offers a candidate-filled print and a givens-only print.
The candidate print uses the baseline, not current work, and its first-page QR
uses compact `givens=basic` when the baseline is the basic candidate matrix.
The givens-only QR contains no work. Neither link adds `view`.

## 5. Validation

Incoming givens are separated from the optional work fields and accepted only
when:

- the givens field is exactly 81 characters containing only `1`–`9` and `.`;
- it contains 17–80 givens;
- no row, column, or 3×3 box has duplicate givens;
- the exhaustive solver finds exactly one solution, stopping after two;
- the derived solution is a valid solved grid and agrees with every given;
- every work action satisfies the grammar, bounds, and ordered-state rules in
  section 3;
- optional metadata has known, unique fields and valid bounds, hinted cells
  target cells editable in the initial puzzle, pattern cells are distinct valid
  coordinates, and settings are booleans.

After exhaustive validation, the logical solver rates the puzzle up to Master.
If it cannot reach the same solution within that curriculum, the rating is
`custom` rather than a rejection.

The worker returns a derived solution, clue count, final filled/noted counts,
full SHA-256 fingerprint, and rating. The persisted puzzle ID uses the first 12
fingerprint characters; the UI displays a shorter prefix. The fingerprint
identifies equal givens but is not a signature and proves no authorship.

The receiver derives conflicts, current mistake cells, completion, and future
undo availability. It restores only the explicitly shared counters, timer,
hinted-cell marks, and settings.

## 6. Event-sourced import

New links use one origin event:

```ts
interface GameImportedEvent extends EventEnvelope {
  type: 'game/imported';
  payload: {
    gameId: string;
    importKind: 'puzzle-link';
    transferId: null;
    puzzle: PuzzleDefinition;
    settings: GameSettings;
    checkpoint: null;
    work?: ImportedPuzzleWorkAction[];
    sharedMetadata?: ImportedPuzzleMetadata;
    initialView?: 'walkthrough';
    startingNotesMode?: 'basic';
  };
}
```

Clean links use puzzle-link format version 1. Work-only links use version 2 and
carry a non-empty validated work array. A link containing the original optional
progress metadata uses version 3, with or without work. A link containing
`pattern` uses version 4, optionally alongside work or other metadata. Replay
validates the stored import again before constructing the game.

The persisted puzzle contains the locally derived solution so future replay is
independent of solver changes. The reducer retains read compatibility with
historical `progress-transfer` origin events already saved by older builds, but
the application no longer creates or accepts opaque transfer links.

## 7. QR, URL, and privacy rules

The bundled `qrcode` dependency renders a 224 px data URL with error correction
level Q, a four-module quiet zone, and local black-on-white output. Short-height
layouts reduce the displayed dimensions while retaining the full matrix.

Links are constructed from the current application URL, so root and subpath
deployments remain valid. Puzzle URLs clear prior search and fragment data
before adding `p` and, when needed, `givens=basic`; generated Share links never
add `view`.

All links are bearer data, not encryption. Anyone who can read the link or QR
can reconstruct its contents. Givens, work, and included progress metadata
appear in the `p` query and may be visible to the static host, browser history,
and copied-link destinations. The
application keeps `Referrer-Policy: no-referrer` and does not intentionally
write generated links to its event stream, IndexedDB, localStorage, console, or
service-worker cache. Copy and native Web Share failures keep the dialog and QR
available while reporting a local error.

The QR is supplementary. Its accessible alternative is the Copy link button;
the application does not request camera permission or implement a scanner.

## 8. Parameter and failure handling

| Situation | Behaviour |
| --- | --- |
| More than one `p` value | Reject as ambiguous and append nothing |
| Empty, malformed, or unsupported value | Show an invalid-link reason and append nothing |
| Unknown/repeated `view`, or walkthrough without progress/placements | Reject and append nothing |
| Unknown or repeated `givens` option | Reject as unsupported and append nothing |
| Invalid coordinates, action/metadata syntax, target, duplicate, or bounds | Reject and append nothing |
| Duplicate givens, no solution, or multiple solutions | Reject and append nothing |
| Unique puzzle beyond the curriculum | Accept as Custom |
| Worker timeout or error | Terminate it, report a safe failure, and append nothing |
| Active local game is selected | Require keep-current or abandon/open consent |
| IndexedDB unavailable | Permit explicit memory-only acceptance with the existing warning |
| Installed recipient is offline | Decode, validate, and import locally |
| First-ever recipient visit is offline | Browser owns the load failure; no remote fallback |
| Clipboard or native share fails | Keep the ready link and QR visible and report the error |

The application removes a consumed `p` parameter only after a successful
import. Dismissing an incoming card removes it without altering local games.

## 9. Verification

Unit tests cover structural puzzle errors, unique/no/multiple solutions,
logical rating, work parsing and coalescing, candidate edits, optional metadata,
completed-work derivation, worker timeouts, fingerprints, historical
stored-event replay, URL construction, and base-path handling.

Browser scenario 014 proves a literal-givens URL remains ephemeral until
consent, then creates one imported stream with the locally derived solution and
cleans the address. Scenario 022 proves both Share choices, grouped candidate
and metadata encoding, pixel-decoded QR equality, fresh-context validation,
atomic import, and responsive presentation. Scenario 007 covers work sharing
from a completed History card without adding an event.
Scenario 023 proves an authored `view=walkthrough` link remains ephemeral until
consent, records one marked import, shows analysis progress, cleans both query
parameters, and opens on its first ordered placement.
Scenario 027 uses a long, dense frozen Candidates Done puzzle to prove compact
candidate import, exact note parity, delta sharing, reload and restart parity,
distinct print choices, fixed-slot printed notes, compact QR payload parity,
native-print selection, and a legacy-link reopen on phone, tablet, and desktop.

The privacy suite enforces same-origin requests, and the installed-offline suite
proves that puzzle state and History remain outside the application-shell cache.

## 10. Versioning rules

Future sharing work must:

1. allocate a new format version rather than changing an existing meaning;
2. retain strict decoded and action-count bounds before allocation;
3. derive and validate the solution locally;
4. reject unknown fields instead of partially applying them;
5. preserve explicit consent and independent-copy language;
6. document any additional data and its query-visibility implications;
7. add parsing, replay, QR evidence, and updated failure documentation.

Full history uses a separate, explicitly requested local file transport:
`format: "sudoku-history"`, `formatVersion: 1`. Unlike puzzle links, it intentionally
includes complete stored origins, solutions and original event IDs for analysis.
The download dialog discloses those contents; the user sends the file manually.
No export data enters a query string or an automatic network request. See
[ARCHITECTURE.md](ARCHITECTURE.md#entire-history-analysis-export) for its snapshot,
versioning and coverage contract. The file is not accepted by puzzle-link import.

## Killer links (format 5)

Killer has a versioned header inside the existing `p` parameter:

```text
K1!<81 givens>!<total>.<cell coordinates>-<total>.<cell coordinates>...
```

Coordinates are consecutive two-digit row/column pairs (11 through 99). For
example, `13.111213` describes a total-13 cage at r1c1, r1c2, r1c3. Cages are
sorted by their first cell and cells within each cage are sorted. The header
carries Killer rules version 1, including complete connected coverage and no
repeated digits. Existing underscore-separated work and metadata tokens follow
unchanged. The decoded 4,096-character and 512-action limits still apply.

The validator derives a unique solution using cage and classic constraints in
a worker bounded at ten seconds and 50,000 exact-search nodes. It derives the
Killer logical difficulty locally rather than trusting a rating from the sender;
unsupported profiles remain unrated. No rating metadata is added to the wire
format. Canonical givens and cage rules determine the fingerprint;
work does not. Missing variant on older saved games remains classic. Format 5
imports retain cages through replay, work transfer and re-sharing. Unsupported
headers and malformed partitions are rejected, never treated as classic grids.
Solutions are never serialized in Killer links.

For a clean Killer link with `view=walkthrough`, validation also derives a full
supported logical placement sequence locally. An unsupported solve is rejected
with an explanation; the clean puzzle can still be opened without that view.
The resulting placements are stored as imported work with format 5 provenance.
This keeps printed Killer QR payloads small without embedding solution digits.
The classic walkthrough-link contract is unchanged.
