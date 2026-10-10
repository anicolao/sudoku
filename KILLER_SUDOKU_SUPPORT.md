# Killer Sudoku support

Status: usable MVP implemented through the user stories below. Advanced
techniques and editorial automation remain proposed work.

## MVP delivered through the UI

- [Play, return, and discover](tests/e2e/027-killer-sudoku/README.md): construct
  fresh blank-givens puzzles, retain cages through the normal game lifecycle,
  inspect combinations, and request cage-aware logical guidance.
- [Choose a difficulty](tests/e2e/029-killer-generation/README.md): generate
  Easy, Medium, or Hard puzzles without one-cell cages or preset layouts.
- [Share and print](tests/e2e/028-killer-sharing-print/README.md): transfer rules
  and optional work, or print vector cages with locally derived walkthroughs.
- [Installed offline play](tests/e2e/012-installed-offline/README.md): generate
  and resume a Killer with working hints without a connection.

The generator constructs both solved grids and cage partitions procedurally.
Difficulty records the lowest supported logical profile that completes a puzzle;
these technique-based bands have not been calibrated against human solve times.
The following design also includes longer-term editorial and book goals.

## Purpose

Add traditional 9×9 Killer Sudoku as an optional puzzle family, with the same
calm, accessible, local-first experience as classic Sudoku. Its distinguishing
quality should be the interaction between positional and arithmetic reasoning:

> Classic Sudoku provides positional logic. Killer cages provide arithmetic
> and set logic. A good Killer keeps handing the solve between the two.

Difficulty should come from recognizing an idea, not clerical work. A valid,
unique puzzle is necessary; it is not sufficient for publication quality.

This deliberately revisits the variants non-goal in [VISION.md](VISION.md).
Implementation would update that boundary and the relevant contracts in
[ARCHITECTURE.md](ARCHITECTURE.md), [UX_DESIGN.md](UX_DESIGN.md), and
[PUZZLE_SHARING.md](PUZZLE_SHARING.md). This proposal does not supersede their
current descriptions of implemented behaviour.

## Rules and initial scope

The first supported ruleset would have these explicit requirements:

- Standard rows, columns, and 3×3 boxes each contain digits 1–9 exactly once.
- Cages partition all 81 cells: every cell belongs to exactly one cage.
- Each cage is orthogonally connected, contains 1–9 cells, and has a positive
  integer total equal to the sum of its cells.
- Digits cannot repeat anywhere within a cage, including cells that do not
  share a row, column, or box.
- A puzzle has exactly one solution under all of these constraints together.

Generated puzzles have no given digits and no one-cell cages. Checked imports
and existing saved games may contain either; they remain legal under the rules.

Partial cage coverage, repeating-digit cages, diagonal constraints, overlapping
cages, and other variants are outside this initial ruleset. Camera recognition
of cages and an interactive cage editor are separate projects. Existing classic
photo recognition must never claim to have imported Killer rules from digits
alone.

## What makes a puzzle worth solving

These are editorial preferences, not mathematical requirements or claims of a
universal standard.

| Quality | Proposed construction and review criterion |
| --- | --- |
| Intentional layout | Prefer legible shapes and a varied mixture of 2-, 3-, and 4-cell cages, with occasional larger cages. Review narrow tendrils and awkward labels. |
| Symmetry | Treat rotational or reflection symmetry as a presentation bonus; allow asymmetry when it improves the solve. |
| Approachable opening | Provide a discoverable combination, region total, or locked set without requiring a full board of pencil marks. An opening need not place a digit. |
| Useful relationships | Reward a small sum or restricted set that becomes useful later, not only immediate placements. |
| Recognition moments | Look for a concise deduction that unlocks several subsequent steps, with visible reasons for the breakthrough. |
| Interacting logic | Prefer meaningful dependencies between cage reasoning and ordinary Sudoku deductions. |
| Low arithmetic grind | Avoid long stretches of repeated combination enumeration that produce little progress. |

Crossing box boundaries can create useful relationships; crossing many
boundaries is not itself a quality score. Likewise, an extreme sum is a good
entry point, but a puzzle made almost entirely of forced combinations may have
little discovery left.

An illustrative progression is:

