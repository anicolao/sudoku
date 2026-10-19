# Photo import regression corpus

Open [review.html](review.html) locally to compare each original image with its proposed source transcription. Black bold digits are original givens, blue digits are player placements, and small grey digits are notes. The default puzzle link encodes **givens followed by placements**, not a flattened board. A second link includes notes when they are fully readable. Placement order is row-major; a photograph cannot recover the player's historical move order.

The old partially accepted OCR boards were not reliable goldens and have been replaced by independent visual transcriptions. The new transcriptions are proposed for review, not automatically approved merely because a puzzle has a unique solution. Thirty examples are enforced; eight known handwriting failures are explicitly deferred with reasons, not counted as passes.

## Source truth versus validation policy

`goldens.json` describes what is visible, independently of what this version of recognition should import:

- `givens`: 81 digits/dots for original clues only.
- `placements`: a separate 81-digit/dot board for full-size player entries. It cannot overlap givens.
- `notes`: a map from one-based row/column coordinates to sorted candidate digits, e.g. `"54": "489"`. These are visible notes, not computed legal candidates; incomplete or incorrect notes are preserved.
- `unclassified`: readable full-size digits whose given/placement role cannot be established from the image. Amber in the report; never silently promoted to givens.
- `ambiguities`: explicit unresolved details. Keys `notes:RC` identify unreadable, crossed-out or shorthand candidate marks. `roles` identifies indistinguishable givens/work. A question mark marks unresolved notes in the diagram; missing candidates are not invented from the solution.
- `status`: `transcribed` means visually transcribed for review, possibly with explicit ambiguities; `unreviewed` can never pass. A `null` layer is untranscribed, not verified empty.

`recognition-policy.json` independently chooses the layers to validate and the expected UI outcome. The initial policy requires exact **givens and placements**, with no candidate-note import. Choosing `['givens']` or `['givens', 'placements', 'notes']` changes the test contract without rewriting source truth. Ambiguities block only affected selected layers: unreadable notes do not excuse missing placements or block checking known givens. Unknown given/placement roles do block exact role validation and the default puzzle link.

Five sources have an unknowable original-givens distinction: `12paper.jpeg`, `13missing.jpeg`, `15nohint.jpeg`, `15whatnext.jpeg`, and `22handwritten.jpeg`. Their visible full-size digits are retained as unclassified, with notes separately recorded. Their policy explicitly sets `unclassifiedRoles: "either"`: every unclassified digit must appear exactly once, with its correct value, in either recognized full-size layer. Known roles and blank cells still require exact matches. This is not permission to ignore missing digits, extra digits, or wrong values. These masters cannot supply an authoritative original-puzzle URL, and we do not need unavailable original links to validate recognition. The app's existing fallback treats entries without a distinctive work style as givens, subject to validation and user correction; that import policy does not rewrite the source master. Paper examples with faint/erased or dot-shorthand marks also explicitly retain unresolved notes; they are not asserted to have no notes.

`21forward.webp` uses the fully visible top puzzle. Its printed givens (even with the three large handwritten placements) allow multiple solutions. Its policy requires exact givens/placements in correction review, a non-unique-solution error when checked, no start button, and no saved game. The application's uniqueness requirement remains unchanged.

Selection fills also hide the normal digit-color distinction in three cells: r4c4 in `14whyhere.jpeg`, and r3c2/r6c3 in `25obvious.jpeg`. These cells alone are unclassified and use the same explicit `unclassifiedRoles: "either"` policy; every other given and placement in those images retains strict role validation. These are source-transcription corrections based on the visible selection styles, not OCR-derived digit changes.

## Running and reviewing

Run `npm run test:e2e:photos` to import every enabled image through the real UI. A normal pass requires an exact match for each selected layer, validation of the original givens, and successful persistence of that same puzzle and its placements. A right digit assigned to the wrong layer fails. Merely reaching correction review with incorrect digits fails. Each image uses fresh browser storage, and a failure does not prevent the remaining images from running.

The `skips` map in `recognition-policy.json` temporarily defers these eight known handwriting failures: `06solved.webp`, `11sleep.jpeg`, `12paper.jpeg`, `14stuckagain.jpeg`, `15help.jpeg`, `17paper.jpeg`, `19impossible.jpeg`, and `22handwritten.jpeg`. Each appears as a named Playwright skip and as **SKIP**, with its reason, in the review page. Their originals and full layered masters remain in the corpus and are still schema-checked. Reports count 30 enabled checks and eight skips, never 38 passes. No application behavior or recognition expectations are relaxed.

To run all 38 again while improving handwriting recognition, use `PHOTO_INCLUDE_SKIPPED=1 npm run test:e2e:photos`. This temporarily ignores the skip map and restores the original exact assertions and actual-image report for every case. Remove a skip entry once its unchanged master and expected outcome pass.

The Playwright report includes a portable `photo-import-review.html` attachment with the original, golden master, actual straightened grid, and actual recognized board. Differences are shaded red. This attachment embeds its images, so it also works after downloading the CI report.

When adding a photo, independently transcribe all three layers, record any unresolved details, and run `npm run photos:review` to regenerate the comparison page. The suite fails if an image lacks a transcription. There is deliberately no OCR-driven golden-update command. Never remove visible work/notes from the source master just because the recognizer cannot handle them, and never infer missing source data from a solved board.
