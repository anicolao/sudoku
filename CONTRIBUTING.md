# Contributing and maintenance

Sudoku is substantially feature-complete. Contributions are expected to be
small, reviewable maintenance changes unless a larger proposal explicitly
revisits the product and compatibility boundaries.

## 1. Before changing code

Read the document closest to the change:

- [VISION.md](VISION.md) for product boundaries;
- [ARCHITECTURE.md](ARCHITECTURE.md) for module ownership, persistence, and
  compatibility;
- [UX_DESIGN.md](UX_DESIGN.md) for observable interaction and accessibility;
- [PUZZLE_SHARING.md](PUZZLE_SHARING.md) for any URL, import, QR, or transfer
  work;
- [E2E_GUIDE.md](E2E_GUIDE.md) for browser evidence and screenshot ownership.

Prefer extending an existing pattern over adding another state model, storage
layer, test helper, or planning document.

## 2. Local setup

CI uses Node.js 24, npm, and Playwright Chromium on macOS.

```sh
npm ci
npx playwright install chromium
npm run dev
```

The app runs at `http://127.0.0.1:5177`. Production-shaped browser tests build
and preview on the fixed port `4177` automatically.

## 3. Appropriate maintenance work

Good maintenance changes include:

- dependency and toolchain updates;
- browser compatibility and service-worker fixes;
- accessibility, keyboard, copy, focus, contrast, or responsive corrections;
- replay, migration, storage, sharing, or multi-tab bug fixes;
- small interaction improvements that remain local-first;
- test reliability improvements that make inputs more deterministic without
  weakening assertions;
- documentation corrections and consolidation.

A larger feature should first explain:

- why it belongs in a calm classic Sudoku application;
- whether it introduces a server, account, recurring operating cost, or new
  private data;
- how old event streams continue to work;
- how it behaves offline and in memory-only mode;
- what accessible and responsive evidence will be added;
- which current contract documents it changes.

## 4. Architecture rules

- Canonical game state remains append-only and event-sourced.
- Reducers and Sudoku rules remain deterministic and browser-free.
- Components dispatch commands and render projections; they do not construct or
  mutate persisted records directly.
- Existing event and link meanings are immutable. Add a versioned reader or
  migration before writing a new format.
- Historical puzzles remain self-contained; replay must not depend on the
  current generator or network.
- Incoming links, legacy storage, and historical imported checkpoints are untrusted until
  bounded validation succeeds.
- User records and solutions do not enter network logs, analytics, or Cache
  Storage. Readable shared work is explicitly visible in its URL query.
- Local storage failure degrades visibly to playable memory-only state.

## 5. Tests by change type

| Change | Minimum evidence |
| --- | --- |
| Pure Sudoku or solver logic | focused unit cases, including near-misses and deterministic output |
| Event or reducer logic | replay tests, malformed-target tests, and lifecycle coverage |
| Storage or migration | legacy fixture, successful migration, failure/recovery, and replay equivalence |
| Sharing codec or validation | bounds, tampering, version/golden vector, import replay, and focused browser flow |
| Visible interaction | semantic Playwright assertions at the closest scenario and affected viewports |
| Visual styling | reviewed zero-diff baseline updates plus generated walkthrough updates |
| Service worker or deployment | shell-update/base-path tests and installed offline journey |
| Documentation only | `npm run check:docs`, command accuracy, formatting checks, and a production build when referenced behaviour changed |

During iteration, run the narrowest useful command. Before handoff, run:

```sh
npm run verify:change
```

That command is the local merge gate. Pre-commit runs Svelte/TypeScript checks
and unit tests; pre-push runs the full verifier.

## 6. Browser scenarios and screenshots

Every numbered E2E directory owns one user journey. Add steps to the nearest
journey when the new behaviour naturally continues it. Add a new number only
for a separate story that cannot be reviewed coherently in an existing spec.

Do not edit scenario README files or PNG baselines by hand. For an intentional
visual or documented-step change:

```sh
npm run test:e2e:update-snapshots
```

Review every changed screenshot at phone, tablet, desktop, and any specialized
project that runs the scenario. Never solve instability with masks, tolerance,
retries, sleeps, or broad waits.

## 7. Documentation ownership

Root Markdown files are current contracts:

- update the existing owner document instead of adding a second description of
  the same behaviour;
- describe implemented behaviour in present tense;
- label genuine proposals explicitly and keep them out of current contracts;
- avoid release-planning language such as “slice,” “proposed,” or “MVP exit
  criteria” for completed work;
- keep code snippets aligned with exported types and configured commands;
- link to source-owned detail rather than copying long lists across documents.

Generated `tests/e2e/*/README.md` files are evidence, not general guides. Their
source is scenario metadata in the corresponding `.spec.ts` file.

## 8. Commit and pull-request guidance

Keep commits focused enough that a reviewer can connect requirement, code,
tests, screenshots, and documentation. Preserve unrelated worktree changes.

A pull request should state:

- the user-visible or maintenance outcome;
- any persistence, privacy, offline, or compatibility impact;
- the focused tests used while iterating;
- the result of `npm run verify:change`;
- why screenshot changes are expected, when present.

CI reruns checks, unit tests, all Playwright projects, and the production build
on `macos-15`. Successful same-repository pull requests receive a GitHub Pages
preview at `https://anicolao.github.io/sudoku/pr<PR number>/`.

## 9. Release and compatibility checklist

Before merging a change that affects stored or shared data, confirm:

- [ ] old event documents still replay;
- [ ] V0/V1 legacy migration still succeeds or has an explicit successor;
- [ ] unknown or malformed versions reject safely;
- [ ] old generated puzzles retain their stored solution and provenance;
- [ ] existing clean and work puzzle links still validate;
- [ ] memory-only and clear-all behaviour remain accurate;
- [ ] the service-worker cache contains no user records;
- [ ] privacy instrumentation observes no new request class;
- [ ] current architecture, UX, sharing, and test documentation is updated.

## 10. Security and privacy reports

Do not include a real puzzle-work URL, local event export, or private browser
data in a public issue. A shared link is bearer data. Reduce a report to
synthetic givens and events, and remove device-specific details before sharing
it.

The repository has no backend to revoke a leaked link. Treat copied links
accordingly.
