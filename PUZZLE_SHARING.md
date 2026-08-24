# Puzzle links and progress transfers

Document status: implemented sharing and import contract. This document defines
the two link formats, their validation and privacy boundaries, and the rules a
future format version must preserve.

## 1. Product contract

Sharing remains local-first:

- no sharing server, account, URL shortener, analytics endpoint, hosted QR API,
  or remote puzzle database;
- no solution embedded in a URL or QR code;
- all parsing, solving, uniqueness checking, logical rating, encoding,
  checksum handling, and QR rendering happen in the browser;
- incoming data remains ephemeral until it validates and the user explicitly
  accepts it;
- existing local games are never silently replaced.

There are two formats:

| Purpose | URL form | Contents | HTTP visibility |
| --- | --- | --- | --- |
| Start a clean puzzle | `?p=<81 cells>` | Literal givens only | Query is visible to the static host |
| Copy current progress | `#t=<versioned payload>` | Givens and one compact board checkpoint | Fragment is not sent in requests |

Puzzle givens are not treated as private. Values, notes, time, hints, mistakes,
and settings are more personal, so progress uses a fragment and the application
keeps `Referrer-Policy: no-referrer`. Neither format represents synchronization:
the recipient creates an independent local attempt.

## 2. Puzzle-only links

A puzzle URL contains exactly one `p` query parameter whose value is 81 ASCII
characters in row-major order. Digits `1`–`9` are givens and `.` is empty.

```text
https://anicolao.github.io/sudoku/?p=53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79
```

Literal givens are deliberately readable and small. The URL does not claim a
solution, ID, level, seed, technique, or clue count.

Opening a link:

1. renders **Checking shared puzzle…** without writing an event;
2. validates and solves the givens in a worker with a two-second default
   deadline;
3. shows level, clue count, and a short local fingerprint only after success;
4. waits for **Start this puzzle**;
5. appends one `game/imported` origin and removes `p` with
   `history.replaceState` after consent.

A puzzle that is unique but beyond the implemented logical curriculum is
accepted as **Custom**. Uniqueness, not curriculum classification, is the
playability boundary for an imported puzzle.

If the tab-selected game is active, the consent card offers **Keep current
puzzle** or **Abandon current and open shared puzzle**. The latter appends the
ordinary abandonment event before the import. Merely visiting a link never
abandons anything.

## 3. Progress-transfer flow

Share is available during active play and from every History card. The dialog
always offers:

- **Share puzzle only** — prepare clean givens without changing the source;
- **Prepare progress transfer** — freeze the selected attempt's current
  checkpoint.

Preparing progress for an unpaused active attempt appends the ordinary
`game/paused` event first. The source remains paused after the dialog closes so
the link continues to describe a stable checkpoint. Preparing a solved or
abandoned History attempt adds no event.

The ready dialog contains a locally rendered QR, **Copy link**, optional native
**Share link…**, and **Done**. Active transfers state:

> This creates a copy on the other device. Your game stays paused here until
> you resume or abandon it.

Terminal History transfers state that the saved board and its local history
remain on this device. In either case, the link contains only the current board
checkpoint—not the source event log, undo/redo stacks, or any other History
entry.

## 4. Receiving progress

The recipient opens a URL such as:

```text
https://anicolao.github.io/sudoku/#t=U0QB...
```

The app shows **Checking transferred puzzle…**, validates the payload in a
worker with a four-second default deadline, independently validates the
underlying puzzle, and then presents a summary of level, filled cells, noted
cells, time, hints, and mistakes.

Nothing is persisted until **Continue on this device** is selected. Acceptance
appends one `game/imported` event containing the checked puzzle and paused
checkpoint, removes the fragment, and displays the paused game. An incomplete
or abandoned source checkpoint can be resumed as a new active attempt. A solved
checkpoint is immediately derived as complete and remains read-only.

Transfer IDs are 96 random bits represented as 24 lowercase hexadecimal
characters. If the receiving browser already contains a `game/imported` event
with that ID, another scan opens the existing local game instead of adding a
duplicate import.

## 5. Puzzle validation

Incoming givens are accepted only when:

- the string is exactly 81 characters containing only `1`–`9` and `.`;
- it contains 17–80 givens;
- no row, column, or 3×3 box has duplicate givens;
- the exhaustive solver finds exactly one solution, stopping after two;
- the derived solution is a valid solved grid and agrees with every given.

After exhaustive validation, the logical solver rates the puzzle up to Master.
If it cannot reach the same solution within that curriculum, the rating is
`custom` rather than a rejection.

The worker returns a derived solution, clue count, full SHA-256 fingerprint, and
rating. The persisted puzzle ID uses the first 12 fingerprint characters; the
UI displays a shorter prefix. The fingerprint identifies equal givens but is
not a signature and proves no authorship.

## 6. Checkpoint validation

After the underlying puzzle passes, the progress record must also satisfy:

- exactly 81 value slots, each empty or a digit `1`–`9`;
- exactly 81 note sets containing unique digits `1`–`9`;
- no value or note attached to a given;
- no notes on a filled editable cell;
- each hinted cell is in range and contains its derived solution value;
- the hinted-cell mask has no duplicate or out-of-range cells;
- hint and mistake counts are bounded non-negative safe integers;
- hint count equals the hinted-cell mask size;
- elapsed time is an integer from zero through 365 days;
- only known settings flags are used and reserved bits are zero;
- the record is paused, checksum-valid, fully consumed, and contains no trailing
  bytes.

Wrong values, conflicts, and candidate-inconsistent notes are valid player
progress. The receiver reconstructs them, then derives conflicts, mistake cells,
completion, and future undo availability rather than trusting those projections.

