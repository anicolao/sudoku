# Share a puzzle with its current work

The player can make a readable puzzle link containing placements, grouped candidates, time, stats, and settings. The recipient checks it locally, sees a progress summary, and opens the reconstructed board from one import event.

## The player adds a placement, three candidates, and one hint

![The player adds a placement, three candidates, and one hint](./screenshots/000-work-entered-phone-macos.png)

**Verifications:**

- [x] The board shows the placement, notes, and marked hint before sharing

## The player chooses how much state to share

![The player chooses how much state to share](./screenshots/001-sharing-choices-phone-macos.png)

**Verifications:**

- [x] Clean and readable-work choices remain distinct

## The app prepares a readable puzzle-work and progress link without pausing

![The app prepares a readable puzzle-work and progress link without pausing](./screenshots/002-work-link-prepared-phone-macos.png)

**Verifications:**

- [x] The decoded payload has grouped work followed by readable optional metadata
- [x] The local QR exactly matches the link and sharing adds no event

## The recipient sees the checked puzzle and progress summary before consent

![The recipient sees the checked puzzle and progress summary before consent](./screenshots/003-shared-work-checked-phone-macos.png)

**Verifications:**

- [x] The summary reports work, time, hints, and mistakes
- [x] Validation remains ephemeral and offers to open shared work

## Consent reconstructs the work as one local import origin

![Consent reconstructs the work as one local import origin](./screenshots/004-shared-work-opened-phone-macos.png)

**Verifications:**

- [x] The imported event separates givens, compact work, and optional metadata
- [x] The address is clean and the reconstructed board is immediately playable
