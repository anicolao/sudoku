# End-to-end testing guide

Document status: current Playwright contract. Browser scenarios prove
user-visible integration through the production-shaped application; unit tests
remain responsible for exhaustive Sudoku rules, replay invariants, storage
parsers, and codec edge cases.

## 1. Evidence model

Each scenario is a tracer bullet through the real interface, event repository,
replay reducer, selectors, and rendering. It should begin with a user action and
end with both semantic and visual evidence.

A documented checkpoint follows this order:

1. perform the real action;
2. assert accessible and domain meaning;
3. verify application readiness, persistence state, layout containment, target
   sizes, and touch-action policy;
4. capture a zero-tolerance screenshot;
5. retain the human-readable assertions for the generated walkthrough.

Screenshots do not replace assertions. An image cannot prove event count,
accessible name, elapsed time, clipboard value, network privacy, or replay
equivalence.

## 2. Repository layout

```text
tests/e2e/
  helpers/
    event-store.ts
    test-step-helper.ts
  001-app-shell-local-only/
    001-app-shell-local-only.spec.ts
    README.md
    screenshots/
  ...
  019-completed-digit-key/
    019-completed-digit-key.spec.ts
    README.md
    screenshots/
```

Each numbered directory owns one product journey, its generated README, and all
viewport screenshots. Extend an existing journey when behaviour is a natural
continuation; use the next number for a distinct story.

Unit tests live in `tests/unit/`. Small source-adjacent tests, such as shell
update and application metadata tests, live next to their modules under `src/`.

## 3. Browser projects

`playwright.config.ts` is the source of truth:

| Project | Viewport | Tests |
| --- | ---: | --- |
| `phone` | 393×852 | Every ordinary scenario except installed offline |
| `tablet` | 820×1180 | Every ordinary scenario except installed offline |
| `desktop` | 1280×1000 | Every ordinary scenario except installed offline |
| `offline` | 393×852 | Scenario 012 only, with service workers allowed |
| `phone-narrow` | 320×640 | Scenario 011 only |
| `phone-landscape` | 852×393 | Scenario 011 only |
| `zoom-200` | 320×450 | Scenarios 011 and 018 |

All projects use Playwright Chromium, device scale factor 1, `en-CA`, the
America/Toronto timezone, reduced motion, no retries, and retained traces on
failure. Ordinary projects block service workers so cache behaviour cannot
interfere with application assertions. Scenario 012 owns the only
service-worker-enabled project.

The reviewed visual baseline is Chromium on macOS. CI uses Node.js 24 and the
pinned `macos-15` runner. Baseline filenames include the project and `macos`.
Other browsers and operating systems may work, but they do not have committed
compatibility or screenshot evidence.

Chromium launches with deterministic font and rendering flags:

```text
--font-render-hinting=none
--disable-font-subpixel-positioning
--disable-lcd-text
--force-device-scale-factor=1
--disable-gpu
--use-gl=swiftshader
```

## 4. Determinism

The E2E build sets `VITE_E2E_MODE=1`. In that mode:

- generated puzzle seed is `walkthrough-seed`;
- event IDs are `event-<sequence>`;
- the application clock starts at `2026-08-16T12:00:00.000Z`;
- tests advance active time through the `sudoku:e2e-clock` event;
- the IndexedDB repository mirrors its event document to
  `sudoku.event-store.v1` for assertions;
- a bounded `__sudokuReplaceEventDocument` hook can install canonical fixtures.

The application never reads the E2E mirror. Fixtures still pass through the
production replay reducer and IndexedDB stream conversion. They are used only
to establish expensive states that prior UI steps have already proven, such as
a board with two cells remaining.

The Playwright config fixes locale, timezone, viewport, scale, motion, server
port, and software rendering. Tests await roles, attributes, event documents,
worker results, service-worker readiness, or other observable evidence. Do not
add sleeps or `waitForTimeout`.

## 5. Unified step helper

`TestStepHelper.step()` receives a stable ID, a human description, and one or
more named verifications:

```ts
await steps.step('note-entered', {
  description: 'The player adds a pencil note',
  verifications: [
    {
      spec: 'The selected cell exposes note 3',
      check: async () => {
        await expect(cell).toHaveAccessibleName(/notes 3/);
      }
    }
  ]
});
```

Before capturing, the helper:

- waits for pending event-store writes to finish;
- runs every semantic verification;
- requires `data-app-ready="true"` and the expected persistence state;
- moves the pointer away and waits for local fonts;
- requires document scroll position zero and no viewport overflow;
- rejects visible elements that escape or clip their boxes;
- requires each visible enabled non-board control to be at least 44×44 CSS px;
- requires `touch-action: manipulation` on the document, body, and app shell;
- calls `toHaveScreenshot` with the shared exact settings.

Board cells are excluded from the 44 px assertion because the 9×9 grid must fit
the supported narrow viewport. Their semantics and containment remain tested.

Screenshot configuration is global:

```ts
toHaveScreenshot: {
  maxDiffPixels: 0,
  animations: 'disabled',
  caret: 'hide',
  fullPage: true,
  scale: 'css'
}
```

Tests and helpers must not add masks, per-test tolerance, blur, or retry-based
stability. Control the source of variation instead.

## 6. Generated walkthroughs

At the successful end of a scenario, `steps.generateDocs()` can write its
README from the same descriptions and checks used by the test. Documentation is
written only when `UPDATE_E2E_DOCS=1`.

