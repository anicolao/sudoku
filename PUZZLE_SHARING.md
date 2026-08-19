# Puzzle links and device-to-device transfer

Document status: implemented contract. Scenarios 014 and 015 retain the
reviewable phone, tablet, and desktop evidence.

## 1. Product promise

Sudoku should open a valid classic puzzle from a URL and should let a player
carry an in-progress puzzle to another device by scanning a QR code. Both paths
remain local-first:

- no sharing server, account, database, URL shortener, analytics endpoint, or
  QR-image service;
- no solution embedded in a URL or QR code;
- all parsing, solving, uniqueness checking, rating, encoding, and QR rendering
  happen in the browser;
- an incoming puzzle becomes canonical only after it validates and the player
  explicitly accepts it;
- existing local games are never silently replaced.

There are two related link contracts:

| Purpose | URL form | Contents | Network visibility |
| --- | --- | --- | --- |
| Start a puzzle from its givens | `?p=<81 cells>` | Digits and dots only | The static host can see the query string |
| Continue an in-progress puzzle | `#t=<versioned payload>` | Givens plus a compact progress checkpoint | The fragment is not sent in HTTP requests |

Puzzle givens are not treated as private. In-progress values, notes, timing,
settings, and counts are more personal, so the QR transfer uses a fragment.
The app also keeps its `Referrer-Policy: no-referrer` boundary. It must never
convert a transfer fragment into a query parameter.

## 2. User-visible flows

### Open a puzzle URL

A canonical puzzle URL looks like:

```text
https://anicolao.github.io/sudoku/?p=53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79
```

The `p` value is exactly 81 ASCII characters in row-major order. `1`–`9` are
givens and `.` is an empty cell. A literal format is deliberate: it is easy to
inspect, reproduce, type, and test, and it fits comfortably in a URL. There is
no separate solution or claimed difficulty in the link.

On navigation the app:

1. shows **Checking shared puzzle…** without writing an event;
2. parses and validates the givens in a Web Worker;
3. derives the unique solution locally;
4. rates the logical solve path when the current solver can do so;
5. shows a compact preview summary: clue count, uniqueness, and rated level or
   **Custom**;
6. waits for **Start this puzzle** before appending one canonical import event.

An exhaustive solver proving uniqueness is sufficient for a shared puzzle to
be playable. If the logical solver cannot complete it within the current
curriculum, the app labels it **Custom** rather than rejecting it or inventing a
level. Generated puzzles keep the stronger requirement that their solve path
must match their requested level.

If an active game already exists, the confirmation shows **Keep current
puzzle** and **Abandon current and open shared puzzle**. The second action
appends the normal abandonment fact before importing. Merely visiting a link
never overwrites or abandons anything.

After a successful import, `history.replaceState` removes `p` from the address
bar. Reload then replays the stored game rather than importing a duplicate.

### Prepare an in-progress transfer

An active or paused game has a **Share** action. Selecting it opens a compact
dialog with two choices:

- **Share puzzle only** creates the readable `?p=` URL and starts a fresh board
  for its recipient;
- **Prepare progress transfer** records a pause when necessary and freezes a
  checkpoint for the QR code.

The transfer dialog contains:

- a locally rendered QR code;
- **Copy transfer link** as an accessible alternative to the visual code;
- optional **Share link…** through `navigator.share` when available;
- the exact statement: “This creates a copy on the other device. Your game
  stays paused here until you resume or abandon it.”

Preparing the QR does not append a speculative “shared” event. If the game was
active, the ordinary `game/paused` event is the only state change. Closing the
dialog leaves the source paused so the shown checkpoint remains stable.

The app cannot know that another device successfully opened a fragment-only
link. It therefore must not delete the source, claim that ownership moved, or
prevent the two copies from diverging. True move acknowledgement, live sync,
and merge require coordination infrastructure and are non-goals.

### Continue on the receiving device

Scanning the QR asks the browser to open a URL like:

```text
https://anicolao.github.io/sudoku/#t=AQ...
```

The recipient sees **Checking transferred puzzle…**, followed by a summary of
the level, filled cells, notes, hints, mistakes, and elapsed active time. The
state remains ephemeral until **Continue on this device** is selected.

