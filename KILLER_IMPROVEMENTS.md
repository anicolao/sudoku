# Killer Sudoku improvements

Status: proposal for review, 2026-09-21. No recommendations in this document
have been implemented. The branch has been rebased onto `main`; integration
resolutions preserve existing classic and Killer features.

## Recommendation

Start by measuring opening generosity and collecting reproducible feedback.
Keep the current technique-based Easy/Medium/Hard labels while we investigate
why puzzles within a band feel different. Then trial a modest change to cage
selection, with human review before making it the default.

Preserve the cage-combination inspector, cage/unit overhang explanations, and
selected-cage highlight. They are valuable assistance, not defects to remove
in pursuit of difficulty. Do not add harder techniques, force symmetry, or
arbitrarily remove easy opening cages as the first response.

This extends [KILLER_SUDOKU_SUPPORT.md](KILLER_SUDOKU_SUPPORT.md). Its existing
rules, persistence guarantees, and requirement to deliver user-visible stories
still apply. This document is a review boundary, not authorization to implement
the proposed changes.

## What the feedback establishes

Neolfi reports approximately five Hard solves:

- The overall difficulty fits the puzzles they usually solve, with noticeable
  variation within Hard.
- Cages with one possible digit combination sometimes make the opening very
  generous and quickly constrain rows and columns.
- Cage/unit overhangs felt useful without seeming oversupplied.
- The combination inspector and overhang calculations were particularly
  welcome; they made cages approachable that the tester previously skipped.

This is promising qualitative evidence from one experienced solver. We do not
have the five puzzle identities, step histories, assistance usage, or a
comparison group. The cause of the variation is therefore a hypothesis, not
an established defect in every Hard puzzle. We should not infer that a more
uniform opening necessarily makes a better whole puzzle.

## What the current implementation explains

The [generator](src/lib/generator/killer-puzzle.ts) constructs solved grids and
cages procedurally. Version 3 rejects pair-dominated layouts, permits no givens
or singleton cages, and keeps compact merges only if the requested logical
profile can still solve the result. It independently verifies uniqueness.

Two current choices matter for this feedback:

1. **Merge candidates are sorted by their number of digit combinations, fewest
   first.** This intentionally favors restrictive arithmetic and helps preserve
   a logical solve. It can also bias accepted puzzles toward informative cages.
   The final distribution needs measurement; the ordering alone does not prove
   causation.
2. **The rating is the lowest supported profile that completes the puzzle.**
   [Killer analysis](src/lib/domain/killer-analysis.ts) checks cumulative profiles:
   Easy covers cage assignments, singles and one-cell 45 residuals; Medium adds
   pairs and locks; Hard adds two-cell 45 residual pruning. A Hard puzzle can
   have a very easy first half and a single later bottleneck. The rating does
   not currently measure that pacing, the visibility of the bottleneck, or how
   much bookkeeping precedes it.

The existing layout criteria are an aesthetic floor: at most 45% pair cages,
with at least three triples and three four/five-cell cages. They do not measure
opening information, solve-path elegance, or human difficulty consistency.

### Be precise about “one combination”

These are unordered sets of distinct digits under the supported cage rule:

| Cage | Only digit set | What remains unknown |
| --- | --- | --- |
| Two cells totalling 16 | `{7,9}` | Which cell contains each digit |
| Two cells totalling 17 | `{8,9}` | Which cell contains each digit |
| Four cells totalling 11 | `{1,2,3,5}` | The feasible placement of four digits |

A unique digit set is not a solved cage. Its usefulness depends on placement
restrictions and geometry: a set inside one row or box can eliminate those
digits elsewhere immediately; a cage crossing several houses may reveal less.
A larger one-combination cage can expose more digits than a pair. Cage count
alone would miss these differences.

Distinguish intrinsic sum-only combinations from combinations feasible after
Sudoku restrictions, and both from cell-by-cell assignments. A cage can become
one-combination during play without having been one at the start.

## Proposed measurements

Keep three dimensions separate: required techniques, opening accessibility,
and arithmetic workload. Preserve raw measurements and their analysis version;
do not combine them into an unexplained “quality score” initially.

| Dimension | Proposed measurements | Interpretation limits |
| --- | --- | --- |
| Opening arithmetic | Intrinsic one-combination cages by size; fraction of cells they cover; total surviving combination counts | A digit set does not fix its cell positions |
| Opening usefulness | Feasible assignments at the blank starting position; mandatory digits confined to houses; distinct candidates removed by those facts | Count each elimination once; several cages can support the same fact |
| Opening distribution | Where informative cages lie; houses reached; concentration in a few boxes | A cluster can be a deliberate entry point, not automatically a flaw |
| Easy progress | Cells placed and candidates eliminated to a fixed point using Easy rules; then the same under Medium | These are solver-policy proxies, not predictions of human moves |
| Pacing | First deduction requiring the requested higher profile; progress before and after each such deduction; supported route to completion | One deterministic trace is not the only human solve path |
| Overhangs | Distinct initial one- and two-cell residual equations; actionable deductions and their dependencies | Deduplicate equivalent equations; retain the current repeat-digit safeguards |
| Workload | Assignment/combination filtering involved in useful deductions; longest stretch of eliminations before a placement or new relationship | Recomputed prerequisites must not inflate “grind”; small relationships can be valuable without placing a digit |
| Layout | Cage-size distribution, compactness, orientation, box crossings, label clarity, optional symmetry | A visually regular board can still have a poor solve |

