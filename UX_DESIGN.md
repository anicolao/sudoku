# UX design

Document status: current interaction, responsive, visual, content, and
accessibility contract. Generated concept mockups establish tone and hierarchy;
the committed scenario screenshots under `tests/e2e/` are the visual evidence
for the implemented interface.

## 1. Design objective

Make the board the obvious centre of attention while keeping common moves close
and state changes explicit. A returning player should understand the selected
cell, input mode, elapsed state, and available correction at a glance. The app
should feel quiet during a long solve and remain understandable after an
interruption.

The interface is composed for a 393×852 phone, an 820×1180 tablet, and a
1280×1000 desktop, with additional evidence at 320×640, 852×393 landscape, and
a 320×450 200%-equivalent reflow viewport. Responsive design recomposes or
removes secondary chrome; it does not shrink required controls below usable
sizes.

## 2. Information architecture

Four primary destinations remain visible in the navigation:

- **Play** — open the tab-selected active puzzle or its read-only review;
- **Puzzles** — select one of five levels and generate another puzzle;
- **History** — page through every retained active, solved, and abandoned
  attempt;
- **Settings** — change local behaviour and appearance, inspect the build, or
  clear every local Sudoku record.

On phone and tablet the destinations form bottom navigation. At 900 px and
above, the brand, device status, destinations, and privacy footer become a left
rail. **On this device** means browser-local persistence; it is never styled or
described as cloud synchronization or backup.

## 3. First launch and generation

With no selected game, Play presents the local-only promise, five level choices,
the selected level's technique summary, and **Generate [level] puzzle**.
Foundations is the default.

Generation runs in a worker. While it is pending, the primary button is disabled
and exposes a busy state. The timer and event history do not start until a fully
validated puzzle has been committed. A bounded failure reports the error and
changes the action to **Retry [level]**; no partial grid is shown or stored.

Generating another puzzle does not destroy an active attempt. It starts a new
game stream, selects it in that tab, and leaves the earlier attempt available in
History.

## 4. Play header and board

The play header shows the level, a calm state heading, optional active time, and
Pause or Resume for editable active attempts. The board column contains:

- exactly 81 row-major gridcells with strong 3×3 boundaries;
- a **Unique solution** validation badge;
- generated/validated provenance and a short stable puzzle identifier.

Fixed givens use dark, heavier text. Player values use indigo. Notes occupy a
stable 3×3 mini-grid. Hint, conflict, and mistake markers supplement text and
accessible labels rather than relying on colour.

Each cell's accessible name reports row, column, fixed/editable state, value or
empty state, notes, hint origin, conflict, mistake, selection, and stripe or
stripe-source state when present.
The board uses one roving tab stop instead of 81 entries in the page tab order.

## 5. Selection and inspection

Selecting any cell shows an indigo inset boundary and highlights its row,
column, and box peers. Cells with the same displayed value receive a stronger
local match treatment. Matching notes may also be highlighted when the local
setting is enabled.

Selecting the same filled cell again toggles number-wide inspection. Every copy
of that number and the union of their peers receives the pink treatment. A third
selection of the same cell returns to local peer highlighting. Selecting a
different cell also resets the number-wide mode.

Selection and highlighting are ephemeral. They never append events. All
surfaces use `touch-action: manipulation` to prevent rapid taps from invoking
double-tap zoom while leaving deliberate pinch zoom available.

## 6. Number, note, and stripe input

The explicit **Number**, **Notes**, and **Stripes** buttons expose pressed state.
Notes mode uses amber as well as shape/text treatment and adds an **All** key
after 9.

Both orders are supported when number-first input is enabled:

- select a cell, then select or type a number;
- select a number, then select an editable cell.

Entering a number replaces the current player value and clears notes in that
cell. It does not toggle the value off; Erase is explicit. In Notes mode, a
number toggles only that mark. **All** adds the currently eligible digits to the
selected empty cell as one reversible action.

Each number key announces its remaining correct-placement count. A completed
digit becomes grey and unavailable, except when the selected cell contains that
digit as a stale note; in that case the key remains available only to remove the
note. **All** never recreates notes for completed digits.

Stripes mode replaces the number pad with the next stripe type and a clear
action. The first board tap marks all 20 peers of its cell with indigo even
stripes; the next marks the tapped cell's peers with amber odd stripes. Later
taps alternate and replace only the older set of the same type, so cells reached
by both of the two latest sources are crosshatched. Source cells carry labelled
**E** and **O** markers and programmatic source state. Stripe overlays remain
visible while the player temporarily returns to Number or Notes mode, until
cleared, restarted, or another puzzle is opened.

