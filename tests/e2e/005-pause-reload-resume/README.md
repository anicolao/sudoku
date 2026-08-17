# Pause, reload, and resume

Active time comes from event snapshots. Pausing covers the puzzle, reload replays the same state, and resuming continues without counting the interruption.

## The player generates a fresh puzzle and its active timer starts at zero

![The player generates a fresh puzzle and its active timer starts at zero](./screenshots/000-puzzle-generated-phone-macos.png)

**Verifications:**

- [x] The timer begins at 00:00 beside Pause

## The player selects row 4 column 8 before making a move

![The player selects row 4 column 8 before making a move](./screenshots/001-cell-selected-phone-macos.png)

**Verifications:**

- [x] The editable cell is selected without changing elapsed history

## The player enters a value before the interruption

![The player enters a value before the interruption](./screenshots/002-value-entered-phone-macos.png)

**Verifications:**

- [x] The value and its event are persisted

## The player pauses after one minute and five seconds of active play

![The player pauses after one minute and five seconds of active play](./screenshots/003-paused-at-01-05-phone-macos.png)

**Verifications:**

- [x] The timer is frozen at 01:05 and Resume is the primary session action
- [x] The board and game log contents are replaced by neutral covers
- [x] game/paused records exactly 65 seconds

## Reload reconstructs the covered puzzle and frozen timer exactly

![Reload reconstructs the covered puzzle and frozen timer exactly](./screenshots/004-paused-state-replayed-phone-macos.png)

**Verifications:**

- [x] The paused cover and 01:05 timer survive a full reload
- [x] Reload does not append or rewrite an event

## The player taps the covered puzzle and the exact board returns

![The player taps the covered puzzle and the exact board returns](./screenshots/005-puzzle-resumed-phone-macos.png)

**Verifications:**

- [x] The previously entered value is reconstructed and editable controls return
- [x] game/resumed keeps elapsed time at 65 seconds

## A second pause adds only the thirty resumed seconds

![A second pause adds only the thirty resumed seconds](./screenshots/006-paused-again-at-01-35-phone-macos.png)

**Verifications:**

- [x] The active timer is now exactly 01:35
- [x] The second pause appends 95 seconds without changing earlier facts

## Another reload proves the accumulated active time is replayable

![Another reload proves the accumulated active time is replayable](./screenshots/007-second-pause-replayed-phone-macos.png)

**Verifications:**

- [x] The timer remains frozen at 01:35 after restart
- [x] The canonical five-event document is byte-for-byte unchanged by reload

## The player can still use the header Resume button

![The player can still use the header Resume button](./screenshots/008-header-resume-option-phone-macos.png)

**Verifications:**

- [x] The existing compact Resume action restores the board too
- [x] The alternative action appends the same canonical game/resumed event
