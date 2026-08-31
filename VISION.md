# Product vision

Document status: stable product direction for a substantially complete
application. This document explains what the project protects when maintenance
changes or small additions are considered. Current implementation details live
in [ARCHITECTURE.md](ARCHITECTURE.md); exact interaction requirements live in
[UX_DESIGN.md](UX_DESIGN.md).

## The promise

Sudoku should feel like opening a well-made paper puzzle that happens to
remember where you left off. It starts quickly, works without an account or a
connection, explains its own history, and stays out of the player's way.

The application serves people who want to solve classic 9×9 Sudoku thoughtfully
across phone, tablet, and desktop. It supports pencil marks, keyboard and touch
input, undo, restrained hints, interruption recovery, and local history without
turning practice into a social feed or an engagement contest.

## Product principles

### Local is a product feature

There is no sign-in or cloud dependency. Puzzles, preferences, active attempts,
and completed-game history stay in the browser's local storage. The interface
says **On this device** wherever a user might otherwise assume synchronization
or backup.

Local does not mean trapped. A player can share puzzle givens or deliberately
copy a compact board checkpoint through a URL or QR code generated on-device.
The recipient validates it locally and creates an independent event stream; no
sharing service observes or coordinates either copy.

### Every state should be explainable

The immutable event stream is the source of truth. A game can be reconstructed
from its origin and ordered actions. The readable game log is a projection of
that stream, useful to players, tests, debugging, and future compatibility work.

New persistence features must preserve replay determinism and the meaning of
already stored events. Disposable projections may change; canonical history may
not be silently rewritten.

### Assistance without taking over

Peer highlighting, number-wide inspection, conflicts, and optional mistake
checking help players inspect their own work. Notes remain under the player's
control. A hint is explicit, limited, counted, and recorded; it never silently
solves a region or pretends to teach a technique.

### Calm progress, not pressure

Time is available but not dominant, can be hidden, and stops while paused.
Completion reports the facts without confetti that blocks the board. There are
no streak-loss warnings, manipulative reminders, global leaderboards, ads, or
purchases.

### Accessible by construction

Every core action works with touch, mouse, and keyboard. Cell position, value,
givenness, notes, conflicts, mistakes, and selection have programmatic meaning.
Colour is supportive, never the only signal. Layouts recompose for available
space instead of shrinking controls below usable sizes.

### Evidence is part of the product

Domain invariants belong in pure tests. User-visible behaviour is paired with
semantic browser assertions and reviewed zero-difference screenshots. Offline,
privacy, responsive, and accessibility claims remain executable rather than
aspirational.

## Audience

- A casual solver continuing a puzzle in short sessions on a phone.
- A focused solver using a keyboard and visible move history on a desktop.
- A low-vision or motor-impaired player who benefits from zoom, strong focus,
  large targets, reduced motion, and non-colour state cues.
- A privacy-conscious player who does not want an account, analytics, or play
  history uploaded.
- A maintainer who needs deterministic replay and scenario evidence to make a
  small change without destabilizing old games.

## Completed product scope

The maintained release includes:

1. on-device generation and logical rating at five cumulative levels;
2. number and pencil-note play, plus ephemeral peer Stripes for inspecting
   advanced patterns, with undo, redo, erase, restart, pause, and hint;
3. exact reload reconstruction, active-time accounting, and local History;
4. accessible responsive layouts for phone, tablet, landscape, zoom, and
   desktop use;
5. installed offline operation after one successful online load;
6. checked puzzle links and independent progress transfers;
7. explicit storage degradation, migration, corruption recovery, and deletion;
8. deterministic unit, browser, privacy, offline, and visual evidence.

This is the baseline, not a backlog. A future change should justify itself
against these established behaviours instead of reopening completed scope.

## Deliberate non-goals

- accounts, profiles, cloud sync, multiplayer, or social feeds;
- ads, analytics, telemetry, push notifications, streak pressure, or purchases;
- daily content that depends on a server or globally synchronized calendar;
- competitive rankings or anti-cheat measures;
- puzzle authoring, printing, OCR, or an in-app camera scanner;
- killer, samurai, irregular, or other Sudoku variants;
- cross-device merge or ownership transfer after a shared checkpoint;
- cross-tab collaborative editing of the same action at the same instant;
- embedding the solution or complete source event log in a sharing URL.

These are boundaries, not promises that the project will never evolve. Any
proposal that crosses one should explicitly revisit privacy, storage,
compatibility, accessibility, and operating-cost assumptions.

## Maintenance direction

The expected work from here is dependency maintenance, browser compatibility,
small usability improvements, accessibility fixes, test reliability, and
targeted bug fixes. A small feature is appropriate when it:

- works within the static, local-first architecture;
- does not require an account or external data service;
- preserves old event replay and import formats, or includes an explicit
  versioned migration;
- keeps the supported no-scroll and accessibility contracts;
- adds evidence proportional to its risk;
- updates the current documentation rather than adding another planning layer.

Larger ideas such as encrypted backup, full replay export, animated teaching,
or richer technique explanations remain possible extensions. They should be
designed as optional layers and must not reinterpret existing local history.
