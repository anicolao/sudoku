# Erase a value by replaying without its placement

The player adds notes to a cell and its peer, places a value that removes those notes, then erases the value. Replay restores every note affected by that exact placement; erasing a notes-only cell still clears only that cell.

## The player generates a puzzle for the replay correction

![The player generates a puzzle for the replay correction](./screenshots/000-puzzle-generated-phone-macos.png)

**Verifications:**

- [x] The target and its row peer are editable

## The player selects the target cell

![The player selects the target cell](./screenshots/001-target-selected-phone-macos.png)

**Verifications:**

- [x] Row 4 column 8 is selected

## The player switches to Notes mode

![The player switches to Notes mode](./screenshots/002-notes-mode-selected-phone-macos.png)

**Verifications:**

- [x] Notes mode is active

## The player adds note 1 to the target

![The player adds note 1 to the target](./screenshots/003-target-note-added-phone-macos.png)

**Verifications:**

- [x] The target exposes its original note

## The player selects a peer in the same row

![The player selects a peer in the same row](./screenshots/004-peer-selected-phone-macos.png)

**Verifications:**

- [x] Row 4 column 1 is selected

## The player adds matching note 8 to the peer

![The player adds matching note 8 to the peer](./screenshots/005-peer-note-added-phone-macos.png)

**Verifications:**

- [x] The peer exposes the matching note

## The player returns to the target cell

![The player returns to the target cell](./screenshots/006-target-reselected-phone-macos.png)

**Verifications:**

- [x] The target retains its note before placement

## The player switches to Number mode

![The player switches to Number mode](./screenshots/007-number-mode-selected-phone-macos.png)

**Verifications:**

- [x] Number mode is active

## The player places 8, clearing every note it affects

![The player places 8, clearing every note it affects](./screenshots/008-value-placed-phone-macos.png)

**Verifications:**

- [x] The target value replaces its old notes
- [x] Automatic cleanup removes the matching peer note

## The player erases the value and replay restores all affected notes

![The player erases the value and replay restores all affected notes](./screenshots/009-value-erased-by-replay-phone-macos.png)

**Verifications:**

- [x] The target original note returns
- [x] The peer matching note returns
- [x] The erase event targets the exact placement instead of storing derived cell snapshots

## A reload reconstructs the restored notes from the event stream

![A reload reconstructs the restored notes from the event stream](./screenshots/010-restored-notes-replayed-phone-macos.png)

**Verifications:**

- [x] The target note remains restored after reload
- [x] The peer note remains restored after reload

## The player selects the notes-only target

![The player selects the notes-only target](./screenshots/011-notes-only-cell-selected-phone-macos.png)

**Verifications:**

- [x] Erase is available for the restored marking

## The player erases markings without changing any peer

![The player erases markings without changing any peer](./screenshots/012-markings-cleared-only-phone-macos.png)

**Verifications:**

- [x] The target markings are empty
- [x] The peer note is untouched
- [x] A notes-only erase remains a simple cell/cleared event
