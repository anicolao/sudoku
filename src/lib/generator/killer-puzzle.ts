import { rateKiller, type KillerDifficulty } from '$lib/domain/killer-analysis';
import { canonicalCages, solveKiller } from '$lib/domain/killer';
import { createPrng } from './prng';
import { constructCages, constructSolution } from './killer-construction';
import type { GenerationResult } from './generate-puzzle';

/** Version 2 constructs every grid and partition from the seed, without bases. */
export function generateKillerPuzzle(seed: string, difficulty: KillerDifficulty = 'easy', maxAttempts = 500): GenerationResult {
  if (!['easy', 'medium', 'hard'].includes(difficulty)) throw new Error('Choose Easy, Medium or Hard Killer.');
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 500) throw new Error('Killer generation requires an attempt budget between 1 and 500.');
  const random = createPrng(`killer-v2:${difficulty}:${seed}`);
  const givens = '.'.repeat(81);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const solution = constructSolution(random);
    const partition = constructCages(solution, random, random.integer(difficulty === 'easy' ? 3 : 7));
    if (!partition) continue;
    const cages = canonicalCages(partition);
    if (cages.some((cage) => cage.cells.length < 2)) continue;
    const rating = rateKiller(givens, cages);
    if (!rating || rating.difficulty !== difficulty) continue;
    // Independent exhaustive validation, never a guessed step in the rating.
    const checked = solveKiller(givens, cages);
    if (checked.count !== 1 || checked.solution !== solution.join('')) continue;
    return {
      puzzle: {
        id: `killer-v2-${difficulty}-${seed}`, variant: 'killer', killerRulesVersion: 1, cages,
        givens, solution: solution.join(''), difficulty: 'custom', killerDifficulty: difficulty,
        killerRatingVersion: 1, seed, validatorVersion: 4, hardestTechnique: null,
        provenance: { kind: 'killer-generated', seed, generatorVersion: 2 }
      },
      attempts: attempt, traceLength: rating.steps.length
    };
  }
  throw new Error(`Could not construct a ${difficulty} Killer within ${maxAttempts} attempts. Try again with a new seed.`);
}