Stripe sources, overlays, alternation, and clearing are ephemeral and append no
event. Digits and erase keys do not edit the puzzle in Stripes mode. Arrow,
Home, and End keys move the roving focus without drawing a stripe; activating a
focused cell lays the next set.

Local settings control:

- mistake checking;
- automatic matching-note removal after a value placement;
- timer visibility;
- number-first input;
- starting newly selected games in Notes mode;
- matching-note highlighting;
- bold and large note rendering.

Bold, large, and matching-note appearance update the open board immediately.
Behavioural settings are captured in game origins so old play is not silently
reinterpreted.

## 7. Correction, hint, and lifecycle

**Erase** removes the selected editable value or its notes. When a value can be
traced to a placement event, erase targets that exact event so replay restores
all notes affected by the original placement.

**Undo** and **Redo** expose the affected move in accessible labels. Both append
events. A new reversible action after undo retires the previous redo branch.
**Restart** is itself reversible and clears mutable progress inside the same
attempt. **Start over** from History creates a distinct game stream over the
same immutable puzzle.

Hint opens a confirmation dialog: **Reveal one cell?** Cancelling changes
nothing. Confirming reveals the first eligible empty cell, adds a visible and
programmatic hint mark, records the exact value, and increments the hint count.

**Abandon** closes an unfinished attempt and opens History. The final board
remains available for read-only review and sharing.

## 8. Pause and completion

Pause freezes active elapsed time, clears selection, replaces the board with a
neutral full-board resume target, and covers the game log. Resume is available
from both the header and the board cover. Closing while active is an
interruption, not an implicit pause; active elapsed time continues. Closing
while paused preserves the frozen value.

Completion is derived when the projected board matches the committed solution.
The board remains visible and read-only. The completion panel reports level,
active time, mistakes, and hints, then offers **View history** and
**Choose another puzzle**. Completion adds no artificial event, animation,
sound, or delay.

## 9. Conflicts and mistakes

A Sudoku-rule duplicate marks every participating cell with red text, an inset
outline, a symbol, and the word “conflict” in the accessible name. The entered
value remains available for inspection and correction.

When mistake checking is enabled for the game, an entered value that differs
from the solution increments the mistake count and remains marked until fixed.
When it is disabled, the interface does not reveal non-conflicting wrong values.

Live announcements are short and factual: selection, entry, conflict, note
change, erase, undo/redo, pause/resume, hint, completion, sharing, storage, and
overlapping-tab results. Highlight changes are announced only when the user
explicitly toggles number-wide inspection.

## 10. Game log

The game log is a human-readable newest-first projection of the selected game
stream. Its header reports the total entry count, and the compact UI shows the
newest row. Rows expose stable `data-event-type` values for testing. A derived
**Solved puzzle** row appears for complete games even though there is no stored
completion event.

The paused cover hides the newest entry so the concealed board cannot be
inferred. Reviewing a terminal History attempt displays its log beside the
read-only board.

## 11. History

History is ordered newest first and mounts one card at a time to keep every
supported viewport scroll-free. **Newer** and **Older** page through retained
attempts.

A card reports state, level and short puzzle ID, active time, mistakes, and
hints. Active attempts offer **Open puzzle** and **Share**. Solved or abandoned
attempts offer **Review board**, **Start over**, and **Share**.

Share presents the same clean-puzzle or current-progress choice used during
play. A progress transfer contains the selected attempt's current checkpoint,
not its event log or the rest of History. Preparing an active checkpoint pauses
that attempt; sharing a terminal attempt adds no event.

There is no individual history deletion. Settings provides the explicit
privacy operation **Clear all local Sudoku data**, whose confirmation states
that every puzzle, move, preference, and recovery copy will be permanently
deleted.

## 12. Incoming links and sharing dialogs

Incoming puzzle and transfer links use a full-view checking state before any
board or data is trusted. A valid result shows a factual summary and waits for
consent. When an active game is selected, opening the incoming copy requires an
explicit choice to keep it or abandon it first.

The Share dialog distinguishes:

- **Share puzzle only** — clean givens for a fresh board;
- **Prepare progress transfer** — current values, notes, time, hints, mistakes,
  and transferable settings.

QR generation is local. Copy link is always the accessible alternative, and
native Web Share appears only when supported. The dialog states that the other
device receives an independent copy. See
[PUZZLE_SHARING.md](PUZZLE_SHARING.md) for validation and privacy details.

## 13. Storage and multi-tab states

