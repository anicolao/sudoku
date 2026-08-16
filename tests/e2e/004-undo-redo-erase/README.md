# Erase, undo, redo, and branch

The board moves backward and forward by appending compensating facts; a new move after undo closes the old redo branch without deleting it.

## The player generates the puzzle used for the correction journey

![The player generates the puzzle used for the correction journey](./screenshots/000-puzzle-generated-phone-macos.png)

**Verifications:**

- [x] The board and start event are ready

## The player selects row 4 column 8

![The player selects row 4 column 8](./screenshots/001-editable-cell-selected-phone-macos.png)

**Verifications:**

- [x] The cell is selected and Erase remains unavailable while it is empty

## The player enters a value that can now be erased or undone

![The player enters a value that can now be erased or undone](./screenshots/002-value-entered-phone-macos.png)

**Verifications:**

- [x] The value is visible and Erase is enabled
- [x] Undo names the exact placement it will affect

## Erase clears the selected editable cell with one canonical event

![Erase clears the selected editable cell with one canonical event](./screenshots/003-value-erased-phone-macos.png)

**Verifications:**

- [x] Row 4 column 8 is empty again
- [x] The newest event and log row record Erased r4c8

## Undo restores the erased value by appending a compensation

![Undo restores the erased value by appending a compensation](./screenshots/004-erase-undone-phone-macos.png)

**Verifications:**

- [x] The original value is visible again
- [x] The stream retains clear and appends move/undone

## Redo reapplies the same clear without rewriting the original event

![Redo reapplies the same clear without rewriting the original event](./screenshots/005-erase-redone-phone-macos.png)

**Verifications:**

- [x] The cell is empty and the clear is again the active move
- [x] The newest event and log entry are move/redone

## The player undoes the clear once more before choosing a new direction

![The player undoes the clear once more before choosing a new direction](./screenshots/006-erase-undone-again-phone-macos.png)

**Verifications:**

- [x] The value is restored and Redo is available

## The player selects a different empty cell while the old clear is redoable

![The player selects a different empty cell while the old clear is redoable](./screenshots/007-branch-cell-selected-phone-macos.png)

**Verifications:**

- [x] Selection changes without affecting the redo branch

## A new placement commits a branch and makes the old redo unavailable

![A new placement commits a branch and makes the old redo unavailable](./screenshots/008-new-branch-created-phone-macos.png)

**Verifications:**

- [x] The new value is visible with its derived conflict and Redo is disabled
- [x] All seven facts remain append-only and the new move is last
- [x] The game log shows the new branch above the retained undo and redo history
