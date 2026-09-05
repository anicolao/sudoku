# Architecture

Document status: implemented system contract. This replaces the original MVP
planning document now that the planned release is complete. It describes the
code that exists, the data that must remain compatible, and the boundaries a
maintenance change should preserve.

## 1. System overview

Sudoku is a client-only SvelteKit application built with TypeScript and
`@sveltejs/adapter-static`. Production output is a static SPA that supports an
origin root or configured subpath. There is no application server.

```text
+page.svelte and UI components
        │
        ├── command methods ──→ IndexedDbEventStore ──→ IndexedDB streams
        │                              │
        │                              └── BroadcastChannel notification
        │
        ├── replay(events) ──→ AppProjection ──→ selectors and game log
        │
        ├── generation service ──→ generator worker
        │
        ├── sharing services ──→ validation workers and local QR encoder
        │
        └── photo service ──→ local grid extraction and OCR worker

service-worker.ts ──→ static application-shell cache only
```

Canonical game state is event-sourced. UI state such as selection, highlighted
peers, stripe sources, input mode, navigation, and open dialogs is ephemeral. Components render
projections and call repository commands; they do not write IndexedDB records
directly.

## 2. Module ownership

| Path | Responsibility |
| --- | --- |
| `src/routes/+page.svelte` | Application composition, navigation, UI commands, incoming links, sharing dialogs, and live announcements |
| `src/lib/components/SudokuBoard.svelte` | Accessible 9×9 board rendering and cell interaction |
| `src/lib/components/PhotoPuzzleImport.svelte` | Camera/file choice, recognition progress, editable givens review, and import consent |
| `src/lib/domain/types.ts` | Persisted event, puzzle, settings, and projection types |
| `src/lib/domain/reducer.ts` | Pure deterministic replay, undo/redo stacks, terminal status, conflicts, and diagnostics |
| `src/lib/domain/selectors.ts` | Time, remaining-digit, and other read-only calculations |
| `src/lib/domain/game-log.ts` | Human-readable projection of canonical events |
| `src/lib/domain/walkthrough.ts` | Rule analysis and placement replay for recorded and walkthrough-directed shared solves |
| `src/lib/domain/sudoku.ts` | Grid parsing, units, peers, solved-grid checks, and domain helpers |
| `src/lib/generator/` | Versioned PRNG, rated puzzle transforms, exhaustive solver, logical solver, worker, and service boundary |
| `src/lib/storage/indexeddb-event-store.ts` | Canonical browser repository, per-stream revisions, migration, memory-only fallback, and deletion |
| `src/lib/storage/event-store.ts` | Flat V0/V1 document parser, legacy migration support, and framework-neutral test store |
| `src/lib/sharing/` | Puzzle/work-link parsing, fingerprints, worker validation, and URL construction |
| `src/lib/photo/` | Adaptive thresholding, connected-grid detection, perspective correction, cell extraction, and bundled OCR orchestration |
| `src/service-worker.ts` | Versioned static shell installation, activation, update, and cache-first reads |
| `tests/unit/` | Pure domain, generator, storage, migration, sharing, and compatibility evidence |
| `tests/e2e/` | Production-shaped user journeys, screenshots, privacy, accessibility, and offline evidence |

## 3. Puzzle definitions and generation

A committed puzzle contains enough information to replay forever without
calling a future generator:

```ts
interface PuzzleDefinition {
  id: string;
  givens: string;             // 81 characters: 1-9 or .
  solution: string;           // 81 characters: 1-9
  difficulty: PuzzleDifficulty | 'custom';
  seed?: string;
  generatorVersion?: 1 | 2;
  validatorVersion: 1 | 2 | 3;
  hardestTechnique: SolveTechnique | null;
  provenance?: PuzzleProvenance;
}
```

Generated puzzles use generator version 2. The worker selects the reviewed base
for the requested level, applies deterministic seed-driven Sudoku symmetries,
proves one solution with the exhaustive solver, and verifies that the logical
solver reaches the stored solution in the requested band. The five cumulative
bands are:

| Level | Current technique family |
| --- | --- |
| Foundations | naked and hidden singles |
| Intermediate | pairs, pointing pairs, and box-line reduction |
| Advanced | triples, X-Wing, Swordfish, and Y-Wing |
| Expert | single-digit chains, Simple Colors, XY-Chain, Medusa, and Unique Rectangle |
| Master | repeated Expert-level, multi-technique synthesis |

Clue ranges constrain generation but do not assign difficulty. A transform is
accepted only when its actual logical trace has the requested classification.
Generation is bounded and returns an error rather than an unvalidated puzzle.

