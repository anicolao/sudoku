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

The app offers two views of one readable format:

| Purpose | URL form | Contents |
| --- | --- | --- |
| Start a clean puzzle | `?p=<81 cells>` | Literal givens only |
| Show puzzle work | `?p=<81 cells>_<action>...` | Givens, placements, and candidates |

Neither choice represents synchronization. The recipient creates an independent
local attempt. Time, hints, mistakes, settings, source event history, and undo
history are not shared.

## 2. Puzzle links

A puzzle URL contains exactly one `p` query parameter. Its first field is 81
ASCII characters in row-major order: digits `1`–`9` are givens and `.` is
empty. With no following fields, the recipient starts with no work.

```text
https://anicolao.github.io/sudoku/?p=53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79
```

Literal givens are deliberately readable and small. The URL does not claim a
solution, ID, level, seed, technique, or clue count.

Opening a link:

1. renders **Checking shared puzzle…** without writing an event;
2. validates and solves the givens in a worker with a two-second default
   deadline;
3. shows level, clue count, work counts, and a short local fingerprint only
   after success;
4. waits for **Start this puzzle** or **Open shared work**;
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

Work follows the initial board as underscore-separated actions. Row and column
coordinates are one-based digits. The decoded grammar is:

```text
payload       = givens ("_" action)*
givens        = 81 × ("." | "1" … "9")
action        = placement | note-add | note-remove
placement     = row column value
note-add      = row column "+" candidates "+"
note-remove   = row column "-" candidates "-"
candidates    = 1 … 9 unique digits
```

For example, `548` places 8 in r5c4, `54+489+` adds candidates 4, 8,
and 9 there, and `54-4-` removes candidate 4. In a literal URL, `+` is
percent-encoded as `%2B`; `URLSearchParams` decodes it before parsing.

Actions are applied from left to right. A placement replaces an earlier value
and clears that cell's notes. A note action is rejected if the cell currently
has a value. All work must target cells that were empty in the givens. Candidate
removal is idempotent, so removing an absent candidate has no effect. Wrong
values, conflicting values, and notes that do not match the solution are valid
player work and are reconstructed rather than corrected.

When the app creates a work link, it serializes the current board in row-major
order: one placement per filled editable cell and one grouped note-add action
per noted cell. Consecutive note edits with the same cell and operation are
coalesced into one action with unique sorted candidates. Thus a cell's surviving
candidates are never expanded into one action per digit. The format accepts at
most 512 actions and 4,096 decoded characters.

## 4. Sharing flow

Share is available during active play and from every History card. The dialog
offers:

- **Share puzzle only** — prepare clean givens without changing the source;
- **Share puzzle with work** — prepare the current values and candidates.

Neither choice pauses the source game or appends an event. The ready dialog
contains a locally rendered QR, **Copy link**, optional native **Share link…**,
and **Done**.

The work stream is stored atomically with the recipient's `game/imported`
origin. It is an initial board state, not imported undo history: undo applies
only to moves made after opening the link. A fully filled valid stream opens as
a completed game; partial work opens as an active game.

## 5. Validation

Incoming givens are separated from the optional work fields and accepted only
when:

- the givens field is exactly 81 characters containing only `1`–`9` and `.`;
- it contains 17–80 givens;
- no row, column, or 3×3 box has duplicate givens;
- the exhaustive solver finds exactly one solution, stopping after two;
- the derived solution is a valid solved grid and agrees with every given;
- every work action satisfies the grammar, bounds, and ordered-state rules in
  section 3.

After exhaustive validation, the logical solver rates the puzzle up to Master.
If it cannot reach the same solution within that curriculum, the rating is
`custom` rather than a rejection.

The worker returns a derived solution, clue count, final filled/noted counts,
full SHA-256 fingerprint, and rating. The persisted puzzle ID uses the first 12
fingerprint characters; the UI displays a shorter prefix. The fingerprint
identifies equal givens but is not a signature and proves no authorship.

The receiver derives conflicts, mistake cells, completion, and future undo
availability rather than trusting those projections from the link.

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
  };
}
```

Clean links use puzzle-link format version 1. Links with work use version 2 and
carry a non-empty validated work array. Replay validates the stored import again
before constructing the game.

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
before adding `p`.

All links are bearer data, not encryption. Anyone who can read the link or QR
can reconstruct its contents. Givens and work appear in the `p` query and may be
visible to the static host, browser history, and copied-link destinations. The
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
| Invalid coordinates, action syntax, work target, or bounds | Reject and append nothing |
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
logical rating, work parsing and coalescing, candidate edits, completed-work
derivation, worker timeouts, fingerprints, historical stored-event replay, URL
construction, and base-path handling.

Browser scenario 014 proves a literal-givens URL remains ephemeral until
consent, then creates one imported stream with the locally derived solution and
cleans the address. Scenario 022 proves both Share choices, grouped candidate
encoding, pixel-decoded QR equality, fresh-context validation, atomic import,
and responsive presentation. Scenario 007 covers work sharing from a completed
History card without adding an event.

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

A future full-replay export should be a separate versioned transport. It must
not serialize raw stored origins because those contain the local solution and
internal event IDs.
