# Restart and abandon an attempt

Restart keeps one game history, resets its mutable cells, and can be undone or redone. Abandon closes the attempt, retains its final board for review, and permits a distinct start-over attempt.

## The player generates an attempt that can be restarted or abandoned

![The player generates an attempt that can be restarted or abandoned](./screenshots/000-puzzle-generated-phone-macos.png)

**Verifications:**

- [x] Restart and Abandon are both available

## The player selects an editable cell before the first move

![The player selects an editable cell before the first move](./screenshots/001-cell-selected-before-restart-phone-macos.png)

**Verifications:**

- [x] Row 4 column 8 is selected

## The player commits a value that Restart will clear

![The player commits a value that Restart will clear](./screenshots/002-value-entered-before-restart-phone-macos.png)

**Verifications:**

- [x] The value and its placement event are visible

## Restart resets mutable cells but remains reversible

![Restart resets mutable cells but remains reversible](./screenshots/003-puzzle-restarted-phone-macos.png)

**Verifications:**

- [x] All 41 editable cells are empty again
- [x] game/restarted follows the original value event
- [x] Undo identifies the restart as its next reversible action

## The player selects the reset cell again

![The player selects the reset cell again](./screenshots/004-cell-selected-after-restart-phone-macos.png)

**Verifications:**

- [x] Selection remains ephemeral after restart

## The player makes one move in the restarted attempt

![The player makes one move in the restarted attempt](./screenshots/005-value-entered-after-restart-phone-macos.png)

**Verifications:**

- [x] The restarted board contains the new value fact

## Abandon closes the unfinished attempt and opens History

![Abandon closes the unfinished attempt and opens History](./screenshots/006-attempt-abandoned-phone-macos.png)

**Verifications:**

- [x] History labels the attempt Abandoned
- [x] game/abandoned is the final fact for the attempt

## Review board shows the final abandoned position without edit controls

![Review board shows the final abandoned position without edit controls](./screenshots/007-abandoned-board-reviewed-phone-macos.png)

**Verifications:**

- [x] The last value remains visible and the number pad is disabled

## The player returns to the retained abandoned history card

![The player returns to the retained abandoned history card](./screenshots/008-abandoned-history-reopened-phone-macos.png)

**Verifications:**

- [x] Exactly one abandoned attempt remains

## Start over creates a clean active attempt from the same puzzle

![Start over creates a clean active attempt from the same puzzle](./screenshots/009-abandoned-puzzle-started-over-phone-macos.png)

**Verifications:**

- [x] The original givens return with all editable cells empty
- [x] The second game/started event uses a different game ID
