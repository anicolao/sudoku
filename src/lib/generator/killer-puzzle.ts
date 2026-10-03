import { solveKillerLogically, rateKiller, type KillerDifficulty } from '$lib/domain/killer-analysis';
import { adjacent, cagePossibilities, canonicalCages, solveKiller } from '$lib/domain/killer';
import { createPrng } from './prng';
import { constructCages, constructSolution } from './killer-construction';
import type { GenerationResult } from './generate-puzzle';

/** Version 3 constructs every grid and partition from the seed, without bases. */
export function generateKillerPuzzle(seed: string, difficulty: KillerDifficulty = 'easy', maxAttempts = 500): GenerationResult {
  if (!['easy', 'medium', 'hard'].includes(difficulty)) throw new Error('Choose Easy, Medium or Hard Killer.');
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 500) throw new Error('Killer generation requires an attempt budget between 1 and 500.');
  const random = createPrng(`killer-v3:${difficulty}:${seed}`);
  const givens = '.'.repeat(81);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const solution = constructSolution(random);
    const partition = constructCages(solution, random, 0);
    if (!partition) continue;
    let cages = canonicalCages(partition);
    if (cages.filter((cage) => cage.cells.length === 3).length < 3) continue;
    if (!solveKillerLogically(givens, cages, difficulty).solved) continue;
    // Remove cage boundaries only when the requested human logic can still solve.
    // Prefer compact shapes; never trade away logic merely to hit a size quota.
    for (;;) {
      if (balancedLayout(cages)) break;
      const candidates = cages.flatMap((left, i) => cages.slice(i + 1).flatMap((right) => {
        if ((left.cells.length === 3 || right.cells.length === 3) &&
          cages.filter((cage) => cage.cells.length === 3).length <= 3) return [];
        const cells = [...left.cells, ...right.cells];
        if (cells.length > 5 || !left.cells.some((a) => right.cells.some((b) => adjacent(a, b))) ||
          new Set(cells.map((cell) => solution[cell])).size !== cells.length) return [];
        const rows = cells.map((c) => Math.floor(c / 9)), cols = cells.map((c) => c % 9);
        const height = Math.max(...rows) - Math.min(...rows) + 1, width = Math.max(...cols) - Math.min(...cols) + 1;
        if (height > 3 || width > 3 || height * width - cells.length > 2) return [];
        return [{ left, right, merged: { cells, total: left.total + right.total } }];
      }));
      let improved = false;
      const ordered = random.shuffle(candidates).map((candidate) => ({
        ...candidate,
        combinations: cagePossibilities(Array(81).fill(0), candidate.merged).combinations.length
      })).sort((a, b) => a.combinations - b.combinations);
      for (const {left, right, merged} of ordered) {
        const proposed = canonicalCages([...cages.filter((c) => c !== left && c !== right), merged]);
        if (!solveKillerLogically(givens, proposed, difficulty).solved) continue;
        cages = proposed; improved = true; break;
      }
      if (!improved) break;
    }
    if (!balancedLayout(cages)) continue;
    const rating = rateKiller(givens, cages);
    if (!rating || rating.difficulty !== difficulty) continue;
    // Independent exhaustive validation, never a guessed step in the rating.
    const checked = solveKiller(givens, cages);
    if (checked.count !== 1 || checked.solution !== solution.join('')) continue;
    return {
      puzzle: {
        id: `killer-v3-${difficulty}-${seed}`, variant: 'killer', killerRulesVersion: 1, cages,
        givens, solution: solution.join(''), difficulty: 'custom', killerDifficulty: difficulty,
        killerRatingVersion: 1, seed, validatorVersion: 4, hardestTechnique: null,
        provenance: { kind: 'killer-generated', seed, generatorVersion: 3 }
      },
      attempts: attempt, traceLength: rating.steps.length
    };
  }
  throw new Error(`Could not construct a ${difficulty} Killer within ${maxAttempts} attempts. Try again with a new seed.`);
}

/** Editorial floor, separate from the logical difficulty rating. */
export function balancedLayout(cages: readonly { cells: readonly number[] }[]): boolean {
  const counts = (size: number) => cages.filter((cage) => cage.cells.length === size).length;
  return counts(2) / cages.length <= 0.45 && counts(3) >= 3 && counts(4) + counts(5) >= 3;
}
