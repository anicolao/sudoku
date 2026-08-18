# Solve in more than one tab

Every puzzle has an independent IndexedDB event stream. Tabs viewing the same puzzle follow committed events and remain editable; opening another puzzle affects only that tab.

## A second tab opens the same in-progress puzzle

![A second tab opens the same in-progress puzzle](./screenshots/000-second-tab-follows-puzzle-phone-macos.png)

**Verifications:**

- [x] The complete board is reconstructed from IndexedDB
- [x] Number input remains available in the second tab

## The first tab commits a value to the shared puzzle stream

![The first tab commits a value to the shared puzzle stream](./screenshots/001-first-tab-event-followed-phone-macos.png)

**Verifications:**

- [x] The second tab follows the committed value without reloading
- [x] The observing tab remains writable

## The player selects another cell in the second tab

![The player selects another cell in the second tab](./screenshots/002-second-tab-cell-selected-phone-macos.png)

**Verifications:**

- [x] Selection is local to this tab until an event is committed

## The second tab commits the next non-overlapping event

![The second tab commits the next non-overlapping event](./screenshots/003-second-tab-event-committed-phone-macos.png)

**Verifications:**

- [x] The value is accepted in the second tab
- [x] The first tab follows the second tab event

## The player opens the puzzle library while the first puzzle remains active

![The player opens the puzzle library while the first puzzle remains active](./screenshots/004-puzzle-library-opened-phone-macos.png)

**Verifications:**

- [x] Generation remains available with an in-progress puzzle
- [x] The interface explains that the current puzzle remains in History

## The second tab opens another independent puzzle stream

![The second tab opens another independent puzzle stream](./screenshots/005-different-puzzle-opened-phone-macos.png)

**Verifications:**

- [x] The new board starts without either earlier entry
- [x] The first tab stays on its original puzzle and retains both values
