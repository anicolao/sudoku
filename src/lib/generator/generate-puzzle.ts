import { isSolvedGrid, parseGrid, serializeGrid } from '$lib/domain/sudoku';
import type { PuzzleDefinition } from '$lib/domain/types';
import { solveLogically } from './logical-solver';
import { createPrng } from './prng';
import { countSolutions } from './solve';

export interface GenerationResult {
  puzzle: PuzzleDefinition;
  traceLength: number;
  attempts: number;
}

function createSolution(seed: string): string {
  const random = createPrng(seed);
  const digits = random.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const bands = random.shuffle([0, 1, 2]);
  const stacks = random.shuffle([0, 1, 2]);
  const rows = bands.flatMap((band) => random.shuffle([0, 1, 2]).map((row) => band * 3 + row));
  const columns = stacks.flatMap((stack) =>
    random.shuffle([0, 1, 2]).map((column) => stack * 3 + column)
  );
  const valueAt = (row: number, column: number): number =>
    digits[(row * 3 + Math.floor(row / 3) + column) % 9];
  return rows.flatMap((row) => columns.map((column) => valueAt(row, column))).join('');
}

function puzzleId(seed: string): string {
  let hash = 0x811c9dc5;
  for (const character of seed) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return `easy-v1-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function validatePuzzle(puzzle: PuzzleDefinition): boolean {
  if (!isSolvedGrid(parseGrid(puzzle.solution))) return false;
  if ([...puzzle.givens].some((value, cell) => value !== '.' && value !== puzzle.solution[cell])) {
    return false;
  }
  if (countSolutions(puzzle.givens) !== 1) return false;
  const logical = solveLogically(puzzle.givens);
  return logical.solved && logical.grid === puzzle.solution;
}

export function generateEasyPuzzle(seed: string, maxAttempts = 8): GenerationResult {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const attemptSeed = `${seed}:${attempt}`;
    const solution = createSolution(attemptSeed);
    const grid = parseGrid(solution);
    const removalOrder = createPrng(`${attemptSeed}:remove`).shuffle(
      Array.from({ length: 81 }, (_, cell) => cell)
    );

    for (const cell of removalOrder) {
      if (grid.filter(Boolean).length <= 40) break;
      const previous = grid[cell];
      grid[cell] = 0;
      const givens = serializeGrid(grid);
      const logical = solveLogically(givens);
      if (countSolutions(givens) !== 1 || !logical.solved || logical.grid !== solution) {
        grid[cell] = previous;
      }
    }

    if (grid.filter(Boolean).length > 44) continue;
    const givens = serializeGrid(grid);
    const logical = solveLogically(givens);
    const puzzle: PuzzleDefinition = {
      id: puzzleId(attemptSeed),
      givens,
      solution,
      difficulty: 'easy',
      seed,
      generatorVersion: 1,
      validatorVersion: 1,
      hardestTechnique: logical.hardestTechnique
    };
    if (validatePuzzle(puzzle)) return { puzzle, traceLength: logical.steps.length, attempts: attempt + 1 };
  }
  throw new Error('Could not generate a puzzle yet');
}