Acceptance appends one `game/imported` event containing the validated puzzle
and checkpoint. The resulting game starts paused, giving the player a stable
chance to inspect the handoff before selecting **Resume**. The fragment is then
removed with `history.replaceState`.

Scanning the same transfer twice is idempotent. A transfer ID already present
in a local `game/imported` event opens that game instead of creating another.

## 3. Validation contract

Incoming data is hostile until proven otherwise. A checksum detects accidental
QR corruption, but it is not authentication and never replaces domain checks.

### Puzzle validation

The worker accepts a puzzle only when:

- the decoded value has exactly 81 cells and contains only `1`–`9` or `.`;
- it contains 17–80 givens;
- no row, column, or 3×3 box contains duplicate givens;
- every candidate and cell index is within the classic 9×9 domain;
- the exhaustive solver finds exactly one solution, stopping at two;
- the derived solution is a valid solved grid and agrees with every given.

The worker returns the derived solution, clue count, stable puzzle fingerprint,
and optional logical rating. It never trusts a solution, ID, level, technique,
or clue count supplied by the URL.

Validation runs off the UI thread with a bounded deadline. The main thread may
terminate the worker, after which the UI says **This puzzle could not be checked
safely**. It must never fall back to accepting an unvalidated grid.

### Checkpoint validation

After the underlying puzzle passes, a progress checkpoint must also prove:

- exactly 81 value slots, each empty or a digit `1`–`9`;
- givens have no user value or notes attached;
- notes are unique digits `1`–`9` and occur only on empty editable cells;
- every hinted cell contains its derived solution value;
- masks have no bits beyond cell 80 or digit 9;
- hint and mistake counters are bounded non-negative integers;
- elapsed active time is bounded, finite, and non-negative;
- settings flags are known booleans and unknown reserved bits are zero;
- the payload has no trailing bytes or unconsumed fields.

Wrong values and conflicts are valid progress: they are reconstructed and
visibly marked on the receiving device. Candidate-inconsistent pencil notes are
also retained because notes belong to the player. Derived conflicts,
completion, and current mistake cells are recomputed instead of trusted.

## 4. Transfer encoding

`t` is base64url without padding over a fixed, versioned binary record. The
first implementation uses no general-purpose compression, avoiding
decompression bombs and platform-dependent output.

```text
magic/version
transfer ID (96 random bits)
givens (81 four-bit cells)
values (81 four-bit cells)
notes (81 nine-bit masks)
hinted-cell mask (81 bits)
elapsed milliseconds (unsigned varint)
hint count (unsigned varint)
mistake count (unsigned varint)
settings and paused flags
CRC-32
```

Empty four-bit cells use zero; digits use `1`–`9`. Bit order and the CRC
polynomial require golden vectors in the codec tests. Reserved header bits make
incompatible future extensions reject cleanly.

Version 1 assigns settings bit 5 to **Start in Notes mode**. Transfers produced
before that preference existed leave the bit clear and therefore retain the
original value-first behaviour. Bits 6 and 7 remain reserved and must be zero.

The expected payload is roughly 220 bytes and the full URL remains well below
500 characters. Version 1 imposes a hard 512-byte decoded limit and a
768-character encoded limit before allocation. A payload outside those limits
is invalid rather than partially decoded.

The checkpoint deliberately omits:

- the solution, which the recipient derives;
- source event IDs, clock timestamps, device details, and game ID;
- the source move log and pre-transfer undo/redo stacks;
- selected cell, input mode, open dialogs, and other ephemeral UI state.

The receiver can undo only moves made after import. The game log begins with
**Continued transferred puzzle at 12:34** rather than fabricating the source
player’s prior actions.

## 5. Event-sourced import

The existing `game/started` event remains the origin for locally generated
puzzles. Sharing adds one new origin event rather than synthesizing dozens of
historical moves:

