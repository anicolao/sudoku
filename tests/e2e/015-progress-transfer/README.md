# Move a puzzle to another device

Every player action is shown below. The source pauses, renders its QR locally, and the recipient validates one compact checkpoint before storing it as a new event stream.

## The player generates a fresh local puzzle

![The player generates a fresh local puzzle](./screenshots/000-puzzle-generated-phone-macos.png)

**Verifications:**

- [x] The board and Share action are ready

## The player selects an empty cell

![The player selects an empty cell](./screenshots/001-value-cell-selected-phone-macos.png)

**Verifications:**

- [x] The selected cell is visible but selection creates no event

## The player enters 3 in the selected cell

![The player enters 3 in the selected cell](./screenshots/002-value-entered-phone-macos.png)

**Verifications:**

- [x] The value is stored as one canonical move

## The player selects a second empty cell for a pencil note

![The player selects a second empty cell for a pencil note](./screenshots/003-note-cell-selected-phone-macos.png)

**Verifications:**

- [x] The second cell is selected without changing history

## The player switches to Notes mode

![The player switches to Notes mode](./screenshots/004-notes-mode-selected-phone-macos.png)

**Verifications:**

- [x] Notes mode is pressed and remains ephemeral

## The player adds pencil note 2

![The player adds pencil note 2](./screenshots/005-note-entered-phone-macos.png)

**Verifications:**

- [x] The note is stored in one note event

## The player opens the local sharing choices

![The player opens the local sharing choices](./screenshots/006-share-opened-phone-macos.png)

**Verifications:**

- [x] Puzzle-only and progress transfer are distinct choices

## The player first prepares a clean puzzle link

![The player first prepares a clean puzzle link](./screenshots/007-puzzle-only-link-prepared-phone-macos.png)

**Verifications:**

- [x] Its locally rendered QR carries only the literal givens query
- [x] Sharing only the puzzle neither pauses nor appends an event

## The player closes the clean-link dialog and keeps playing

![The player closes the clean-link dialog and keeps playing](./screenshots/008-puzzle-only-link-closed-phone-macos.png)

**Verifications:**

- [x] The dialog closes with the source puzzle still active

## The player opens Share again to carry current progress

![The player opens Share again to carry current progress](./screenshots/009-share-reopened-phone-macos.png)

**Verifications:**

- [x] Prepare progress transfer is available from the unchanged game

## The player freezes the checkpoint and gets a locally rendered QR code

![The player freezes the checkpoint and gets a locally rendered QR code](./screenshots/010-transfer-prepared-phone-macos.png)

**Verifications:**

- [x] The dialog explains that the source remains paused
- [x] Only the ordinary pause event was added while preparing the transfer

## The player copies the same transfer link as an accessible QR alternative

![The player copies the same transfer link as an accessible QR alternative](./screenshots/011-transfer-link-copied-phone-macos.png)

**Verifications:**

- [x] Clipboard feedback is visible and the copied URL exactly matches the independently decoded QR

## The other device checks the scanned checkpoint before storing it

![The other device checks the scanned checkpoint before storing it](./screenshots/012-recipient-checked-phone-macos.png)

**Verifications:**

- [x] The consent summary preserves one value, one noted cell, and paused active time
- [x] Fragment data was not sent in any network request and no event exists yet

## The recipient consents and imports one paused checkpoint event

![The recipient consents and imports one paused checkpoint event](./screenshots/013-recipient-imported-phone-macos.png)

**Verifications:**

- [x] One import event contains the transferred settings and checkpoint
- [x] The consumed fragment is removed and the board starts paused

## The recipient resumes the copied game

![The recipient resumes the copied game](./screenshots/014-recipient-resumed-phone-macos.png)

**Verifications:**

- [x] The transferred value and note reappear on the playable board

## The recipient selects another empty cell

![The recipient selects another empty cell](./screenshots/015-recipient-cell-selected-phone-macos.png)

**Verifications:**

- [x] New play begins from the imported checkpoint

## The recipient enters 8 after the transfer

![The recipient enters 8 after the transfer](./screenshots/016-recipient-value-entered-phone-macos.png)

**Verifications:**

- [x] The new move is appended after import and resume

## Undo affects only the move made after import

![Undo affects only the move made after import](./screenshots/017-recipient-move-undone-phone-macos.png)

**Verifications:**

- [x] The recipient move is empty again while transferred progress remains

## Scanning the same QR again opens the existing local game

![Scanning the same QR again opens the existing local game](./screenshots/018-duplicate-scan-idempotent-phone-macos.png)

**Verifications:**

- [x] The transfer fragment clears without appending a duplicate import