For a comparable opening window, also report snapshots after 10 and 20
placements under a fixed, versioned policy. These are sampling windows, not
acceptance thresholds. Keep the fixed-point measurements alongside them so
trace ordering does not define the entire result.

The current hints retain textual prerequisites, sometimes recomputed for
successive placements. Do not treat that text as a reliable count of distinct
human discoveries. Richer dependency measurements would need structured facts
with stable identities and reasons; implement them only as part of a visible
explanation or review feature, not an isolated new rules layer.

## Delivery order after review

Each implementation commit must add or update an executable user story and
show its observable result. Deliver one usable story at a time on the PR.

### 1. Make feedback reproducible

**Story:** As a tester, I can open optional Puzzle details and copy a report
identifying the puzzle, its generator/rating versions, and my impression of its
opening and later difficulty.

Include a clean puzzle link or fingerprint plus the complete rules needed for
reproduction; a seed alone is insufficient across generator versions. Keep
ratings such as “opening too easy / comfortable / too hard” separate from
“later bottleneck” and “too much bookkeeping.” Allow brief optional notes and
record whether cage inspection or hints were used, without treating help as a
penalty. Copying a report must be explicit and local; no automatic telemetry or
messages to testers.

Acceptance: the copied reference opens the same cage rules on another device;
the report excludes a solution and includes no work unless explicitly selected.
Ordinary play remains uncluttered, and the feature works offline and on small
screens. Missing historical assistance data must be shown as unknown.

### 2. Expose an opening profile before changing generation

**Story:** As a tester or editor, I can inspect an optional opening profile and
see why a puzzle may have an easy start despite its Hard label.

Show concise, plain-language facts such as the number and coverage of
one-combination cages and the amount of progress the simpler profiles can make.
Provide expandable explanations rather than automatically marking all useful
cages on the solving board. Opening analysis may reveal strategy, so keep it
opt-in. It must not expose a solution or redefine Hard as “hard from move one.”

Acceptance: verify the examples above; distinguish digit sets from placements;
check eliminations independently; preserve the existing hints and inspector.
Include documented generated examples with different openings within one band.
These are review fixtures, never a production puzzle catalogue or fallback.

### 3. Trial a gentler generator bias

**Story:** As a tester, I can try an explicitly labelled experimental generation
profile and compare its openings with the current profile at the same requested
logical difficulty.

Compare the current fewest-combinations-first merge ordering with a weighted
choice that retains several restrictive entry points without repeatedly
preferring the most informative available merge. Evaluate the whole opening,
including cell coverage and useful house interactions, rather than imposing
only a maximum count of special cages.

Use a held-out seed sample and record both accepted puzzles and rejected or
timed-out attempts. The same seed under different algorithms does not produce
the same puzzle, so compare distributions and matched logical bands, not claim
an identical-puzzle experiment. Do not ship new numeric rejection thresholds
until the baseline and human reports support them.

Acceptance: generated puzzles remain procedural, connected, unique, free of
givens/singletons, visually balanced, and solvable at exactly the requested
profile. Check generation latency and failure rates on slower devices. Never
lower the requested band or fall back to fixed layouts to meet a time budget.

### 4. Calibrate the experience and decide whether labels need refinement

**Story:** As a solver, I can choose a difficulty whose description matches the
experience, with an optional explanation of its opening and hardest idea.

Review a batch across all three bands, with more than one solver where possible.
Separate perceived opening difficulty, hardest moment, effort, enjoyment, and
assistance use. Start with a manageable pilot; its size is a research choice,
not proof of statistical calibration. Keep some reviewed puzzles held out when
tuning thresholds to avoid learning only the examples that prompted a change.

Only then decide whether Hard needs a tighter acceptance range, a descriptive
opening tag, or no label change. Preserve historical ratings with their version;
new generator or rating behavior gets a new version and must not reinterpret
saved games. Imported puzzles may have an unknown editorial profile even when
their logical rating is known.

## Preserve and defer

Keep the current overhang frequency as the baseline: the tester explicitly
liked it. Measure its role before changing it. Preserve the inspector's
combination and equation assistance, cage highlighting, printing, sharing,
offline generation, and independent uniqueness checks.

Defer mandatory symmetry, additional difficulty bands, advanced technique
families, global aesthetic scores, and book-level publication claims. None is
needed to investigate the reported opening variation. Symmetry can later be
reviewed as one presentation preference alongside a readable, enjoyable solve.

## Proposed first decision

Approve or revise stories 1 and 2 first: reproducible feedback and an optional
opening profile. Use their evidence to design the experiment in story 3.
Do not change production acceptance thresholds or difficulty labels yet.
