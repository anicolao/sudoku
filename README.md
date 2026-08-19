# Sudoku

Sudoku is a calm, local-only puzzle app for phone, tablet, and desktop. It is
an installable Svelte SPA with an immutable event log: every entered
number, note, undo, hint, pause, and completed puzzle is recorded as an event,
and the visible game is rebuilt by replaying those events.

No account, server, analytics, advertising, or cloud sync is required. Puzzle
data and play history remain in this browser's IndexedDB. A service worker
caches only the static application shell so a previously loaded app can be used
offline. The cached UI renders immediately, then checks a small uncached
same-origin revision manifest; when a deployment changes, the replacement
worker caches revision-busted HTML and takes over without requiring a visible
URL parameter.

The MVP is implemented. The application can generate deterministic puzzles at
five cumulative chapter levels—Foundations, Intermediate, Advanced, Expert,
and Master—in a Web Worker, independently prove a unique solution, rate each
puzzle from its logical solve path, reject puzzles outside the selected level, commit
the complete puzzle definition as a `game/started` event, reconstruct it by
replay, and render its givens as an accessible 9×9 grid. Players can now select
cells, switch explicitly between Number and Notes modes, toggle pencil marks,
enter and replace values, see peer and duplicate-conflict highlighting, expand
a filled cell's second tap to every matching digit's peer set, inspect
remaining number counts, and read a game log derived from the canonical stream.
Erase, undo, and redo append compensating events instead of rewriting history;
erasing a placed value replays without that placement so its cleared cell notes
and automatically removed peer notes return exactly. A new move after undo
creates a visible branch and correctly retires redo. Pause
freezes active elapsed time, covers the puzzle and log, and survives full-page
reload; resume continues from the stored event snapshot without counting the
interruption. Hints are cancellable, deterministic facts; completion
is derived from the solved board; completed and abandoned attempts appear in
local History; Restart retains the event log; and Start over creates a distinct
game ID over the same committed puzzle. App-level preference events are replayed
and snapshotted into new games; optional mistake checking and timer visibility
work from that snapshot. Malformed history is quarantined, V0 stores migrate
atomically, failed persistence continues visibly in memory, Clear all physically
removes every local Sudoku record. Each puzzle has an independent event stream,
so different tabs can keep different puzzles open and tabs viewing the same
puzzle follow committed events through `BroadcastChannel`. A stream revision
check discards the exceptional overlapping command and refreshes that tab. The
board now uses semantic row/gridcell structure and roving focus; number-first input and Arrow, Home, End,
digit, Notes, Delete, undo, redo, and Escape keyboard commands are covered by
the same flip-book test at phone, 320 px, landscape, 200%-equivalent reflow,
tablet, and desktop sizes. The playable view passes the automated WCAG A/AA
axe scan. A strict content-security policy and browser instrumentation enforce
the same-origin GET-only runtime boundary. The production service worker is
proven to resume, finish, review, and reload a real puzzle offline while its
cache contains no event-store data.

Puzzle sharing is local-first too. A `?p=` link contains only 81 literal
givens; the receiving browser independently validates uniqueness, derives the
solution, and asks for consent before storing one import event. The Share action
can instead freeze a paused checkpoint into a versioned `#t=` fragment and
render a QR code entirely in-browser. Values, notes, time, counts, and settings
move to a fresh device without a server or embedded solution. The receiver
revalidates every field, duplicate scans are idempotent, and the source remains
paused as an explicit independent copy.

## Design documents

- [VISION.md](VISION.md) defines the product promise and deliberate non-goals.
- [MVP_DESIGN.md](MVP_DESIGN.md) defines the release boundary, event schema,
  reducer, local persistence, and implementation slices.
- [UX_DESIGN.md](UX_DESIGN.md) defines interaction states, responsive layouts,
  accessibility requirements, and generated form-factor mockups.
- [E2E_GUIDE.md](E2E_GUIDE.md) defines the executable browser-test and visual
  evidence contract.
