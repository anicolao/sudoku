# MVP design

Document status: implemented release contract, extended with the five-level
generator after the original Foundations MVP.

## 1. Release boundary

The MVP is an installable, local-only Svelte SPA for classic 9×9 Sudoku. It
generates puzzles entirely on-device. Every accepted puzzle has exactly one
solution and can be solved without guessing. The original Easy scope is now
named Foundations and is joined by four cumulative chapter levels described in
section 3.

The release supports:

- starting, pausing, resuming, restarting, abandoning, and completing a puzzle;
- fixed givens, user values, pencil notes, conflict highlighting, and optional
  immediate mistake checking;
- cell selection, peer highlighting, number-first and cell-first interaction;
- undo and redo without rewriting history;
- explicit hints that reveal one cell and are counted in the result;
- active elapsed time, with a setting to hide it;
- one resumable current game and a local list of completed/abandoned games;
- a human-readable game log derived from canonical events;
- full reload/restart recovery and previously installed offline use;
- touch, mouse, and keyboard interaction at supported form factors;
- clearing all local Sudoku data.

There is no account, backend, Firebase, runtime AI, analytics, telemetry, remote
font, CDN, or third-party asset. A second tab must not silently become a second
writer: the app uses `BroadcastChannel` when available to warn that another tab
is active and disables game-changing controls in the later tab.

## 2. Technical foundation

- Svelte 5, SvelteKit, TypeScript in strict mode, Vite, and
  `@sveltejs/adapter-static`.
- Client-only routes with a static fallback and base-path-safe asset URLs.
- A small framework-neutral domain under `src/lib/domain/`.
- A local event repository under `src/lib/storage/`; browser APIs do not leak
  into reducers or Sudoku rules.
- Svelte stores expose immutable projections and dispatch commands. Components
  do not construct persisted events directly.
- Vitest covers commands, reducers, Sudoku rules, generation, logical solving,
  uniqueness validation, migrations, selectors, and property invariants.
- Playwright covers observable journeys using the production-shaped SPA.
- A generated service worker caches the versioned app shell only.

Proposed layout:

```text
src/
  lib/
    components/
    domain/
      commands.ts
      events.ts
      reducer.ts
      sudoku.ts
      selectors.ts
      game-log.ts
    generator/
      prng.ts
      generate-solution.ts
      generate-puzzle.ts
      count-solutions.ts
      logical-solver.ts
      validate-puzzle.ts
    storage/
      event-store.ts
      migrations.ts
      storage-schema.ts
    testing/
      fixtures.ts
    app-store.ts
  routes/
    +layout.ts
    +page.svelte
    puzzles/+page.svelte
    history/+page.svelte
    settings/+page.svelte
static/
tests/
  unit/
  e2e/
```

Redux is intentionally omitted. The Food project demonstrates why events and
projections are valuable, but its separately incremented projections can drift
from replay. Sudoku's data volume is small enough to replay on load and after
each append. If performance later requires snapshots, they remain disposable
caches verified against the stream.

## 3. Puzzle generation, validation, and rules

The generator is an MVP foundation, not future scope. It runs locally in a Web
Worker so generation cannot make the Svelte UI unresponsive. Tests may call the
same pure modules synchronously.

Generation is a deterministic pipeline:

1. select the versioned, pre-rated base for the requested chapter level;
2. initialize the versioned PRNG from the explicit seed and level;
3. apply seeded digit, row, column, band, stack, and transpose symmetries that
   preserve Sudoku validity and the logical structure of the base;
4. use an independent exhaustive solver to prove exactly one solution;
5. run the logical solver only up to the requested cumulative technique ceiling;
6. reject a transform unless its actual solve trace is solved, reproduces the
   stored solution, and is classified in the requested band;
7. return the givens, solution, logical solve trace length, attempt count, seed,
   and generator/validator versions.

The rated bases are source data, not remotely downloaded puzzle content. Seeded
symmetries give reproducible variants while keeping generation comfortably off
the UI thread. A bounded sequence of transforms protects against a solver-order
variant changing the band.

Generation has a bounded attempt budget. If it is exhausted, the UI reports
“Could not generate a puzzle yet” and offers Retry; it never returns an
unvalidated puzzle. The worker receives and returns plain data, and cancellation
terminates the outstanding request without creating a game event.

The puzzle committed to a game is:

```ts
interface PuzzleDefinition {
  id: string;                 // derived from generator version and seed
  givens: string;             // exactly 81 chars: 1-9 or .
  solution: string;           // exactly 81 chars: 1-9
  difficulty: 'foundations' | 'intermediate' | 'advanced' | 'expert' | 'master';
  seed: string;
  generatorVersion: 2;
  validatorVersion: 2;
  hardestTechnique: SolveTechnique;
}
```

