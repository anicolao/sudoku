# Skip completed notes and keep their cleanup action available

A near-complete event stream includes one stale pencil mark. After the ninth correct copy is placed, All skips that digit, selecting its stale note enables the otherwise grey key, and tapping it erases the note.

## The player generates an event-sourced puzzle

![The player generates an event-sourced puzzle](./screenshots/000-puzzle-generated-phone-macos.png)

**Verifications:**

- [x] The canonical stream contains game/started

## One correct 3 remains to be placed

![One correct 3 remains to be placed](./screenshots/001-one-copy-remains-phone-macos.png)

**Verifications:**

- [x] Exactly three cells remain so the puzzle stays active through note cleanup
- [x] A non-peer cell retains an old 3 note
- [x] The 3 key reports one remaining and is available

## The player selects the last 3 cell

![The player selects the last 3 cell](./screenshots/002-last-copy-cell-selected-phone-macos.png)

**Verifications:**

- [x] The target cell is selected and empty

## The player places the ninth 3 and its key turns grey

![The player places the ninth 3 and its key turns grey](./screenshots/003-completed-digit-disabled-phone-macos.png)

**Verifications:**

- [x] The 3 key reports zero remaining and is disabled
- [x] The completed key uses the explicit grey treatment
- [x] The two unrelated cells keep the puzzle active

## The player selects an empty cell without the completed-digit note

![The player selects an empty cell without the completed-digit note](./screenshots/004-plain-empty-cell-selected-phone-macos.png)

**Verifications:**

- [x] The completed 3 key stays grey and disabled here

## The player enters Notes mode

![The player enters Notes mode](./screenshots/005-notes-mode-enabled-phone-macos.png)

**Verifications:**

- [x] All notes becomes available for the empty cell

## The player chooses All and it skips the completed 3

![The player chooses All and it skips the completed 3](./screenshots/006-all-skips-completed-digit-phone-macos.png)

**Verifications:**

- [x] The new notes contain only digits with copies still missing
- [x] The event records exactly which available notes All added

## The player selects the cell with the stale 3 note

![The player selects the cell with the stale 3 note](./screenshots/007-stale-note-selected-phone-macos.png)

**Verifications:**

- [x] The 3 key is enabled even though zero copies remain
- [x] The actionable key no longer uses the grey treatment

## The player taps 3 to erase its stale note

![The player taps 3 to erase its stale note](./screenshots/008-stale-note-erased-phone-macos.png)

**Verifications:**

- [x] The completed note is gone
- [x] With no 3 note to erase, the key is grey and disabled again
- [x] One ordinary note-toggle event records the erasure

## The player returns to the placed 3

![The player returns to the placed 3](./screenshots/009-completed-value-selected-phone-macos.png)

**Verifications:**

- [x] Erase is available for that editable value

## The player erases that placement and the 3 key returns

![The player erases that placement and the 3 key returns](./screenshots/010-completed-digit-restored-phone-macos.png)

**Verifications:**

- [x] The 3 key reports one remaining and is enabled again
- [x] Replay restores the selected cell to empty
