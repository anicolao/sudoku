# Keep every puzzle and action on this device

The browser observes the complete runtime request surface while the player generates, enters a value, opens and cancels a hint, visits History and Settings, cancels deletion, and reloads. Only bundled same-origin GET assets are allowed.

## The local-only welcome view loads from bundled same-origin assets

![The local-only welcome view loads from bundled same-origin assets](./screenshots/000-private-welcome-ready-phone-macos.png)

**Verifications:**

- [x] Observed requests are same-origin GETs and CSP restricts connections to self

## The player generates and validates a puzzle locally

![The player generates and validates a puzzle locally](./screenshots/001-private-puzzle-generated-phone-macos.png)

**Verifications:**

- [x] Generation adds no external request or beacon

## The player selects an editable cell

![The player selects an editable cell](./screenshots/002-private-cell-selected-phone-macos.png)

**Verifications:**

- [x] Selection stays ephemeral and makes no request

## The player records a value only in the local event stream

![The player records a value only in the local event stream](./screenshots/003-private-value-entered-phone-macos.png)

**Verifications:**

- [x] cell/value-entered is local and no runtime request follows it

## The player opens the local hint confirmation

![The player opens the local hint confirmation](./screenshots/004-private-hint-opened-phone-macos.png)

**Verifications:**

- [x] The dialog requires consent without contacting a service

## The player cancels without adding an event

![The player cancels without adding an event](./screenshots/005-private-hint-cancelled-phone-macos.png)

**Verifications:**

- [x] The dialog closes and the request surface remains local

## History reconstructs the active game locally

![History reconstructs the active game locally](./screenshots/006-private-history-opened-phone-macos.png)

**Verifications:**

- [x] One in-progress card appears without a data request

## The player opens device-local settings

![The player opens device-local settings](./screenshots/007-private-settings-opened-phone-macos.png)

**Verifications:**

- [x] Settings render from replayed local state only

## The player inspects the precise clear-data confirmation

![The player inspects the precise clear-data confirmation](./screenshots/008-private-clear-dialog-opened-phone-macos.png)

**Verifications:**

- [x] No deletion or network action occurs before confirmation

## The player cancels data deletion

![The player cancels data deletion](./screenshots/009-private-clear-cancelled-phone-macos.png)

**Verifications:**

- [x] The canonical local event store remains and no request occurs

## A reload reconstructs the same local game without a data API

![A reload reconstructs the same local game without a data API](./screenshots/010-private-state-reloaded-phone-macos.png)

**Verifications:**

- [x] The event stream survives and every observed request is still a same-origin GET