The `phone` project is the sole writer for ordinary scenarios; `offline` is the
writer for scenario 012. The update command forces one worker so multiple
projects cannot race:

```sh
npm run test:e2e:update-snapshots
```

Do not edit a scenario README manually. Change the scenario metadata or named
verification, run the explicit update command, and review the generated Markdown
and every changed PNG. Normal test runs must leave the worktree unchanged.

## 7. Scenario catalogue

| ID | Journey | Principal evidence |
| --- | --- | --- |
| 001 | Local application shell | first launch, local status, manifest/build shell, empty store |
| 002 | Generate and start | five level choices, selected summary, worker generation, exact rated origin |
| 003 | Values, notes, conflicts | selection, explicit modes, notes, values, replacement, derived conflicts |
| 004 | Undo, redo, erase | compensating events, replayed correction, redo retirement after branching |
| 005 | Pause, reload, resume | frozen active time, covered board/log, exact reconstruction |
| 006 | Hint cancellation and confirmation | zero-event cancel, exact deterministic hint, count and log |
| 007 | Complete, review, and repeat | derived completion, History, terminal sharing, new attempt ID, pagination |
| 008 | Restart and abandon | reversible restart, retained event log, abandoned review and repeat |
| 009 | Settings and storage clear | preferences, mistake state, physical local deletion |
| 009 | Storage unavailable | memory-only play and accurate persistence warning |
| 010 | Local-only privacy | same-origin GET boundary across ordinary play and deletion |
| 011 | Responsive keyboard accessibility | keyboard path, axe, narrow/landscape/reflow containment, target sizes |
| 012 | Installed offline | shell install, offline reopen/resume/solve/History/reload, cache inspection |
| 013 | Multiple tabs | same-stream following, overlap handling, different tab-selected puzzles |
| 014 | Checked puzzle URL | ephemeral validation, consent, one import origin, address cleanup |
| 016 | Replay-aware value erase | restoration of placement-cleared notes and notes-only clearing |
| 017 | Number-wide highlight | real taps, local/number-wide toggle, matching-note option, no double-tap zoom |
| 018 | Notes default, All, and styles | preference snapshot, one-event fill, all note appearance combinations |
| 019 | Completed digit key | grey completion, All exclusion, stale-note erasure, count restoration |
| 020 | Alternating Stripes | exact peer sets, densely striped intersections, replacement, clearing, keyboard safety |

The generated README inside each directory is the readable step-by-step record;
the spec is the executable source of truth.

## 8. Event and storage assertions

`tests/e2e/helpers/event-store.ts` exposes the E2E mirror as typed test data.
Scenarios also use targeted `page.evaluate` reads where the expected event shape
is central to the story.

For an event-producing action, assert the smallest useful combination of:

- exact event type and count;
- stable origin/checkpoint fields;
- no event for selection, cancellation, validation, or other ephemeral state;
- board, timer, controls, History, and readable log agreeing with replay;
- reload equivalence;
- compensation target where identity matters.

Do not assert only the DOM for a persistence feature. Do not assert only storage
for a user-visible feature.

## 9. Privacy journey

Scenario 010 instruments and records browser requests across generation,
selection, value entry, hint, History, settings, reload, and clear-all. It
requires every request to be a same-origin `GET` and rejects unexpected browser
storage keys.

Sharing scenarios separately prove that a generated link reconstructs the
intended givens and work without containing the stored solution. Service workers
remain blocked in the ordinary privacy project so cache traffic does not obscure
the application boundary.

## 10. Installed offline journey

Scenario 012 uses the production build with service workers allowed:

1. load online and wait for explicit offline readiness;
2. verify the uncached revision-manifest request and installed shell;
3. generate, edit, and pause a real puzzle;
4. close the page, set the context offline, and reopen;
5. verify exact replay, resume, and complete;
6. open and later reopen solved History offline;
7. inspect Cache Storage for application assets and absence of event data.

The test restores network state during cleanup. It uses observable service
worker and application state, not arbitrary waits.

## 11. Accessibility evidence

Scenario 011 combines automated axe checks with semantic and keyboard
assertions. It proves one 81-cell grid, roving focus, Arrow/Home/End movement,
digit input, Notes mode, Delete, undo/redo, accessible cell state, visible
focus, target sizing, no document scrolling, and responsive composition.

The same story runs at phone, tablet, desktop, 320 px narrow phone, landscape,
and 200%-equivalent reflow. Automated results are evidence for the tested
Chromium/macOS matrix, not a claim about every browser or assistive technology.

## 12. Commands

```sh
npm run build:e2e
npm run check:docs
npm run test:e2e
npm run test:e2e -- tests/e2e/003-values-notes-conflicts
npm run test:e2e:privacy
npm run test:e2e:offline
npm run test:e2e:update-snapshots
npm run verify:change
```

`npm run verify:change` performs whitespace checks, Svelte/TypeScript checks,
unit tests, the full browser suite, and the production build. Git hooks run the
appropriate checks again before commits and pushes.

## 13. Review checklist

For a behavioural change:

- update or add the closest numbered journey;
- assert semantics before capturing visuals;
- update unit tests for exhaustive or replay-sensitive logic;
- run the focused scenario during iteration;
- run the explicit snapshot command only when visuals legitimately change;
- review every image at all affected projects;
- update the corresponding current contract document;
- finish with `npm run verify:change`.

A refactor with no intended visual effect should keep existing PNGs
byte-identical. A visible change should update implementation, semantic
assertions, screenshots, generated walkthrough, and UX documentation together.
