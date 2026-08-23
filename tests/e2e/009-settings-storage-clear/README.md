# Recover storage, choose preferences, and clear local data

Malformed history is preserved before a clean start. Preferences are events snapshotted into a new game, and the destructive privacy action names and removes every local Sudoku record.

## Startup preserves unreadable bytes and explains the clean recovery

![Startup preserves unreadable bytes and explains the clean recovery](./screenshots/000-corrupt-history-preserved-phone-macos.png)

**Verifications:**

- [x] The canonical key is absent and exactly one recovery copy retains the original bytes

## The player opens local preferences

![The player opens local preferences](./screenshots/001-settings-opened-phone-macos.png)

**Verifications:**

- [x] Seven labelled switches, the clear-data action, and deterministic build details are available

## The player enables immediate mistake checking

![The player enables immediate mistake checking](./screenshots/002-mistake-checking-enabled-phone-macos.png)

**Verifications:**

- [x] The switch is on and settings/changed is the first canonical event

## The player turns off the visible timer for future puzzles

![The player turns off the visible timer for future puzzles](./screenshots/003-timer-hidden-for-new-games-phone-macos.png)

**Verifications:**

- [x] The timer preference is stored as a second app-level event

## The player returns to the empty play view

![The player returns to the empty play view](./screenshots/004-play-returned-phone-macos.png)

**Verifications:**

- [x] The recovered clean store is ready to generate

## The player generates a puzzle with the chosen preferences

![The player generates a puzzle with the chosen preferences](./screenshots/005-settings-snapshotted-phone-macos.png)

**Verifications:**

- [x] The game snapshots mistake checking on and timer display off

## The player selects an editable cell before entering a checked value

![The player selects an editable cell before entering a checked value](./screenshots/006-mistake-cell-selected-phone-macos.png)

**Verifications:**

- [x] The chosen cell is selected and still empty

## A wrong but non-conflicting value is visibly identified as a mistake

![A wrong but non-conflicting value is visibly identified as a mistake](./screenshots/007-mistake-marked-phone-macos.png)

**Verifications:**

- [x] The cell exposes mistake state and the projection counts one mistake

## The player returns to Settings to manage local data

![The player returns to Settings to manage local data](./screenshots/008-settings-reopened-phone-macos.png)

**Verifications:**

- [x] The saved switches retain their replayed values

## Clear all opens an explicit irreversible confirmation

![Clear all opens an explicit irreversible confirmation](./screenshots/009-clear-confirmation-opened-phone-macos.png)

**Verifications:**

- [x] The dialog names every category and offers Cancel

## Cancel preserves the complete local event stream

![Cancel preserves the complete local event stream](./screenshots/010-clear-cancelled-phone-macos.png)

**Verifications:**

- [x] The dialog closes and canonical plus recovery keys remain

## The player deliberately opens the destructive confirmation again

![The player deliberately opens the destructive confirmation again](./screenshots/011-clear-confirmation-reopened-phone-macos.png)

**Verifications:**

- [x] Clear everything is ready only inside the modal

## The player permanently clears all local Sudoku data

![The player permanently clears all local Sudoku data](./screenshots/012-all-local-data-cleared-phone-macos.png)

**Verifications:**

- [x] No sudoku.* key remains and the app returns to a fresh welcome view
