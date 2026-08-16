# Product vision

## The promise

Sudoku should feel like opening a well-made paper puzzle that happens to
remember where you left off. It starts quickly, works without an account or a
connection, explains its own history, and stays out of the player's way.

The app is for people who want to solve classic 9×9 Sudoku thoughtfully across
phone, tablet, and desktop. It supports pencil marks, keyboard and touch input,
undo, restrained hints, interruption recovery, and a local history without
turning practice into a social feed or an engagement contest.

## Product principles

### Local is a product feature

There is no sign-in and no cloud dependency. Puzzles, preferences, the current
game, and completed-game history stay on this device. The interface says “On
this device” anywhere a user might otherwise assume sync or backup.

### Every state should be explainable

The immutable event stream is the source of truth. A game can be reconstructed
from its start event and the exact sequence of moves. The visible game log is a
plain-language projection of that stream, useful to players, tests, debugging,
and future import/export work.

### Assistance without taking over

Peer highlighting and conflict indication help users inspect their own work.
Notes remain under the player's control. A hint is explicit, limited, recorded
in the log, and reflected in the game summary; it never silently changes the
board.

### Calm progress, not pressure

Time is available but not dominant, pausable, and can be hidden. Completion
celebrates the solve without confetti that blocks the board. There are no
streak-loss warnings, manipulative reminders, global leaderboards, or ads.

### Accessible by construction

Every action works with touch, mouse, and keyboard. Cell position, value,
givenness, notes, conflicts, and selection have programmatic meaning. Colour is
supportive, never the only signal. The layout adapts to the available space
instead of shrinking controls below usable sizes.

## Who it serves

- A casual solver continuing a puzzle in short sessions on a phone.
- A focused solver using a physical keyboard and visible move history on a
  desktop.
- A low-vision or motor-impaired player who needs zoom, strong focus, large
  targets, reduced motion, and non-colour state cues.
- A privacy-conscious player who does not want an account, analytics, or their
  play history uploaded.

## The MVP experience

1. Open the app and either resume the current puzzle or generate a new Easy
   puzzle on-device.
2. Select a cell and enter a number or toggle one or more pencil notes.
3. Use erase, undo, redo, pause, or a deliberate hint when needed.
4. Close or reload at any point and return to the exact reconstructed state.
5. Complete the puzzle and see elapsed active time, mistakes, hints, and the
   replayable game log in local history.
6. Clear all local Sudoku data from settings when desired.

## Success for the first release

The MVP succeeds when a player can generate and complete Easy puzzles with no
network, recover exactly after interruption, understand each visible state, and
trust that replay produces the same board every time. Engineering evidence must
show that:

- every generated puzzle has a valid unique solution;
- the logical validator solves every accepted puzzle without guessing and uses
  no technique beyond naked singles, hidden singles, naked pairs, and pointing
  pairs;
- identical generator version and seed produce the identical puzzle;
- every accepted event preserves board and stream invariants;
- reload and replay converge on the same projection;
- no production runtime request leaves the app origin;
- the installed app completes a full offline solve after browser restart;
- core flows pass at phone, tablet, and desktop sizes with keyboard and touch;
- semantic assertions and reviewed zero-diff screenshots agree.

## Deliberate non-goals for MVP

- accounts, profiles, cloud sync, multiplayer, sharing, or social features;
- ads, analytics, telemetry, push notifications, streak pressure, or purchases;
- daily puzzles that require a server or globally synchronized calendar;
- puzzle authoring, imports, exports, printing, OCR, or camera input;
- killer, samurai, irregular, or other Sudoku variants;
- competitive rankings or anti-cheat measures;
- cross-tab collaborative editing; a second active tab is warned and kept from
  silently overwriting the first.

## Future direction

After the local classic experience is proven, event sourcing leaves room for
optional encrypted export/import, replay animation, richer hint explanations,
additional difficulty levels, and additional solving techniques. Those
additions must preserve the local-first default and must not reinterpret old
event streams.
