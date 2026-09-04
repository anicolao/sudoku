# Sudoku

Sudoku is a calm, installable puzzle application for classic 9×9 play. It runs
entirely in the browser, generates and validates puzzles on the device, records
play as an immutable event stream, and works offline after its first successful
load.

**Project status:** the planned product is implemented and the repository is in
maintenance mode. Small features and bug fixes are welcome, but changes should
preserve the local-first data model, replay compatibility, accessibility
contract, and deterministic test evidence.

[Open the application](https://anicolao.github.io/sudoku/) ·
[Product vision](VISION.md) · [Architecture](ARCHITECTURE.md) ·
[Contributing](CONTRIBUTING.md)

## What is included

- Five locally generated levels: Foundations, Intermediate, Advanced, Expert,
  and Master. Every accepted puzzle has one independently proven solution and a
  logical solve path within its selected technique band.
- Touch, mouse, and keyboard play with number-first or cell-first input,
  pencil notes, fill-all notes, erase, undo, redo, restart, pause, and hints.
- Accessible board semantics, roving keyboard focus, visible focus and
  non-colour state cues, reduced-motion support, and responsive layouts from a
  320 px phone through tablet and desktop.
- Event-sourced persistence in IndexedDB. Boards, timers, history cards, undo
  state, and the game log are reconstructed from canonical events.
- Multiple local attempts and tab-local puzzle selection. Tabs following the
  same attempt refresh from committed IndexedDB events and use stream revisions
  to reject exceptional overlapping writes safely.
- Local History for active, solved, and abandoned attempts, including read-only
  review, repeat play, and sharing.
- Readable links for clean puzzles or puzzles with current values and notes.
  Incoming data is validated in a worker before the user consents to one local
  import event.
- An application shell service worker that supports installed offline play
  without putting puzzle records in Cache Storage.
- Explicit memory-only and corrupt-store recovery states, plus one physical
  privacy deletion: **Clear all local Sudoku data**.

There is no account, backend, advertising, analytics, telemetry, cloud sync,
remote puzzle feed, or runtime AI service.

## Run locally

The CI and screenshot baseline use Node.js 24 and Playwright Chromium on macOS.

```sh
npm ci
npm run dev
```

The development server listens at `http://127.0.0.1:5177`.

To install the browser used by the end-to-end suite:

```sh
npx playwright install chromium
```

## Verification

```sh
npm run check                  # Svelte and TypeScript diagnostics
npm run check:docs             # local Markdown links and screenshot targets
npm run test:unit              # domain, storage, generator, and codec tests
npm run test:e2e               # complete Chromium journey suite
npm run test:e2e:privacy       # local-only network boundary
npm run test:e2e:offline       # installed service-worker journey
npm run build                  # production static build
npm run verify:change          # full local change gate
```

Visual changes require the explicit update command:

```sh
npm run test:e2e:update-snapshots
```

That command regenerates zero-tolerance screenshots and scenario walkthroughs.
Review every changed image and its semantic assertions before committing it.
Ordinary test runs do not modify documentation or baselines.

## How the application works

```text
user action
    ↓
command and validation in +page.svelte / the event repository
    ↓
one append-only event in an IndexedDB game stream
    ↓
pure replay reducer
    ↓
board, timer, undo/redo, history, and readable game-log projections
```

Puzzle generation, exhaustive solution counting, logical rating, and
shared-puzzle validation run outside the main UI thread.
The production build is a client-only SvelteKit SPA emitted by
`@sveltejs/adapter-static`, so it can be hosted at the origin root or a subpath.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the implemented modules, event
vocabulary, persistence rules, worker boundaries, and compatibility promises.

## Sharing and privacy

A puzzle URL uses `?p=` followed by 81 literal givens and can optionally append
readable placement and candidate actions. It does not contain the solution,
elapsed time, hints, mistakes, settings, source event log, device identity, or
other History entries.

The link is bearer data: anyone with it can open a copy. Puzzle work is part of
the query and may be visible to the static host and browser history. All
parsing, uniqueness checking,
solution derivation, rating, QR generation, and import validation occur locally.
See [PUZZLE_SHARING.md](PUZZLE_SHARING.md) for the exact contract.

Local History is not a backup. Clearing browser data, private-browsing teardown,
storage eviction, or loss of the device removes it. The application makes no
ordinary runtime request except same-origin `GET` requests for its static shell
and revision manifest. User records are never added to the service-worker cache.

## Documentation map

| Document | Role |
| --- | --- |
| [VISION.md](VISION.md) | Stable product principles, audience, scope, and maintenance direction |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Current implementation, domain model, storage, workers, offline shell, and compatibility boundaries |
| [UX_DESIGN.md](UX_DESIGN.md) | Current interaction, responsive, visual, content, and accessibility contract |
| [PUZZLE_SHARING.md](PUZZLE_SHARING.md) | Readable puzzle/work format, validation, privacy, and failure handling |
| [E2E_GUIDE.md](E2E_GUIDE.md) | Playwright projects, deterministic evidence, scenario ownership, and review workflow |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Maintenance workflow and change checklist |
| [`tests/e2e/*/README.md`](tests/e2e/) | Generated, scenario-owned walkthroughs with reviewed screenshots |

Root documents describe current contracts. Scenario walkthroughs are generated
evidence and should not be edited by hand.

## Deployment

Pull requests run checks, unit tests, all browser scenarios, and the production
build on the pinned `macos-15` runner. A successful same-repository PR receives
a retained preview at:

```text
https://anicolao.github.io/sudoku/pr<PR number>/
```

Pushes to `main` publish the production application at
`https://anicolao.github.io/sudoku/`. Both deployments are checked for
base-path-safe assets, manifest entries, and service-worker scope.

## License

Copyright (C) 2026 Alex Nicolaou. Licensed under the GNU General Public License,
version 3 only. See [LICENSE](LICENSE).
