# Operate the complete puzzle with touch, mouse, or keyboard

The same semantic grid reflows from a 320 px viewport through landscape, tablet, and desktop. Every keyboard command produces an observable state, and automated accessibility checks run against the playable board.

## The local welcome state fits the current viewport before play begins

![The local welcome state fits the current viewport before play begins](./screenshots/000-responsive-welcome-phone-macos.png)

**Verifications:**

- [x] Puzzle generation is available without scrolling

## The player generates a board in the current form factor

![The player generates a board in the current form factor](./screenshots/001-responsive-board-generated-phone-macos.png)

**Verifications:**

- [x] The labelled grid contains 81 gridcells without horizontal overflow
- [x] Axe reports no WCAG A/AA violations in the playable view

## The player chooses a number before choosing a cell

![The player chooses a number before choosing a cell](./screenshots/002-number-chosen-first-phone-macos.png)

**Verifications:**

- [x] The number pad exposes the selected number through aria-pressed

## Choosing an editable cell commits the previously selected number

![Choosing an editable cell commits the previously selected number](./screenshots/003-number-first-value-placed-phone-macos.png)

**Verifications:**

- [x] The correct value is stored and the one-shot number selection clears

## The player focuses a new cell before navigating the composite grid

![The player focuses a new cell before navigating the composite grid](./screenshots/004-keyboard-cell-focused-phone-macos.png)

**Verifications:**

- [x] Exactly one selected gridcell is in the tab order

## Arrow Right moves focus and selection one column

![Arrow Right moves focus and selection one column](./screenshots/005-arrow-right-navigation-phone-macos.png)

**Verifications:**

- [x] The next cell is focused, selected, and is the sole tab stop

## Home moves to the first cell in the current row

![Home moves to the first cell in the current row](./screenshots/006-home-navigation-phone-macos.png)

**Verifications:**

- [x] The row-start cell receives focus

## End moves to the last cell in the current row

![End moves to the last cell in the current row](./screenshots/007-end-navigation-phone-macos.png)

**Verifications:**

- [x] The row-end cell receives focus

## The player focuses an empty editable cell for a keyboard note

![The player focuses an empty editable cell for a keyboard note](./screenshots/008-note-cell-focused-phone-macos.png)

**Verifications:**

- [x] The empty editable cell is selected

## N toggles Notes mode without leaving the grid

![N toggles Notes mode without leaving the grid](./screenshots/009-notes-mode-keyboard-toggle-phone-macos.png)

**Verifications:**

- [x] Notes is pressed and the cell keeps focus

## A digit key adds a pencil note in Notes mode

![A digit key adds a pencil note in Notes mode](./screenshots/010-note-entered-by-keyboard-phone-macos.png)

**Verifications:**

- [x] The cell accessible name reports the exact note

## Delete erases the focused cell

![Delete erases the focused cell](./screenshots/011-note-erased-by-keyboard-phone-macos.png)

**Verifications:**

- [x] The cell becomes empty and cell/cleared is appended

## Z undoes the erase without rewriting history

![Z undoes the erase without rewriting history](./screenshots/012-erase-undone-by-keyboard-phone-macos.png)

**Verifications:**

- [x] The note returns and move/undone is appended

## Shift+Z redoes the erase

![Shift+Z redoes the erase](./screenshots/013-erase-redone-by-keyboard-phone-macos.png)

**Verifications:**

- [x] The cell is empty again and move/redone is appended

## The player opens a transient dialog

![The player opens a transient dialog](./screenshots/014-hint-dialog-opened-for-escape-phone-macos.png)

**Verifications:**

- [x] The modal is visible before the Escape command

## Escape closes the topmost transient dialog

![Escape closes the topmost transient dialog](./screenshots/015-escape-closes-dialog-phone-macos.png)

**Verifications:**

- [x] The dialog closes without appending an event

## The player opens the puzzle library in the same fixed viewport

![The player opens the puzzle library in the same fixed viewport](./screenshots/016-responsive-puzzles-view-phone-macos.png)

**Verifications:**

- [x] Another puzzle can be generated without closing the active one

## The player opens history without entering a scrolling region

![The player opens history without entering a scrolling region](./screenshots/017-responsive-history-view-phone-macos.png)

**Verifications:**

- [x] The current attempt is represented by one fixed-size card

## The player opens all local settings without scrolling

![The player opens all local settings without scrolling](./screenshots/018-responsive-settings-view-phone-macos.png)

**Verifications:**

- [x] All five preference switches and the local-data action remain available