A successful persistent load shows **On this device**. When IndexedDB is
unavailable, the status changes to **Memory only** and a persistent warning
explains that the session will continue but cannot be recovered after closing.
Sudoku input remains available.

Unreadable legacy data is preserved under a recovery key when possible, then a
clean store opens with a notice. The interface never renders a guessed partial
board from unreadable text.

Each tab may select a different active puzzle. Tabs showing the same puzzle
quietly follow committed changes. If two commands overlap on one stream
revision, one is discarded, the tab refreshes from IndexedDB, and the live
announcement says the latest state is shown.

## 14. Responsive composition

### Phone: below 600 px

- Primary navigation stays at the bottom.
- The shell header is removed during play to give the board priority.
- The board is capped by both available width and height.
- The number pad uses five columns; utility actions use four columns.
- The game log remains a compact newest-entry panel.
- History cards stack and actions use a two-column grid.

### Tablet: 600–899 px

- The board and a 230 px control rail share the workspace when height permits.
- Primary navigation remains at the bottom.
- Short-height landscape switches the number pad to five columns and utility
  actions to four columns.

### Desktop: 900 px and above

- A 226 px left rail owns brand, device status, navigation, and footer.
- Main content uses the remaining viewport; play is capped at a 600 px board
  plus a 250–290 px inspector.
- Large monitors gain surrounding space rather than an oversized board.

### Short-height layouts

At 650 px and below, secondary headings, provenance, management actions, and the
compact log may be hidden so the board and required solving controls remain in
one viewport. Incoming and sharing surfaces reduce spacing and QR size before
required text or actions disappear.

## 15. Visual system

- Canvas: warm ivory `#f7f5ef`.
- Primary surface: near-white `#fffdf8`.
- Ink and strong grid: charcoal `#20242b` / `#343840`.
- Primary, selection, focus family, and player values: indigo `#4654a3`.
- Notes-mode and global focus accent: amber `#b7791f`.
- Even stripes: indigo diagonal; odd stripes: amber counter-diagonal; overlap:
  both directions plus the **E**/**O** source symbols.
- Conflict and mistake: deep red `#b42318` with symbol and text.
- Number-wide inspection: pale and strong pink.
- Muted borders: `#c8c7c2` and `#d7d5cd`.
- Atkinson Hyperlegible is bundled locally at regular and bold weights.
- Non-board targets are at least 44×44 CSS px; board cells are the documented
  narrow-layout exception.

## 16. Content rules

- Use “puzzle,” “number,” “note,” “row,” “column,” “box,” “hint,” and “game log.”
- Use sentence case and factual status language.
- Say “conflict” for a duplicate and “mistake” only for a checked solution
  mismatch.
- Never claim local progress is synchronized or backed up.
- Never say “perfect”; report time, mistakes, and hints.
- Use compact `r4c7` notation only in readable log text where space matters;
  cell accessible names spell out row and column.
- Call a transferred game a copy, not a move or synchronization.

## 17. Accessibility acceptance

- One labelled grid contains exactly 81 labelled gridcells and a roving tab
  stop.
- Arrow keys move within the board; Home and End move within a row; digits enter
  or toggle values outside Stripes mode; `N` switches to or from Notes mode;
  Backspace/Delete erases outside Stripes mode; `Z` and Shift+`Z` undo and redo.
- Required state has text, shape, symbol, focus, or ARIA support in addition to
  colour.
- Dialogs expose modal semantics, close with Escape, and retain 44 px actions.
- The board and required controls fit without document or nested scrolling at
  every supported project size.
- Rapid taps do not invoke browser double-tap zoom; deliberate browser zoom is
  not prohibited.
- The main playable view passes the automated WCAG A/AA axe scan used by
  scenario 011. Automated evidence supplements manual assistive-technology
  review rather than claiming universal browser coverage.

## 18. Concept mockups

The pre-implementation form-factor mockups remain useful records of the intended
tone and composition:

### Phone

![Generated phone Sudoku concept](./design/mockups/sudoku-phone-v2.png)

### Tablet

![Generated tablet Sudoku concept](./design/mockups/sudoku-tablet-v2.png)

### Desktop

![Generated desktop Sudoku concept](./design/mockups/sudoku-desktop-v2.png)

They were generated with the built-in image tool using a high-fidelity
`ui-mockup` brief for an ivory, charcoal, indigo, and amber local-only Sudoku
interface. Their digits and small labels are illustrative. Committed scenario
screenshots, exact copy, Sudoku validity, semantics, and current responsive
behaviour take precedence.