```ts
interface GameImportedEvent extends EventEnvelope {
  type: 'game/imported';
  payload: {
    gameId: string;
    importKind: 'puzzle-link' | 'progress-transfer';
    transferId: string | null;
    puzzle: PuzzleDefinition;
    settings: GameSettings;
    checkpoint: null | {
      values: Array<Digit | null>;
      notes: Digit[][];
      hintedCells: number[];
      elapsedMs: number;
      hints: number;
      mistakes: number;
      paused: true;
    };
  };
}
```

Replay validates the import event again before constructing a projection. A
bad stored import produces a diagnostic and no playable game. Later moves use
the existing event types, elapsed-time rules, undo stack, completion derivation,
history, and game-log projection.

`PuzzleDefinition` needs explicit provenance instead of pretending imported
puzzles came from generator version 2:

```ts
type PuzzleRating = PuzzleDifficulty | 'custom';

type PuzzleProvenance =
  | { kind: 'generated'; seed: string; generatorVersion: 1 | 2 }
  | { kind: 'puzzle-link'; formatVersion: 1; fingerprint: string }
  | { kind: 'progress-transfer'; formatVersion: 1; fingerprint: string };
```

The persisted puzzle still includes its exact givens and derived solution so
replay never depends on a later solver version. Existing version-1 and
version-2 generated puzzle definitions remain readable through a pure schema
migration or a backwards-compatible decoder.

The fingerprint is a locally computed SHA-256 digest of canonical givens,
truncated only for display. It identifies equal puzzles; it is not a signature
and conveys no authorship.

## 6. QR generation and privacy

The QR matrix is produced by a bundled, deterministic encoder with a
GPL-compatible license. It renders to SVG or canvas locally; no URL, puzzle, or
image is sent to a third party. Error correction should default to level Q and
the dialog must retain a four-module quiet zone and sufficient contrast.

Links are constructed from the configured application base path, not a
hard-coded production hostname. Creating a transfer link removes unrelated
query parameters and fragments before adding `#t=`, so a prior `?p=` value can
never make a transfer URL ambiguous.

The implementation may use a small audited dependency, but it must not use a
remote script, font, image, analytics hook, dynamic import, or hosted QR API.
The dependency and license are recorded in the repository.

Transfer links are bearer data, not encryption. Anyone who sees the QR or
copied fragment can inspect the checkpoint and open a copy. The dialog states
this plainly. The app does not put transfer URLs in its own event log,
IndexedDB, `localStorage`, console, error reports, service-worker cache, or accessible
hidden text after the dialog closes.

The service worker caches only application assets. Request instrumentation must
prove that neither a query puzzle nor fragment transfer causes an off-origin
request and that the fragment is absent from every observed HTTP request.

## 7. Responsive and accessible interaction

Sharing inherits the application-wide no-scroll contract. Every checkpoint
must fit phone, tablet, desktop, 320 px, landscape, and 200%-equivalent reflow
without document scrolling, nested scrolling, or clipping.

- Share, copy, close, continue, keep-current, and abandon/open controls retain
  at least 44×44 CSS px targets.
- The QR is supplementary. Its accessible name describes its purpose, while a
  real button copies the same link.
- Copy success is announced in a polite live region and does not move focus.
- Validation failures use a heading, a concise reason, **Return to Sudoku**, and
  **Copy invalid value** for debugging when safe.
- At short heights the QR scales down before text or required actions disappear.
- The incoming confirmation traps focus only while modal, closes with Escape,
  and restores focus when there is an in-app invoker.
- Native Web Share is progressive enhancement; copy always works without it.

No camera permission is needed because this release generates QR codes but does
not implement an in-app scanner. The receiving device’s camera or browser owns
scanning.

## 8. Failure and edge cases

| Situation | Required behaviour |
| --- | --- |
| Missing, empty, repeated, or unknown sharing parameter | Show a safe invalid-link state; append nothing |
| Both `p` and `t` are present | Reject as ambiguous; do not choose one silently |
| Structurally invalid or non-unique puzzle | Explain that it cannot be played; append nothing |
| Valid unique puzzle beyond the logical curriculum | Accept as Custom |
| Transfer checksum or version fails | Explain that the QR/link is damaged or unsupported |
| Validation times out | Terminate the worker and append nothing |
| Active local game exists | Require explicit keep-current or abandon/open choice |
| Duplicate transfer ID | Open the already imported local game |
| IndexedDB is unavailable | Allow an explicit memory-only import with the existing warning |
| Recipient is offline with the app installed | Decode, validate, import, and play normally |
| Recipient lacks the installed app while offline | The browser owns the load failure; no remote fallback |
| Clipboard or Web Share fails | Keep the dialog open, retain the QR, and report the local failure |