- [PUZZLE_SHARING.md](PUZZLE_SHARING.md) defines puzzle URLs, the compact
  checkpoint codec, local QR rendering, validation, and copy semantics.

## Foundation

- Svelte 5 and SvelteKit with TypeScript and `@sveltejs/adapter-static`.
- A client-only SPA whose production output can be hosted on any static origin
  or subpath.
- Pure commands, event validation, reducers, selectors, and Sudoku rules; Svelte
  components render projections and never mutate canonical state directly.
- Versioned append-only per-game event streams in browser IndexedDB, with
  transactional revisions and one-time migration from the former flat store.
- A seeded on-device generator whose validator accepts only uniquely solvable,
  no-guess puzzles in the requested chapter band. Its cumulative ladder moves
  from singles, through pairs/intersections, triples/fish/Y-Wings, then
  colours/chains/uniqueness, and finally multi-technique Master synthesis.
- Versioned puzzle-link and progress-transfer codecs, validation workers, and
  locally rendered QR codes via the bundled MIT-licensed `qrcode` package.
- Vitest for domain, replay, migration, and property tests.
- Playwright Chromium on macOS for real-browser journeys, accessibility checks,
  offline use, privacy enforcement, generated walkthroughs, and zero-diff
  screenshots; other browser/platform combinations are outside the MVP matrix.

The app intentionally does not need Redux. The useful idea from `../food` is
event sourcing, not a second mutable projection store: all read models are
rebuilt from the event stream so they cannot drift from the source of truth.

## Reference projects and adopted lessons

This design was extracted from three neighbouring applications:

- `../games/jaipur`: typed and versioned event envelopes, deterministic replay,
  illegal-event diagnostics, a human-readable game-log projection, domain unit
  tests, and vertical-slice Playwright scenarios.
- `../food`: scenario-owned E2E directories, one step API tying semantic checks
  to screenshots and generated walkthroughs, deterministic rendering, and
  event/projection tests.
- `../dosage`: a static local-only SPA, explicit storage-failure behaviour,
  same-origin privacy tests, an installable offline shell, and phone-first
  responsive evidence.

The new design also tightens a few seams visible in those references:

- projections are always derived by replay instead of maintained separately;
- screenshot tolerance is configured once at zero pixels and never overridden
  by helpers;
- generated E2E documentation is written only by an explicit update command;
- every documented state fits its viewport without clipped elements, document
  scrolling, or nested scrolling regions;
- all randomness, clocks, IDs, locale, and puzzle fixtures are injectable;
- corrupt or incompatible streams are quarantined instead of partially applied;
- local-only means runtime network access is prohibited and tested.

## Development commands

```sh
npm install
npm run dev
npm run check
npm run test:unit
npm run test:e2e
npm run test:e2e:privacy
npm run test:e2e:offline
npm run build
```

`npm run verify:change` runs checks, unit tests, the full browser suite, the
production build, and whitespace checks.
Screenshot changes should require the explicit
`npm run test:e2e:update-snapshots` command and human review.

Pull requests run Playwright Chromium on a pinned GitHub-hosted macOS runner.
After verification, the same workflow publishes a retained preview to:

```text
https://anicolao.github.io/sudoku/pr<PR number>/
```

Pushes to `main` publish the production path at
`https://anicolao.github.io/sudoku/`.

## Privacy and data ownership

The MVP makes no runtime request except same-origin `GET` requests for bundled
application assets and the static revision manifest. Local history is not a
backup: clearing site data, browser eviction, private-browsing teardown, or loss
of the device removes it. User data is not included in the service-worker cache.

The settings screen provides **Clear all local Sudoku data**, with a precise
confirmation. This is the one intentional exception to logical append-only
history: a privacy deletion physically removes the event store.

## License

Copyright (C) 2026 Alex Nicolaou. Licensed under the GNU General Public License,
version 3 only. See [LICENSE](LICENSE).