The chapter ladder follows the locally reviewed *Zero to Hero Review
Solutions* curriculum. It is cumulative:

| Level | Required solve-path band | Technique ceiling |
| --- | --- | --- |
| Foundations | Chapter 1 | full houses, naked singles, hidden singles |
| Intermediate | Chapter 2 | pairs, pointing pairs, box/line reduction |
| Advanced | Chapter 3 | triples, X-Wings, Swordfish, Y-Wings |
| Expert | Chapter 4 | single-digit chains, Simple Colors, XY-Chains, 3D Medusa, Unique Rectangles |
| Master | Chapter 5 | repeated Expert-band steps and multi-technique synthesis |

Classification uses a required floor as well as a ceiling: an Intermediate
puzzle must actually use an Intermediate technique, not merely have fewer
clues than a Foundations puzzle. Master requires at least three Expert-band
steps. Clue ranges are secondary generation constraints, never the rating.

Every generated puzzle must prove before it can be returned:

- `givens` and `solution` have exactly 81 cells;
- each row, column, and 3×3 box in the solution contains 1–9 exactly once;
- every given agrees with the solution;
- the givens have exactly one solution;
- the logical solver reaches that solution without guessing;
- every logical solve step is at or below the selected chapter ceiling and the
  completed trace reaches the selected chapter floor;
- replaying the logical trace from the givens produces the stored solution;
- the same generator version and seed reproduce identical output.

The exhaustive uniqueness solver and logical difficulty solver are separate.
Uniqueness may use backtracking and must count up to two solutions before
stopping. Difficulty validation may not backtrack or guess. A naked pair removes
candidates only when exactly two cells in one unit contain the same two
candidates. A pointing pair removes a candidate outside a box only when all
instances of that candidate inside the box lie on one row or column. These
rules, including near-miss cases, require focused unit tests.

`game/started` copies the complete puzzle definition into the event. Committing
the exact givens and solution makes historical replay independent of later
generator changes, while the seed and versions preserve provenance and permit
reproduction. Persisted values are cell indexes `0..80` and digits `1..9`, never
labels such as “row five, column two.”

The MVP's rule engine distinguishes:

- a **conflict**, where duplicate values exist in a row, column, or box;
- a **mistake**, where an entered value differs from the stored solution and
  immediate checking is enabled;
- **complete**, where all 81 values equal the solution.

Conflicts are always derivable. Mistake count increases only on a newly entered
wrong value while checking is enabled; replay must never count the same event
twice. Completion is derived from the value-entry event that fills the solved
board; no redundant `game/completed` event is required.

## 4. Canonical event model

### Envelope

```ts
type SudokuEvent = {
  id: string;                 // UUID; idempotency key
  sequence: number;           // contiguous within the local store
  gameId: string | null;      // null only for app-level settings
  type: SudokuEventType;
  payload: unknown;
  occurredAt: string;         // injected ISO timestamp for display/audit
  elapsedMs?: number;         // active game time at this event
  schemaVersion: 1;
  reducerVersion: 1;
};
```

IDs, timestamps, and the clock are injected at the command boundary. The
reducer does not call `Date`, `crypto`, browser storage, or any random source.
The stream order is `sequence`; IDs only deduplicate. Sequences are allocated by
the repository immediately before an atomic `localStorage.setItem` of the
single store document.

### Initial vocabulary

| Event | Payload | Purpose |
| --- | --- | --- |
| `game/started` | full immutable puzzle definition, `gameId`, settings snapshot | Start a replayable game |
| `cell/value-entered` | `cell`, `value` | Place or replace one user value |
| `cell/cleared` | `cell` | Clear one user value |
| `cell/note-toggled` | `cell`, `value`, `enabled` | Add/remove one explicit pencil mark |
| `move/undone` | `targetEventId` | Negate the latest reversible active move |
| `move/redone` | `targetEventId` | Reactivate the latest undone move |
| `hint/revealed` | `cell`, `value` | Record the exact help supplied |
| `game/paused` | no additional data | Freeze active elapsed time |
| `game/resumed` | no additional data | Resume active elapsed time |
| `game/restarted` | no additional data | Reset mutable cells within the same game history |
| `game/abandoned` | no additional data | Close an unfinished game |
| `settings/changed` | validated changed fields | Persist local preferences |

Selection, highlighted peers, open dialogs, navigation, and whether the game log
is expanded are ephemeral UI state and are not events. Fixed givens, automatic
candidate calculation, conflicts, completion, statistics, number availability,
and history cards are projections and are not appended as redundant facts.

`hint/revealed` is a fact because it captures a user-visible intervention. The
command chooses the lowest-index eligible cell in MVP, records its exact value,
and the reducer validates that value against the committed solution.

