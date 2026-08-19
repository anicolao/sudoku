# Grey a completed digit until one copy is erased

A near-complete event stream leaves two different values open. Placing the ninth correct copy greys and disables that digit key; erasing the placement restores the key immediately.

## The player generates an event-sourced puzzle

![The player generates an event-sourced puzzle](./screenshots/000-puzzle-generated-phone-macos.png)

**Verifications:**

- [x] The canonical stream contains game/started

## One correct 3 remains to be placed

![One correct 3 remains to be placed](./screenshots/001-one-copy-remains-phone-macos.png)

**Verifications:**

- [x] Exactly two cells remain so the puzzle stays active after the target move
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
- [x] The unrelated final cell keeps the puzzle active

## The player erases that placement and the 3 key returns

![The player erases that placement and the 3 key returns](./screenshots/004-completed-digit-restored-phone-macos.png)

**Verifications:**

- [x] The 3 key reports one remaining and is enabled again
- [x] Replay restores the selected cell to empty
