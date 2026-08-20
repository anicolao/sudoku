# Start in Notes mode, fill every pencil mark, and try four styles

The player enables the local Notes default, fills notes 1–9 with one reversible event, and independently tries large and bold notes in all four combinations before continuing to toggle and undo notes.

## The player opens device-local Settings

![The player opens device-local Settings](./screenshots/000-settings-opened-phone-macos.png)

**Verifications:**

- [x] Start in Notes mode is available and initially off

## The player makes Notes the default for new puzzles

![The player makes Notes the default for new puzzles](./screenshots/001-notes-default-enabled-phone-macos.png)

**Verifications:**

- [x] The preference is visibly on
- [x] One app-level settings event records notesFirst

## The player returns to Play

![The player returns to Play](./screenshots/002-play-returned-phone-macos.png)

**Verifications:**

- [x] The local puzzle generator is ready

## The new puzzle opens directly in Notes mode

![The new puzzle opens directly in Notes mode](./screenshots/003-puzzle-started-in-notes-phone-macos.png)

**Verifications:**

- [x] The game snapshots notesFirst and Notes is pressed
- [x] All notes appears immediately after digit 9 and waits for a cell

## The player selects an empty editable cell

![The player selects an empty editable cell](./screenshots/004-empty-cell-selected-phone-macos.png)

**Verifications:**

- [x] All notes becomes available for the selected cell

## The player fills notes 1–9 with one All action

![The player fills notes 1–9 with one All action](./screenshots/005-all-notes-filled-phone-macos.png)

**Verifications:**

- [x] The cell exposes every note in order
- [x] Every visible note fills and stays inside its own 3×3 slot
- [x] Bold and Large notes are both on by default
- [x] One cell/notes-filled fact represents the action
- [x] All is disabled while every note is already present

## The player opens note appearance settings

![The player opens note appearance settings](./screenshots/006-note-style-settings-opened-phone-macos.png)

**Verifications:**

- [x] Bold and Large are independent switches and both begin on

## The player turns Bold notes off while leaving Large notes on

![The player turns Bold notes off while leaving Large notes on](./screenshots/007-bold-notes-disabled-phone-macos.png)

**Verifications:**

- [x] The two switches show regular plus large
- [x] One app-level event records the Bold change

## The puzzle immediately shows large notes at regular weight

![The puzzle immediately shows large notes at regular weight](./screenshots/008-large-regular-notes-phone-macos.png)

**Verifications:**

- [x] The first alternative combines not bold plus large

## The player returns to Settings to try smaller notes

![The player returns to Settings to try smaller notes](./screenshots/009-style-settings-reopened-for-small-notes-phone-macos.png)

**Verifications:**

- [x] The previous Bold choice remains off

## The player restores Bold notes

![The player restores Bold notes](./screenshots/010-bold-notes-enabled-phone-macos.png)

**Verifications:**

- [x] Bold is on again and its event is stored

## The player turns Large notes off while keeping Bold notes on

![The player turns Large notes off while keeping Bold notes on](./screenshots/011-large-notes-disabled-phone-macos.png)

**Verifications:**

- [x] The switches show bold plus not large and the event is stored

## The puzzle immediately shows smaller bold notes

![The puzzle immediately shows smaller bold notes](./screenshots/012-small-bold-notes-phone-macos.png)

**Verifications:**

- [x] The second alternative combines bold plus not large

## The player returns to Settings for the final combination

![The player returns to Settings for the final combination](./screenshots/013-style-settings-reopened-for-regular-notes-phone-macos.png)

**Verifications:**

- [x] Large remains off while Bold remains on

## The player turns Bold notes off while Large notes stays off

![The player turns Bold notes off while Large notes stays off](./screenshots/014-bold-notes-disabled-with-small-notes-phone-macos.png)

**Verifications:**

- [x] Both appearance switches are off and the event is stored

## The puzzle immediately shows smaller notes at regular weight

![The puzzle immediately shows smaller notes at regular weight](./screenshots/015-small-regular-notes-phone-macos.png)

**Verifications:**

- [x] The third alternative combines not bold plus not large

## The player removes note 4 normally

![The player removes note 4 normally](./screenshots/016-one-note-removed-phone-macos.png)

**Verifications:**

- [x] Only note 4 is absent
- [x] The ordinary note toggle remains a separate event

## The player uses All again to restore the missing note

![The player uses All again to restore the missing note](./screenshots/017-all-notes-refilled-phone-macos.png)

**Verifications:**

- [x] Notes 1–9 are complete again with one new fill event

## Undo reverses the one All action

![Undo reverses the one All action](./screenshots/018-all-notes-undone-phone-macos.png)

**Verifications:**

- [x] Replay returns to the exact prior notes with 4 absent
