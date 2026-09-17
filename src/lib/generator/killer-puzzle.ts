import { solveKillerLogically } from '$lib/domain/killer-analysis';
import corpus from './killer-corpus.json';
import { canonicalCages, solveKiller } from '$lib/domain/killer';
import { createPrng } from './prng';
import type { GenerationResult } from './generate-puzzle';

export function generateKillerPuzzle(seed: string): GenerationResult {
  const random = createPrng(seed);
  const base = corpus[random.integer(corpus.length)];
  const turns = random.integer(4), reflect = random.integer(2), complement = random.integer(2);
  function transform(cell: number): number {
    let r = Math.floor(cell / 9), c = cell % 9;
    if (reflect) c = 8 - c;
    for (let n = 0; n < turns; n++) [r, c] = [c, 8 - r];
    return r * 9 + c;
  }
  const cages = canonicalCages(base.cages.map((cage) => ({
    cells: cage.cells.map(transform), total: complement ? cage.cells.length * 10 - cage.total : cage.total
  })));
  const solution = Array<string>(81);
  [...base.solution].forEach((digit, cell) => { solution[transform(cell)] = String(complement ? 10 - Number(digit) : digit); });
  const givens = '.'.repeat(81);
  const checked = solveKiller(givens, cages);
  if (checked.count !== 1 || checked.solution !== solution.join('')) throw new Error('This Killer puzzle could not be validated.');
  const logical = solveKillerLogically(givens, cages);
  if (!logical.solved || logical.grid !== checked.solution) throw new Error('This Killer has no supported logical solve.');
  return {
    puzzle: {
      id: `killer-v1-${seed}`, variant: 'killer', killerRulesVersion: 1, cages,
      givens, solution: solution.join(''), difficulty: 'custom', seed,
      validatorVersion: 4, hardestTechnique: null,
      provenance: { kind: 'killer-generated', seed, generatorVersion: 1 }
    },
    attempts: 1, traceLength: logical.steps.length
  };
}