The exhaustive solver may backtrack to count solutions. The logical solver may
not guess. Keeping those responsibilities separate prevents uniqueness proof
from being mistaken for a human difficulty rating.

## 4. Canonical events

Every persisted event has this envelope:

```ts
interface EventEnvelope {
  id: string;
  sequence: number;
  gameId: string | null;
  occurredAt: string;
  elapsedMs: number;
  schemaVersion: 1;
  reducerVersion: 1;
}
```

`sequence` is allocated globally in the same transaction as the append. A
`null` game ID is reserved for application settings. IDs support references and
duplicate detection; replay order comes from contiguous sequence numbers.

Current vocabulary:

| Event | Payload | Meaning |
| --- | --- | --- |
| `settings/changed` | changed settings | Update device-local defaults or appearance preferences |
| `game/started` | game ID, puzzle, settings snapshot | Start a locally generated attempt |
| `game/imported` | import kind, puzzle, settings, optional work/metadata, and an optional initial walkthrough view; legacy origins may contain an old checkpoint | Start from checked shared givens, transferred progress, or a reviewed camera grid |
| `cell/value-entered` | cell, value | Place or replace a user value |
| `cell/value-erased` | cell, value, target event ID | Replay without one exact placement and its derived effects |
| `cell/cleared` | cell | Clear the selected editable cell when no local placement source can be targeted |
| `cell/note-toggled` | cell, value, enabled | Add or remove one explicit note |
| `cell/notes-filled` | cell, values | Fill currently eligible notes as one reversible action |
| `hint/revealed` | cell, value | Record the exact revealed value |
| `move/undone` | target event ID | Deactivate the latest reversible action |
| `move/redone` | target event ID | Reactivate the latest undone action |
| `game/paused` | empty | Freeze active elapsed time |
| `game/resumed` | empty | Resume active elapsed time |
| `game/restarted` | empty | Reversibly clear mutable progress within the attempt |
| `game/abandoned` | empty | Close an unfinished attempt |

Selection, focus, highlighted peers, even/odd stripe sources, selected input
mode, navigation, dialogs, QR state, and tab-local puzzle choice are not events. Conflicts, mistake cells,
completion, remaining-number counts, History cards, and game-log rows are
derived rather than stored as duplicate facts.

## 5. Replay and reversible actions

`replay()` starts from an empty projection and produces the complete
`AppProjection`. It does not access time, storage, randomness, DOM APIs, or
workers.

Replay performs two related passes:

1. validate ordering, construct games and settings, and derive active/redo
   stacks plus inactive event IDs;
2. rebuild each game from its origin while applying active events, pause/resume
   time, restart and abandonment, targeted value erasure, completion, conflicts,
   mistake cells, and current undo/redo targets.

Undo and redo append compensating events; nothing is deleted. A new reversible
action clears the redo branch. `cell/value-erased` is distinct from a generic
clear because replay must omit the targeted placement and restore all effects
that placement had caused, including notes cleared from its own cell and notes
automatically removed from peers.

Completion is derived when the projected board equals the committed solution.
There is no `game/completed` event. A completed transfer is detected from its
imported checkpoint in the same way.

Invalid ordering, settings, import fields, edit targets, hint values, pause
transitions, undo/redo targets, and erase targets add deterministic diagnostics.
The UI never treats diagnostics as permission to invent or repair events.

## 6. Settings and snapshots

Device settings begin with defaults in the reducer. A `settings/changed` event
updates them. Starting or importing a game captures a settings snapshot so
future default changes do not reinterpret old play.

Core behavioural settings are mistake checking, automatic peer-note removal,
timer visibility, number-first input, and starting in Notes mode. Note weight,
note size, and matching-note highlighting are local appearance preferences;
older events that predate them receive reducer defaults.

## 7. Persistence and tabs

The canonical database is `sudoku.event-streams.v2` with:

- `streams`: one `game:<gameId>` record per attempt and one `settings` record;
- `metadata`: the next global event sequence.

Each stream stores a revision and its events. Before a command appends, the
repository reloads current data and captures expected revisions. The IndexedDB
transaction compares the target revision, appends and increments the global
sequence only on a match, then reloads the projection. A mismatch discards the
overlapping command and shows the latest committed state.

`BroadcastChannel` carries only an “events changed” notification. Receiving
tabs reload trusted data from IndexedDB. Hidden tabs defer reads until focus to
avoid a suspended Mobile Safari transaction blocking the database. Each tab
stores its selected game ID in `sessionStorage`, so tabs may work on different
attempts without changing one another's visible puzzle.