## 9. Verification contract

Pure tests cover:

- canonical `p` parsing and every structural rejection;
- zero, one, and multiple-solution puzzles;
- worker timeout/cancellation and bounded input sizes;
- rating to each known level and fallback to Custom;
- binary codec round trips, golden vectors, bit order, CRC, reserved bits,
  truncation, trailing bytes, and every field bound;
- arbitrary valid checkpoint property tests;
- puzzle and checkpoint tampering followed by full revalidation;
- deterministic fingerprinting and transfer-ID idempotency;
- `game/imported` replay, diagnostics, elapsed time, conflicts, completion,
  history, and post-import undo boundaries;
- backwards replay of all existing generated puzzle events;
- QR encoder output decoded by an independent standards-compliant decoder.

Playwright Chromium on macOS covers puzzle URLs in scenario 014 and progress
transfer in scenario 015, with one screenshot after every user action:

1. navigate to a valid `?p=` URL and see its checked summary;
2. start it and verify one `game/imported` event plus the exact board;
3. return to a generated puzzle, enter a value, add notes, and request a hint;
4. select Share, then Prepare progress transfer;
5. verify the source is paused and the QR/copy fallback represent the same URL;
6. open that exact URL in a fresh browser context representing another device;
7. accept the transfer and compare values, notes, hint marks, settings, counters,
   elapsed time, givens, and derived solution;
8. resume and make a new move whose undo boundary begins after import;
9. reopen the same transfer and prove it does not create a duplicate;
10. exercise invalid, non-unique, ambiguous, and active-game conflict states.

The independent E2E QR check decodes pixels from the rendered matrix; reading a
convenient DOM attribute alone is not proof that a phone can scan it. The normal
step helper continues to enforce no scrolling, no clipping, target sizes,
semantic assertions, zero-diff screenshots, and generated flip-book README
files.

The privacy journey additionally asserts no off-origin request, no transfer
fragment in requests or caches, and no solution in either link form. The
installed-offline journey transfers into a fresh offline context after both
contexts have installed the shell online.

## 10. Implementation slices

Each slice is one logical commit with unit tests, a user-level E2E continuation,
screenshots, and generated walkthrough updates where it changes visible state.

1. **Puzzle-link codec and validator** — parse `?p=`, derive a solution in the
   worker, rate or mark Custom, enforce bounds, and add pure validation tests.
2. **Incoming puzzle experience** — add checking, invalid, confirmation, active
   game conflict, import event, URL cleanup, and the first scenario-014 steps.
3. **Checkpoint import** — add the versioned binary codec, `game/imported`
   replay, provenance migration, duplicate IDs, and post-import undo boundary.
4. **Share and QR** — add puzzle-only and progress choices, explicit pause,
   local QR rendering, copy/native-share fallbacks, and the two-context transfer
   flip book.
5. **Release hardening** — add independent QR decoding, privacy instrumentation,
   installed-offline transfer, corruption/time-budget cases, accessibility,
   documentation, and full viewport evidence.

## 11. Definition of done

- Every accepted puzzle is structurally valid and has exactly one locally
  derived solution.
- No incoming URL field is trusted merely because its checksum parses.
- The QR transfers the visible playable checkpoint without a backend or
  solution disclosure.
- Source history remains intact and the UI accurately calls the handoff a copy.
- The recipient gets one explainable import origin event and normal events from
  that point forward.
- Existing local games and old event streams replay unchanged.
- Duplicate scans are idempotent and active games require an explicit choice.
- All visible sharing states satisfy the no-scroll/no-clipping helper.
- Unit, Chromium macOS E2E, privacy, offline, build, and zero-diff screenshot
  checks are green.
