import { UNITS, givensAgree, isSolvedGrid, parseGrid } from '$lib/domain/sudoku';
import type { PuzzleDefinition, PuzzleRating } from '$lib/domain/types';
import { solveLogically } from '$lib/generator/logical-solver';
import { countSolutions, solveFirst } from '$lib/generator/solve';

export type SharedPuzzleErrorCode =
  | 'format'
  | 'clue-count'
  | 'duplicate-givens'
  | 'no-solution'
  | 'multiple-solutions';

export class SharedPuzzleError extends Error {
  constructor(readonly code: SharedPuzzleErrorCode, message: string) {
    super(message);
    this.name = 'SharedPuzzleError';
  }
}

export interface SharedPuzzleValidation {
  puzzle: PuzzleDefinition;
  clueCount: number;
  fingerprint: string;
}

function assertStructure(givens: string): number[] {
  if (!/^[1-9.]{81}$/.test(givens)) {
    throw new SharedPuzzleError('format', 'A shared puzzle must contain exactly 81 digits or dots.');
  }
  const grid = parseGrid(givens);
  const clueCount = grid.filter(Boolean).length;
  if (clueCount < 17 || clueCount > 80) {
    throw new SharedPuzzleError('clue-count', 'A playable shared puzzle must contain 17 to 80 givens.');
  }
  if (UNITS.some((unit) => {
    const values = unit.map((cell) => grid[cell]).filter(Boolean);
    return values.length !== new Set(values).size;
  })) {
    throw new SharedPuzzleError('duplicate-givens', 'The shared givens contain a row, column, or box duplicate.');
  }
  return grid;
}

async function fingerprint(givens: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(givens));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export async function validateSharedPuzzle(givens: string): Promise<SharedPuzzleValidation> {
  const grid = assertStructure(givens);
  const solutionCount = countSolutions(givens);
  if (solutionCount === 0) throw new SharedPuzzleError('no-solution', 'The shared puzzle has no solution.');
  if (solutionCount !== 1) {
    throw new SharedPuzzleError('multiple-solutions', 'The shared puzzle does not have one unique solution.');
  }
  const solution = solveFirst(givens);
  if (!solution || !isSolvedGrid(parseGrid(solution)) || !givensAgree(givens, solution)) {
    throw new SharedPuzzleError('no-solution', 'The shared puzzle has no valid solution.');
  }
  const logical = solveLogically(givens, { maxDifficulty: 'master' });
  const difficulty: PuzzleRating = logical.solved && logical.grid === solution
    ? logical.difficulty
    : 'custom';
  const digest = await fingerprint(givens);
  const clueCount = grid.filter(Boolean).length;
  return {
    clueCount,
    fingerprint: digest,
    puzzle: {
      id: `shared-${digest.slice(0, 12)}`,
      givens,
      solution,
      difficulty,
      validatorVersion: 3,
      hardestTechnique: difficulty === 'custom' ? null : logical.hardestTechnique,
      provenance: { kind: 'puzzle-link', formatVersion: 1, fingerprint: digest }
    }
  };
}

export function puzzleUrl(base: string | URL, givens: string): string {
  assertStructure(givens);
  const url = new URL(base);
  url.search = '';
  url.hash = '';
  url.searchParams.set('p', givens);
  return url.toString();
}
