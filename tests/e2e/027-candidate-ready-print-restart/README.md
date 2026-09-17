# Print and restart a candidate-ready puzzle

A puzzle authored with a complete starting candidate grid keeps that fresh state separate from later work. It can be printed with candidates and a matching QR, printed as givens only, reloaded, restarted, or opened again from the original link.

## The candidate-ready link is checked before it changes local history

![The candidate-ready link is checked before it changes local history](./screenshots/000-candidate-link-checked-phone-macos.png)

**Verifications:**

- [x] The summary reports every supplied candidate cell and offers the shared work

## The fresh puzzle opens with its complete starting candidate grid

![The fresh puzzle opens with its complete starting candidate grid](./screenshots/001-candidate-start-opened-phone-macos.png)

**Verifications:**

- [x] Every cell exactly matches the candidates authored for it

## Restart returns to the authored candidate-ready starting point

![Restart returns to the authored candidate-ready starting point](./screenshots/002-candidate-start-restored-phone-macos.png)

**Verifications:**

- [x] The later placement and candidate elimination are removed
- [x] Restart remains one reversible event in the same local attempt

## Printing clearly separates a fresh candidate copy from a givens-only copy

![Printing clearly separates a fresh candidate copy from a givens-only copy](./screenshots/003-candidate-print-choices-phone-macos.png)

**Verifications:**

- [x] Neither print option claims to print the player’s later work
