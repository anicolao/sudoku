# Sudoku

Sudoku is a calm, local-only puzzle app for phone, tablet, and desktop. It is
planned as an installable Svelte SPA with an immutable event log: every entered
number, note, undo, hint, pause, and completed puzzle is recorded as an event,
and the visible game is rebuilt by replaying those events.

No account, server, analytics, advertising, or cloud sync is required. Puzzle
data and play history remain in this browser's `localStorage`. A service worker
caches only the static application shell so a previously loaded app can be used
offline.

The scaffold and first MVP vertical slice are implemented. The application can
generate deterministic Easy puzzles in a Web Worker, independently prove a
unique solution, reject puzzles beyond the allowed logical techniques, commit
the complete puzzle definition as a `game/started` event, reconstruct it by
replay, and render its givens as an accessible 9×9 grid. Values, notes, and the
remaining play controls arrive in the following reviewable slices.

## Design documents

- [VISION.md](VISION.md) defines the product promise and deliberate non-goals.
- [MVP_DESIGN.md](MVP_DESIGN.md) defines the release boundary, event schema,
  reducer, local persistence, and implementation slices.
- [UX_DESIGN.md](UX_DESIGN.md) defines interaction states, responsive layouts,
  accessibility requirements, and generated form-factor mockups.
- [E2E_GUIDE.md](E2E_GUIDE.md) defines the executable browser-test and visual
  evidence contract.

## Foundation

- Svelte 5 and SvelteKit with TypeScript and `@sveltejs/adapter-static`.
- A client-only SPA whose production output can be hosted on any static origin
  or subpath.
- Pure commands, event validation, reducers, selectors, and Sudoku rules; Svelte
  components render projections and never mutate canonical state directly.
- One versioned append-only event-store document in browser `localStorage`.
- A seeded on-device generator whose validator accepts uniquely solvable Easy
  puzzles requiring no technique beyond naked singles, hidden singles, naked
  pairs, and pointing pairs.
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
application assets. Local history is not a backup: clearing site data, browser
eviction, private-browsing teardown, or loss of the device removes it. User data
is not included in the service-worker cache.

The settings screen will provide **Clear all local Sudoku data**, with a precise
confirmation. This is the one intentional exception to logical append-only
history: a privacy deletion physically removes the event store.

## License

Copyright (C) 2026 Alex Nicolaou. Licensed under the GNU General Public License,
version 3 only. See [LICENSE](LICENSE).
