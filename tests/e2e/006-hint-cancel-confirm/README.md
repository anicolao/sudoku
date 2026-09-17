# Choose how much help a hint provides

The hint menu can fill every basic candidate in one undoable action. Technique and cell guidance use the same simplest book-rule placement without changing canonical history, while a reveal records the exact cell and value.

## The generated puzzle offers an enabled Hint action

![The generated puzzle offers an enabled Hint action](./screenshots/000-puzzle-generated-phone-macos.png)

**Verifications:**

- [x] Hint is available and the summary has no hint event

## The player opens four distinct kinds of help

![The player opens four distinct kinds of help](./screenshots/001-hint-choices-opened-phone-macos.png)

**Verifications:**

- [x] The modal offers candidate, technique, cell, and reveal choices
- [x] Opening the choices appends no event

## The player asks the app to fill candidates allowed by each current unit

![The player asks the app to fill candidates allowed by each current unit](./screenshots/002-basic-candidates-filled-phone-macos.png)

**Verifications:**

- [x] Every editable empty cell receives fixed-position notes
- [x] One undoable candidate-fill fact is recorded without incrementing hints

## The player asks only which technique to try

![The player asks only which technique to try](./screenshots/003-technique-hint-shown-phone-macos.png)

**Verifications:**

- [x] The result names one supported book rule without naming a cell or value
- [x] Technique advice changes no cell and appends no event

## The player asks which cell to solve without seeing its contents

![The player asks which cell to solve without seeing its contents](./screenshots/004-cell-hint-shown-phone-macos.png)

**Verifications:**

- [x] The result names one coordinate and selects that still-empty cell
- [x] Cell advice reveals no number and appends no event

## The player can still cancel from the choice menu

![The player can still cancel from the choice menu](./screenshots/005-hint-cancelled-phone-macos.png)

**Verifications:**

- [x] The dialog closes and the board still has only its fixed givens
- [x] Cancellation leaves the event stream unchanged

## The player returns and chooses the full reveal

![The player returns and chooses the full reveal](./screenshots/006-hint-choices-reopened-phone-macos.png)

**Verifications:**

- [x] Reveal one cell is now the explicit confirm action

## Reveal places the same simplest target identified by Cell only

![Reveal places the same simplest target identified by Cell only](./screenshots/007-one-cell-revealed-phone-macos.png)

**Verifications:**

- [x] Exactly one cell is labelled as revealed by hint and selected
- [x] One hint/revealed fact records the exact cell and solution value