## 7. Version 1 binary format

`t` is unpadded base64url over this binary record:

```text
magic: ASCII S D, version 1
transfer ID: 12 bytes
givens: 81 × 4 bits
values: 81 × 4 bits
notes: 81 × 9-bit masks
hinted cells: 81-bit mask
elapsed milliseconds: unsigned varint
hint count: unsigned varint
mistake count: unsigned varint
settings/marker flags: 1 byte
CRC-32: 4 bytes
```

Four-bit cells use zero for empty and `1`–`9` for digits. CRC-32 detects
accidental corruption; it is not authentication. The implementation has a
512-byte decoded limit and 768-character encoded limit before allocation.

Flags currently encode:

| Bit | Meaning |
| ---: | --- |
| 0 | Check mistakes |
| 1 | Automatically remove matching peer notes |
| 2 | Show timer |
| 3 | Number-first input |
| 4 | Required format marker |
| 5 | Start in Notes mode |
| 6–7 | Reserved; must be zero |

Bold notes, large notes, and matching-note highlighting are device appearance
preferences and are not transferred in version 1.

The format deliberately omits:

- the solution, which the recipient derives;
- source event IDs, sequence numbers, timestamps, and game ID;
- the source event log and undo/redo stacks;
- selected cell, selected digit, current input mode, navigation, and dialogs;
- device, browser, or account identity.

The recipient's readable log begins with the import origin. Undo affects only
moves made after import.

## 8. Event-sourced import

Both link forms use the same origin event:

```ts
interface GameImportedEvent extends EventEnvelope {
  type: 'game/imported';
  payload: {
    gameId: string;
    importKind: 'puzzle-link' | 'progress-transfer';
    transferId: string | null;
    puzzle: PuzzleDefinition;
    settings: GameSettings;
    checkpoint: ImportedCheckpoint | null;
  };
}
```

Puzzle-link imports require a null transfer ID and checkpoint plus puzzle-link
provenance. Progress imports require a valid transfer ID, a checkpoint, and
progress-transfer provenance. Replay validates the stored import again before
constructing the game.

The persisted puzzle contains the locally derived solution so future replay is
independent of solver changes. Provenance distinguishes generated puzzles,
puzzle links, and progress transfers instead of pretending an import came from
the generator.

## 9. QR, URL, and privacy rules

The bundled `qrcode` dependency renders a 224 px data URL with error correction
level Q, a four-module quiet zone, and local black-on-white output. Short-height
layouts reduce the displayed dimensions while retaining the full matrix.

Links are constructed from the current application URL, so root and subpath
deployments remain valid. Puzzle URLs clear prior search and fragment data before
adding `p`. Transfer URLs clear the search before adding `t` to the fragment.

Transfer links are bearer data, not encryption. Anyone who can read the QR or
fragment can reconstruct the checkpoint. The application does not intentionally
write generated links to its event stream, IndexedDB, localStorage, console,
service-worker cache, or an HTTP request. Copy and native Web Share failures keep
the dialog and QR available while reporting a local error.

The QR is supplementary. Its accessible alternative is the Copy link button;
the application does not request camera permission or implement a scanner.

## 10. Parameter and failure handling

| Situation | Behaviour |
| --- | --- |
| More than one `p`/`t`, or both forms | Reject as ambiguous and append nothing |
| Empty, malformed, or unsupported value | Show an invalid-link reason and append nothing |
| Duplicate givens, no solution, or multiple solutions | Reject and append nothing |
| Unique puzzle beyond the curriculum | Accept as Custom |
| Transfer checksum, flags, padding, version, or bounds fail | Reject and append nothing |
| Worker timeout or error | Terminate it, report a safe failure, and append nothing |
| Active local game is selected | Require keep-current or abandon/open consent |
| Existing transfer ID | Remove the fragment and open the existing import |
| IndexedDB unavailable | Permit explicit memory-only acceptance with the existing warning |
| Installed recipient is offline | Decode, validate, and import locally |
| First-ever recipient visit is offline | Browser owns the load failure; no remote fallback |
| Clipboard or native share fails | Keep the ready link and QR visible and report the error |

The application removes a consumed parameter only after a successful import or
idempotent transfer match. Dismissing an incoming card removes it without
altering local games.

## 11. Verification

Unit tests cover structural puzzle errors, unique/no/multiple solutions,
logical rating, worker timeouts, fingerprints, codec round trips and the golden
vector, checksum and field tampering, hint consistency, imported replay,
idempotency, URL construction, and base-path handling.

Browser scenario 014 proves a literal-givens URL remains ephemeral until
consent, then creates one imported stream with the locally derived solution and
cleans the address. Scenario 015 proves both Share choices, source pause,
pixel-decoded QR equality, clipboard equality, fragment privacy, fresh-context
validation and import, post-import undo boundary, and duplicate-scan
idempotency. Scenario 007 covers progress sharing from a completed History card
without adding an event.

The privacy suite enforces same-origin requests, and the installed-offline suite
proves that puzzle state and History remain outside the application-shell cache.

## 12. Versioning rules

Future sharing work must:

1. allocate a new format version or reserved bit rather than changing version 1
   meaning;
2. retain strict decoded and encoded bounds before allocation;
3. derive and validate the solution locally;
4. reject unknown fields or flags instead of partially applying them;
5. keep progress in a fragment unless the privacy model is deliberately
   redesigned;
6. preserve explicit consent and independent-copy language;
7. add a golden vector, tamper tests, replay tests, QR evidence, and updated
   failure documentation.

A future “full replay” export should be a separate versioned transport. It must
not serialize raw stored origins because those contain the local solution and
internal event IDs.