### Command boundary

Components dispatch commands such as `enterValue(cell, value)` or
`toggleNote(cell, value)`. A command:

1. reads the latest projection;
2. rejects unavailable or illegal interaction without appending;
3. constructs one event with injected ID, time, and elapsed time;
4. validates the complete envelope and payload;
5. appends it through the repository;
6. replays the new stream and publishes the projection.

The reducer still validates every event. UI availability is convenience, never
the correctness boundary.

### Replay rules

Replay starts from an immutable empty state and processes each event once.

- Duplicate IDs, sequence gaps, sequence collisions, invalid payloads, edits to
  givens, invalid undo/redo targets, events after completion/abandonment, or
  backwards elapsed time are diagnostics.
- A structurally bad event quarantines its game stream. The app must not show a
  plausible board built from a silently partial history.
- An unknown schema/reducer version marks only the affected game incompatible;
  other games and settings remain usable.
- Undo/redo never deletes events. Only reversible cell value/note actions and
  hint actions can be targeted. A new move after undo makes the older redo
  branch unavailable, which is derived during replay.
- Entering a final value removes notes from that cell. Whether peer notes are
  automatically removed is a setting captured at game start; when enabled, the
  reducer derives those removals rather than emitting many note events.
- The reducer returns new data and deterministic diagnostics; it never writes
  storage or emits UI effects.

## 5. Projections

One replay produces:

```ts
interface AppProjection {
  settings: Settings;
  activeGameId: string | null;
  games: Record<string, GameProjection>;
  diagnostics: ReplayDiagnostic[];
}
```

Selectors derive:

- the 81-cell board including givens, values, notes, conflicts, mistakes, and
  accessibility labels;
- active number counts and candidate sets;
- undo/redo availability;
- timer status and display value (using an injected `now` only in the selector);
- the current game, puzzle browser status, and history cards;
- completion summary and counts of mistakes, hints, and moves;
- the human-readable game log.

The game log formatter owns wording independently of event storage. Example
entries are “Started Foundations puzzle,” “Added note 3 to r4c7,” “Placed 5 in
r5c5,” “Undid: Placed 5 in r5c5,” “Revealed 8 in r2c6,” and “Solved in 08:42.”
It uses stable cell notation for compactness and exposes a fuller accessible
label (“row 4, column 7”). Tests assert event type and exact formatted text.

## 6. Local persistence

The MVP uses one canonical key:

```text
sudoku.event-store.v1
```

Its serialized value is:

```ts
interface StoredEventDocumentV1 {
  storageVersion: 1;
  nextSequence: number;
  events: SudokuEvent[];
}
```

Keeping the counter and events in one JSON value makes each browser write
atomic at the key level. Logical events are append-only even though
`localStorage` replaces the serialized document on each append. No derived
board, history card, or timer string is persisted.

Read and write behaviour:

- validate the outer document and every event before publishing state;
- re-read immediately before append and use `nextSequence` from that document;
- write the new complete document once, then replay what was actually stored;
- listen for `storage` events and reload read-only views when another context
  changes data;
- on quota or unavailable-storage errors, continue the current session in
  memory and show “This browser cannot save progress”;
- on malformed JSON, preserve the raw value under a timestamped
  `sudoku.event-store.corrupt.*` key when possible, start a clean store only
  after informing the user, and offer copy/download of the raw text in a later
  recovery release;
- never automatically trim or compact canonical history in MVP;
- **Clear all local Sudoku data** removes the canonical and quarantined keys,
  unregisters no service worker, and clearly states that recovery is impossible.

Schema migration is a pure `Vn -> Vn+1` chain tested with frozen fixtures. The
original raw document is retained until the migrated document validates and is
written successfully. Event meaning is never changed in place; a reducer
version remains available for every supported historical stream.

`localStorage` is chosen because the requested local-only MVP and expected event
volume are small. IndexedDB becomes appropriate if puzzle packs, replay media,
or large archives exceed this simple atomic-document model.

## 7. Offline and privacy boundary

The production build bundles JavaScript, CSS, fonts, icons, the generator
worker, and help. Its service worker precaches a versioned app shell, not user
records.
The previous cache remains active until the replacement installs successfully.

Production policy:

- no analytics, telemetry, advertising, error reporting, remote logging, or
  third-party embeds;
- no `fetch`, XHR, WebSocket, EventSource, `sendBeacon`, or runtime dynamic
  imports from other origins;
- restrictive CSP, including `default-src 'self'` and `connect-src 'none'`;
- no remote fonts or images;
- base-path-safe manifest, routes, icons, and service-worker scope;
- update and migration failures leave the current version and local stream
  usable.

