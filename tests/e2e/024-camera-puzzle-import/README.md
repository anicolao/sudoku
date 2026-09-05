# Import a printed Sudoku with the camera

A player can select or photograph a conventional grid, recognize its printed givens entirely on-device, correct the result, prove that it has one unique solution, and start it as a normal local puzzle.

## The puzzle library offers private photo import beside generation

![The puzzle library offers private photo import beside generation](./screenshots/000-photo-import-offered-phone-macos.png)

**Verifications:**

- [x] The photo option explains that the image is not sent anywhere

## The confident givens are checked and presented for acceptance

![The confident givens are checked and presented for acceptance](./screenshots/001-recognized-givens-reviewed-phone-macos.png)

**Verifications:**

- [x] Every printed clue lands in its source cell and blank cells stay empty
- [x] The clean review is already proven and remains unsaved

## The corrected grid is proven before import

![The corrected grid is proven before import](./screenshots/002-photo-puzzle-validated-phone-macos.png)

**Verifications:**

- [x] The review confirms one unique solution and its logical rating

## The photographed puzzle starts as a private local attempt

![The photographed puzzle starts as a private local attempt](./screenshots/003-photo-puzzle-started-phone-macos.png)

**Verifications:**

- [x] The playable board preserves the photographed givens
- [x] One camera-photo origin records the validated puzzle but never the image
