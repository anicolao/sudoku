# Play and resume Killer Sudoku

As a solver, I can start a checked Killer puzzle, read its cage totals, make reversible moves, return to the same rules and progress, inspect combinations, and request an explained deduction.

## A blank-givens Killer has labelled cages and ordinary number controls

![A blank-givens Killer has labelled cages and ordinary number controls](./screenshots/000-killer-ready-phone-macos.png)

**Verifications:**

- [x] The checked rules and cages are stored with the puzzle

## Reload restores the same cage sums and placement

![Reload restores the same cage sums and placement](./screenshots/001-killer-resumed-phone-macos.png)

**Verifications:**

- [x] Killer identity, cage count and placed digit survive reload

## Inspect the selected cage without changing pencil marks or digits

![Inspect the selected cage without changing pencil marks or digits](./screenshots/002-inspect-cage-phone-macos.png)

**Verifications:**

- [x] The inspector explains remaining sum and feasible sets

## A logical hint explains a cage or positional deduction without placing it

![A logical hint explains a cage or positional deduction without placing it](./screenshots/003-explain-step-phone-macos.png)

**Verifications:**

- [x] The explanation is a supported Killer deduction