“Works offline” means that after one successful load installs the application
shell, the browser can close, go offline, reopen, resume, play, complete, and
review a puzzle. It does not mean a first-ever offline visit can load the app.

## 8. Accessibility contract

- The board is a labelled 9×9 grid. Each cell exposes row, column, current
  value, fixed/editable state, notes, selected state, and conflict/mistake state.
- Arrow keys move selection; Home/End move within a row; digits enter values;
  `N` toggles notes mode; Backspace/Delete erase; `Z`/Shift+`Z` undo/redo;
  Escape closes the topmost transient panel. Shortcuts never trap focus.
- Touch targets are at least 44×44 CSS px wherever the viewport permits; at
  narrow widths, the board cells are an explicitly documented exception while
  the number pad and actions retain 44 px targets.
- Visible focus, selected outline/icon, text, and ARIA state supplement colour.
- Live announcements are concise: value entered, conflict, undo/redo, pause,
  hint, and completion. Peer highlighting itself is not announced repeatedly.
- The app supports 200% zoom and 320 CSS px width with no horizontal, vertical,
  document, or nested scrolling. Compact layouts keep required puzzle controls
  visible, reduce secondary chrome, and paginate unbounded history.
- Motion is optional, reduced-motion is honoured, and completion never depends
  on animation or sound.

## 9. Verification strategy

Pure tests carry exhaustive logic; browser tests prove representative real-user
paths. See [E2E_GUIDE.md](E2E_GUIDE.md) for the browser contract.

Unit and property tests cover:

- all Sudoku peers, candidates, conflicts, completion, and immutable givens;
- generated grid validity, deterministic seeds, bounded failure, cancellation,
  clue removal, uniqueness, and worker message contracts;
- logical solve traces across singles, subsets, intersections, fish, wings,
  colours, chains, and uniqueness, including near-misses that must not apply;
- a fixed corpus at all five levels plus rejected puzzles outside their selected
  ceiling or requiring guessing;
- every event type, malformed payload, stream-order invariant, and diagnostic;
- replay determinism and replay from every prefix of a scenario;
- undo/redo branching, restart, pause/resume, hint, and post-terminal rejection;
- migrations and frozen old-store fixtures;
- the invariant that event replay and incremental append give equal state;
- the invariant that no accepted event mutates a given;
- the invariant that every projected filled cell is a digit 1–9;
- game-log text and accessible cell descriptions.

## 10. Vertical implementation slices

All MVP slices below are implemented on the MVP implementation branch with a
semantic browser journey, zero-diff screenshots, and a generated walkthrough in
the same commit as each vertical feature.

Every slice contains the user-facing behaviour, event/reducer change, unit
tests, E2E tracer, screenshots, generated walkthrough, and documentation update
needed to review it coherently.

1. **Static shell and verifier** — scaffold SvelteKit, static/base-path build,
   local fonts, manifest, service worker, unit/E2E harness, CI, and local-only
   landing state.
2. **Foundations generator, validator, and start** — implement the seeded solution
   generator, uniqueness counter, logical technique validator, worker boundary,
   bounded failure UI, `game/started`, and rendered givens as one tracer bullet.
3. **Values, notes, and game log** — implement commands/reducer, board input,
   conflicts, candidates, selection, and formatted event history.
4. **Undo, redo, and erase** — append compensating events and prove branching
   replay.
5. **Pause and interruption recovery** — deterministic active time, reload, and
   exact local reconstruction.
6. **Hints and completion** — exact hint fact, solved projection, summary, and
   history.
7. **Recovery and migrations** — storage failure, corruption quarantine,
   incompatible versions, and clear-all privacy deletion.
8. **Responsive accessibility** — keyboard path, ARIA grid, zoom, reduced
   motion, phone/tablet/desktop layouts, and automated accessibility checks.
9. **Installed offline release** — production service worker, restart offline,
   update safety, and base-path deployment.
10. **Five chapter levels** — add cumulative logical rating, deterministic
    generation for Foundations through Master, the level picker, and a
    click-by-click level-selection walkthrough.

## 11. Definition of done

- All implementation slices satisfy the unified commit contract.
- A fixed seed corpus reproduces byte-identical puzzles and every generated
  puzzle passes independent validity, uniqueness, and allowed-technique checks.
- Replay of the same events produces byte-equivalent domain projections.
- Reload, corruption, unsupported version, quota failure, and clear-all paths
  are visibly handled.
- The privacy suite observes no unexpected runtime request.
- The installed production build completes the offline scenario.
- Phone, tablet, desktop, keyboard, touch, 200% zoom, and reduced-motion evidence
  is reviewed.
- Functional E2E assertions and committed screenshots pass with zero pixel
  difference, no retries, no sleeps, and no hidden tolerance overrides.