1. A restrictive cage establishes a pair.
2. The pair removes candidates in a box.
3. A region calculation establishes a two-cell total.
4. That relationship resolves a cage elsewhere through shared candidates.
5. Box-line reasoning becomes available.
6. A later multi-region calculation supplies the principal breakthrough.

This is a target experience, not a mandated sequence or a claim that a fixture
with this exact path already exists. Author and verify complete examples before
using them as lessons.

## Reuse ordinary Sudoku reasoning carefully

Singles, subsets, locked candidates, fish, wings, colouring, and chains remain
valid when their actual premises hold. Cage deductions create additional
candidate eliminations that can make these patterns visible. SudokuWiki's
[Killer solver](https://www.sudokuwiki.org/killersudoku.aspx) illustrates an
interleaved technique hierarchy.

Reuse the implemented techniques in
[src/lib/generator/logical-solver.ts](src/lib/generator/logical-solver.ts), rather
than interpreting this proposal as a promise to implement every classic
technique. ALS and other techniques absent from the existing solver remain
future work.

Two distinctions are essential:

- A cage is an all-different constraint, but it need not contain every digit.
  Do not run ordinary hidden-single or hidden-subset rules on a cage as though
  it were a nine-cell house. A digit must first be proved mandatory there.
- Uniqueness-based techniques require additional care. For example, the
  alternative completion used by a classic Unique Rectangle argument may
  violate cage sums. Disable that technique for Killer until its alternative
  assignments are proved to preserve every relevant constraint. Uniqueness of
  the complete Killer puzzle alone does not validate the classic argument.

Keep ordinary houses, cage peers, and proven candidate links distinct in the
solver API. Adding cage peers must not accidentally create new nine-digit
houses or unjustified strong links.

## Killer reasoning and proof obligations

### Combinations and cell assignments

Cache sets of distinct digits by cage size and sum. For example, two cells
summing to 4 require `{1,3}`, and three summing to 23 require `{6,8,9}`.

A combination is an unordered set; it is not a placement. Filter combinations
against the current cell candidates and placed values, checking that a complete
assignment to the cage cells is possible. Simple intersection with a digit
union is insufficient when several digits can occupy only the same cell.
Remove a candidate only when no surviving assignment supports it in that cell.

A two-cell 16 cage requires `{7,9}`. Those digits eliminate candidates elsewhere
in a row only if their possible positions are confined to that row. A cage
crossing rows does not automatically lock both digits in either row.

### Rule of 45, innies, and outies

Each ordinary house totals 45. A union of two disjoint boxes totals 90; three
disjoint rows total 135. Use complete cage totals and known values to derive
small residual sums, following the reasoning described in
[Innies and Outies](https://www.sudokuwiki.org/Innies_and_Outies).

For a region `R` consisting of `k` disjoint houses, and a disjoint collection
of complete cages whose union is `C` and total is `T`:

```text
sum(R \ C) - sum(C \ R) = 45k - T
```

If `C` is contained in `R`, this gives the total of the uncovered innies. If
`R` is contained in `C`, the outies total `T - 45k`. Otherwise it establishes a
difference, not an unconditional sum for either side.

For instance, cages wholly inside a box totalling 38 leave a single uncovered
cell equal to 7. Complete cages covering exactly two boxes plus one additional
cell and totalling 96 make that outside cell 6.

Do not add overlapping houses as though their union total were `45k`. A row
and a box share cells. Initially restrict region enumeration to disjoint
houses; any later generalization must track cell coefficients explicitly.

### Cage splitting and derived relationships

Represent derived relationships as equations over cells, with provenance.
Subtracting a proven part-total from a cage can establish its remaining total.
Deduplicate equivalent equations and bound the number and size of derived
regions so analysis remains predictable.

A derived region is not automatically an all-different cage. Two arbitrary
cells summing to 10 may be `{5,5}` unless a shared house, original cage, or
another proof excludes repetition. A subset of an original cage does inherit
that cage's no-repeat property. Carry those constraints explicitly.

Similarly, three cells totalling 14 do not uniquely imply `{2,3,9}`. That set
is forced only after other combinations and permitted repetitions have been
excluded by established constraints.

### Later reasoning

Parity, cage comparison, larger region equations, and combination-based ALS
reasoning can follow once the initial engine produces sound, readable traces.
Do not substitute unrestricted equation search for an explanation a person can
reasonably discover.

## Puzzle model and validation

Extend the puzzle definition with an explicit variant discriminator and
versioned Killer rules. The following is a conceptual shape, not a drop-in
replacement for the current TypeScript types:

```ts
type PuzzleRules =
  | { variant: 'classic' }
  | {
      variant: 'killer';
      killerRulesVersion: 1;
      cages: Array<{ cells: number[]; total: number }>;
    };
```

Cell indexes remain zero-based row-major values from 0 to 80. Normalize each
cage's cells into ascending order and sort cages by their first cell. A stable
index in this canonical list can identify a cage in explanations. Labels are
rendering decisions, not independent mutable cage facts.

Retain self-contained givens, solution, rating, and provenance alongside these
rules. Add versioned Killer generation, validation, and logical analysis
metadata without changing the meaning of existing classic version numbers.

Validation proceeds in bounded stages:

1. Check variant, versions, field types, integer bounds, and payload limits.
2. Check nonempty connected cages, cell uniqueness, and exact partition.
3. For a cage of size `n`, require its sum to lie between `n(n+1)/2` and
   `n(19-n)/2`; require all cage totals to sum to 405. These are necessary,
   not sufficient, checks.
4. Check given digits against houses, cage distinctness, and feasible cage
   totals and assignments.
5. Count solutions using all constraints, stopping after two. Require exactly
   one before acceptance; a resource limit means validation is incomplete,
   never that uniqueness was proved.
6. Derive the solution locally and run the separate human-style logical solver
   for rating and trace generation.

Never count solutions from the classic givens alone. A normal blank-givens
Killer derives its uniqueness from cages. Never trust a solution in an incoming
link. Stored solutions must satisfy the complete committed ruleset.

## Solvers, explanations, and difficulty

Keep exhaustive validation separate from human-style analysis. The exhaustive
solver may search; the logical solver must supply a proof for each step without
using the committed solution as an oracle.

Build a deterministic constraint state from placements, ordinary candidates,
cage assignments, and derived equations. Human notes remain a separate concept:
missing pencil marks are not proof that a digit is impossible. A walkthrough
must distinguish player annotations from logically established eliminations.

A logical step should identify:

- its technique, premises, and dependencies on earlier steps;
- participating cells, cages, and houses;
- its result: placement, candidate elimination, combination restriction, or
  equation;
- a concise explanation and any relevant arithmetic;
- its cognitive cost and combination workload measurements.

The current walkthrough and hint APIs in
[src/lib/domain/walkthrough.ts](src/lib/domain/walkthrough.ts) are oriented
around placements. Killer requires useful steps with no immediate digit.
Introduce a richer analysis result before adapting those views. Keep existing
recorded `hint/revealed` events meaningful; any persisted non-placement hint
needs a new event contract rather than a pretend digit reveal.

Order available deductions by explanatory simplicity, using deterministic tie
breaks. After a cage deduction, reconsider simple classic deductions, and vice
versa. Do not manufacture alternation when a direct, simpler move is available.
A stalled supported solver should report the limit, not disguise backtracking
as a human technique.

Rate Killer independently from classic difficulty. Familiar level names may be
reused, but their Killer technique limits need calibration against reviewed
puzzles and human solves. Record both the hardest supported idea and the total
workload; clue count and cage count are not difficulty ratings.

## Generation and editorial evaluation

Generator version 3 uses no stored Killer grids, cage layouts, or template
transformations. Every attempt:

1. Constructs a solved grid from an empty board with randomized backtracking.
2. Builds a connected cage partition by randomized adjacent pairing and
   absorbing unmatched cells, then merges adjacent cages only while the requested
   logical profile can still solve. Merges fit within a 3×3 bounding rectangle
   with at most two unused rectangle cells, avoiding long or sprawling shapes.
   Cages contain two to five cells and never repeat a solution digit.
3. Rejects pair-dominated layouts: at most 45% of cages may have two cells;
   at least three cages must have three cells and at least three must have four
   or five. These are project editorial thresholds, not a universal standard.
4. Runs deterministic logical analysis and rejects candidates outside the
   requested band, including puzzles solvable under a simpler profile.
5. Independently proves uniqueness with the exhaustive Killer validator and
   verifies that its solution matches the constructed grid.
6. Saves the complete definition, seed, generator version, and rating version.

The three cumulative logical profiles are:

| Band | Additional supported reasoning |
| --- | --- |
| Easy | Exact cage assignments, naked and hidden singles, single-cell Rule of 45 residuals |
| Medium | Naked pairs, ordinary locked candidates, and mandatory cage-digit locks |
| Hard | Two-cell Rule of 45 residuals feeding candidate eliminations |

A derived two-cell sum is not assumed to contain distinct digits unless the
cells share a house or original cage. Hints expose the elimination prerequisites
through a paginated reasoning viewer before the resulting placement.

Generation is cancellable, limited to 500 attempts and a 30-second worker
budget, and reports failure with a retry action. There is no preset fallback.
Persisted puzzles replay their stored cages and solution without regeneration.
Legacy generator-version-1 and -2 games remain readable without retaining old layouts.

The metrics below are future editorial evaluation, not implemented acceptance
criteria. Current generation guarantees validity, uniqueness, no singletons, a varied
cage-size mix, and completion within the requested logical profile; it does not claim
hand-crafted layout quality or publication readiness.

### Measure arithmetic grind explicitly

Start with inspectable measurements rather than an opaque quality score:

| Measurement | Intended interpretation |
| --- | --- |
| Opening cost | Work before the first useful restricted set, equation, elimination, or placement |
| Combination burden | Surviving combination counts in cages actually involved in a deduction, distinct from positional assignment counts |
| Unproductive pruning | Consecutive combination-filtering steps before a useful downstream effect |
| Active relationships | Small derived equations the intended path requires the solver to retain simultaneously |
| Arithmetic complexity | Region size, number of totals combined, and residual cell count |
| Cross-family dependencies | Cage-to-classic and classic-to-cage proof dependencies, not merely alternating step labels |
| Breakthrough impact | Simpler deductions unlocked by a compact, more demanding idea |
| Layout quality | Cage size distribution, connectivity shape, label legibility, and optional symmetry |

For a reproducible initial grind proxy, record the sum of
`log2(1 + surviving combinations)` over cages inspected at each arithmetic
step, together with the longest unproductive-pruning run. This measures one
solver policy's workload, not objective human difficulty. Preserve raw metrics
and policy version; tune thresholds using reviewed examples rather than
inventing numerical publication cutoffs now.

Do not reward artificially verbose traces or punish a large cage that resolves
through one clean relationship. Human review must confirm that the intended
path is visible and satisfying. Automated acceptance cannot guarantee an
“Oh!” moment or that every solver follows the same path.

## Play, notes, and accessibility

Offer Classic and Killer as explicit puzzle choices, with Classic remaining
the default. Explain Killer's sum and no-repeat rules before its first game.
History, sharing, printouts, and walkthroughs should name the variant.

Draw cage boundaries and top-left sum labels distinctly from box borders,
values, candidates, focus, and existing Stripes. Use a vector layer shared in
geometry with printing. Reserve enough space for labels instead of reducing
pencil marks below readable sizes. Cage identity must not depend on colour.

Selecting a cell should make its cage easy to inspect. An accessible description
should include the cage total, cell count, and relevant conflict information.
An optional cage inspector can show remaining sum and feasible combinations on
request; do not force combination tables or automatic notes into ordinary play.
Virtual equations belong in explanation overlays, visually distinct from the
printed rules.

Basic conflicts include duplicate cage digits, exceeded totals, wrong completed
totals, and an impossible remaining cage assignment under rule-based candidates.
Keep these separate from optional solution-based mistake checking. Do not flag
a legal board as contradictory merely because the player's notes are sparse.

Automatic peer-note removal may include cage peers for new Killer games when
enabled. Arithmetic pruning should be an explicit assistance choice. Undo,
redo, targeted erase, restart, and reload must reconstruct every affected note
using the committed rules and versioned behaviour.

## Persistence, sharing, printing, and offline operation

Interpret existing puzzle definitions without a variant as classic through an
explicit compatible reader. Never infer Killer from a blank grid or incidental
fields. Add readers before writers, reject unsupported versions clearly, and
preserve old classic replay results. If changed event semantics require new
schema or reducer versions, introduce them explicitly.

Cages are immutable puzzle-origin data. Selection, cage inspection, and
explanation overlays are ephemeral. Do not add another canonical mutable board.
Derived solver caches can be discarded and reconstructed; historical replay
must not invoke generation or a changing logical rating policy.

A new sharing format must carry the variant, rules version, canonical cage
partition, totals, and givens, plus optional work. Include the same fields in
puzzle fingerprints. Validate cages and uniqueness in a worker before import.
Keep existing classic link formats intact and reject unknown formats rather
than silently opening them as classic grids.

Never serialize a solution into puzzle or work links. Define whether a complete
walkthrough shares replayable actions or asks the receiver to derive its trace;
either route must retain the cage rules and validate every claimed deduction.
Measure worst-case URL and QR sizes before committing to an encoding.

Extend the existing two-page print surface with readable cage geometry on both
puzzle and solution pages. Both QR handoffs must identify the full Killer
puzzle. Verify dense layouts and sum labels on Letter pages and in monochrome.

Generation, validation, hints, and rendering remain on-device, with cancellable
worker work where needed. No server, account, recurring service cost, telemetry,
or new remote puzzle source is required. Bundle all needed assets for installed
offline use. Existing memory-only fallback and clear-all behaviour apply.
Readable shared URLs still expose their included puzzle/work data to the static
host and browser history, as documented for classic sharing.

## Discovery-style books

The Start Here and Candidates Done ideas supplied for this proposal suggest two
editorial views of the same proven solve path:

- **Start Here:** highlight a discoverable opening and explain why its
  relationship is useful, without immediately filling the entire grid.
- **Candidates Done:** provide a reproducible candidate checkpoint with the
  preceding arithmetic and positional deductions stated. Specify which cage
  constraints were applied; a candidate grid alone can hide the lesson.

Preserve intermediate equations and combination restrictions so a later payoff
can refer back to its original discovery. Select puzzles by teaching objective
and reviewed dependencies, not merely by a final difficulty label. Full book
assembly is outside the current app and outside this proposal's first delivery.

## Delivery through user stories

Deliver tracer bullets: every implementation commit must add or update a user
story describing observable UI behaviour and its acceptance evidence. Each
increment includes the rules, data, UI, and tests needed for that story. Never
land a standalone rules, storage, or solver layer awaiting a later UI.

| Commit / user story | User-visible result | End-to-end evidence |
| --- | --- | --- |
| Play and return | As a solver, I can choose Killer, read its rules, start a checked blank-givens puzzle, see cage sums, place digits and notes, see cage conflicts, undo, and resume after reload. | Procedural construction, uniqueness validation, accessible cage rendering, persisted rules, history identity, completion and classic compatibility. |
| Discover a deduction | As a solver, I can inspect a selected cage's remaining total and combinations, then request an explained next step without guessing or relying on my notes. | Cage assignments and positional reasoning exposed through inspection and hints, useful non-placement relationships, recorded placement explanations, deterministic complete logical solves of generated puzzles. |
| Choose a difficulty | As a solver, I can generate a fresh Easy, Medium, or Hard Killer without givens or singleton cages, cancel construction, and see its level in play and History. | Empty-grid construction, randomized connected partitions, exact band acceptance, independent uniqueness checks, bounded worker and retry UI, and responsive story 029. |
| Take it with me | As a solver, I can share a clean Killer or my work, open it on another device, and print cage-preserving puzzle/solution sheets with working QR handoffs. | Versioned cage-aware links and validation, fingerprints, work and walkthrough replay, print geometry, responsive/accessibility and offline checks. |

Layout and selection follow-up: as a solver, I see a varied mixture of cages
rather than a board dominated by pairs, and selecting a cell emphasizes its
whole cage with a pale blue fill and thicker blue dashed outline. Mouse and
keyboard selection move that emphasis; the cell focus and conflict markers
remain distinct. Print rendering has no selection emphasis. Stories 027 and
029 demonstrate the UI; generated samples verify the size thresholds, logical
rating, and independent uniqueness together.

Rendering follow-up: as a solver, I can follow a cage through rounded inside
corners and read each smaller, regular-weight sum centered horizontally and
vertically in a transparent break in its top border. The
selected cell and cage backgrounds remain visible behind sums. Screen and print
share continuous inset outlines; short solid corner arcs keep the dashed stroke
from omitting a turn. Geometry checks cover concave shapes, holes, diagonal
contacts, and board edges. Story 027 demonstrates the rendering across six
viewports; story 028 verifies the same geometry on puzzle and solution sheets.

The “Choose a difficulty” story also promises reproducible construction: the
same seed and difficulty produce the same puzzle, with no singleton cages.
Its unit acceptance evidence covers eight seeds independently, generating each
twice with a per-case 60-second test budget (two 30-second worker budgets). This avoids imposing one default
five-second timeout on sixteen constructions on slower CI runners. This test
maintenance does not change the UI or the production worker timeout. The
independent uniqueness proofs for generated fixtures also run as separate
30-second test cases, retaining the validator’s deterministic search-node cap.

These commits stay on one PR and each leaves its advertised story usable. The
first commit may explicitly withhold share/print and advanced hint controls until
their corresponding feature is delivered; it must never silently treat a Killer
as classic. Update the story and evidence in the same commit as every UI change.

The usable MVP is the complete set of these stories, including procedural
generation at three logical difficulties. Book assembly, advanced Killer
techniques, human-calibrated difficulty, and automated editorial selection
remain subsequent user stories.

Critical solver regressions must cover cages crossing houses, impossible
cell assignments despite plausible digit unions, repeated digits in derived
regions, overlapping region arithmetic, unjustified cage locks, and classic
uniqueness patterns invalidated by cages. Check eliminations against independent
exhaustive completion searches on bounded fixtures.

Compatibility evidence must cover classic streams and links, Killer
save/reload, undo/redo/erase/restart, multiple tabs, memory-only operation,
corrupt inputs, and deterministic generation. Browser evidence must include
small screens, zoom, screen-reader names, keyboard operation, monochrome print,
privacy instrumentation, and installed offline use.

The MVP bounds exact validation at 50,000 search nodes and incoming worker
validation at ten seconds, retains the decoded 4,096-character share limit, and
enumerates only single-house residual regions of at most two empty cells.
Solved-grid construction has a 100,000-node cap per attempt. Generation has
the attempt and worker budgets above. Difficulty and editorial thresholds
still require human calibration.

Keyboard follow-up story: as a keyboard solver, I can enter and leave the
introduction and cage inspector without focus escaping behind the dialog. This
is covered in the same play-and-discovery acceptance scenario.

## References and boundaries of the evidence

Andrew Stuart's [construction notes](https://www.sudokuwiki.org/Sudoku_Creation_and_Grading.pdf)
explicitly reject cage grids with too many pairs and distinguish cage-based
reasoning from ordinary Sudoku reasoning. This supports treating cage balance
as a separate quality criterion; our numerical thresholds are our own choice.


- [SudokuWiki Killer solver](https://www.sudokuwiki.org/killersudoku.aspx): an
  example of interleaved classic and Killer techniques, including cage splitting.
- [SudokuWiki Killer Cage Convention](https://www.sudokuwiki.org/The_Killer_Cage_Convention):
  background on cage conventions; the exact supported rules are specified above.
- [SudokuWiki Innies and Outies](https://www.sudokuwiki.org/Innies_and_Outies):
  region-total reasoning and boundary deductions.

These references inform terminology and technique scope. The editorial metrics,
architecture, delivery order, and book applications are proposals for this
project. They are not external standards or validated predictors of enjoyment.

## Export feedback for analysis

[Export all history for analysis](tests/e2e/030-history-export/README.md) adds
History → Export entire history → Download JSON. The file includes all retained
attempts, full cage rules and solutions, and the recorded event stream, including
undo/redo, timing and settings. It is a deliberate local download that the tester
sends manually. The story checks disclosure, keyboard focus, responsive layouts,
offline download, memory-only/empty history, retry, and preservation of events.
The format is documented in [ARCHITECTURE.md](ARCHITECTURE.md#entire-history-analysis-export).