If IndexedDB cannot open or later becomes unavailable, the repository continues
in memory and surfaces a persistent warning. Memory-only progress is lost when
the page closes.

### Legacy migration

The former `sudoku.event-store.v1` localStorage document remains a supported
input. Storage version 0 is upgraded to version 1 by adding `nextSequence`.
When IndexedDB is empty, a valid legacy document is written transactionally to
per-game streams and removed only after success.

Unreadable legacy text is copied, when possible, to a timestamped
`sudoku.event-store.corrupt.*` key before the active key is removed. The app
then starts a clean canonical store with a warning. **Clear all local Sudoku
data** clears IndexedDB and every `sudoku.*` localStorage key.

## 8. Sharing and imports

Puzzle links never trust a supplied solution. Worker validation checks the
givens and optional work structure, bounds, uniqueness, derived solution, and
logical rating.

A successful import appends one `game/imported` origin event. Shared work
contains no source event IDs or undo stack, so undo on the recipient begins with
moves made after import.

History sharing exports either clean givens or the selected attempt's current
values and notes. It does not export time, statistics, settings, that attempt's
event log, or any other attempt. The precise readable contract is in
[PUZZLE_SHARING.md](PUZZLE_SHARING.md).

Photo import accepts a browser camera capture or image file up to 20 MB. The
client downsizes it, creates an adaptive black/white mask, finds the largest
connected square lattice, maps its four corners to a normalized square, and
extracts likely printed-digit components from the 81 cells. A bundled
Tesseract LSTM worker reads those isolated components with a 1–9 whitelist.
The OCR worker, WebAssembly core, and compact English model are versioned
same-origin build assets and remain available to an installed app.

Recognition is advisory. The editable review grid flags missing or
low-confidence detected cells and never writes the source image. The corrected
81-character givens pass through the same worker uniqueness proof, solution
derivation, and logical rating as a clean shared puzzle. Consent then appends
one `game/imported` origin with `importKind: 'camera-photo'`, recognizer version
1, and the SHA-256 givens fingerprint. Only that self-contained puzzle and the
settings snapshot are persisted; pixels and confidence scores remain
ephemeral.

## 9. Offline shell and updates

The service worker creates a cache name from its deployment scope and build
revision. Installation caches versioned build assets and a revision-busted copy
of the application shell under the canonical navigation key. Activation removes
older caches for that scope and claims clients.

Same-origin `GET` navigation and asset requests are cache-first. `version.json`
is deliberately network-only and absent from Cache Storage. The running client
checks it after the cached shell is ready; a changed revision installs the new
worker and reloads once after takeover. An offline or failed update leaves the
current cached application usable.

IndexedDB events and the E2E localStorage mirror are never service-worker cache
entries. A first-ever offline visit cannot install the app; an already installed
app can reopen, resume, complete, review History, and reload offline.

## 10. Privacy boundary

Ordinary runtime traffic is restricted to same-origin `GET` requests for the
document, bundled files (including the lazily used OCR worker, core, and digit
model), and revision manifest. The application contains no
analytics, telemetry, remote fonts, hosted QR API, WebSocket, EventSource,
beacon, or user-data endpoint.

Puzzle givens, optional work, and included progress metadata in `?p=` are
visible to the static host and may appear in browser history. Links contain no
solution. The CSP and
`Referrer-Policy: no-referrer` reinforce this boundary, and scenario 010
instruments browser network APIs to test it.

## 11. Compatibility rules

Maintenance changes must follow these rules:

1. Never change the meaning of an existing event, generator version, validator
   version, or settings bit in place.
2. Add a versioned reader or migration before emitting a new persisted format.
3. Keep old puzzle definitions self-contained; historical replay must not call
   the current generator.
4. Keep reducers deterministic and browser-free.
5. Treat incoming links, stored imports, and legacy text as untrusted data.
6. Do not add a second mutable canonical board alongside the event stream.
7. Do not put user events or generated sharing links in Cache Storage or logs.
8. Update unit tests, browser evidence, and the relevant contract document in
   the same change.

## 12. Verification boundary

Pure tests cover solver correctness, deterministic generation, replay,
selectors, storage migration, IndexedDB revisions, shell updates, and link
parsing. Browser scenarios cover observable journeys through the
production-shaped app at the supported form factors, including privacy,
accessibility, multiple tabs, sharing, and installed offline use.

See [E2E_GUIDE.md](E2E_GUIDE.md) for the current project matrix and
[CONTRIBUTING.md](CONTRIBUTING.md) for the maintenance change checklist.
