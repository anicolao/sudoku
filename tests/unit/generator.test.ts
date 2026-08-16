import { describe, expect, it } from 'vitest';
import { isSolvedGrid, parseGrid } from '../../src/lib/domain/sudoku';
import { generateEasyPuzzle, validatePuzzle } from '../../src/lib/generator/generate-puzzle';
import { solveLogically } from '../../src/lib/generator/logical-solver';
import { countSolutions } from '../../src/lib/generator/solve';

describe('Easy puzzle generator', () => {
  it.each(['walkthrough-seed', 'quiet-morning', 'paper-and-pencil']) (
    'deterministically generates a valid unique logical puzzle from %s',
    (seed) => {
      const first = generateEasyPuzzle(seed);
      const second = generateEasyPuzzle(seed);
      expect(second).toEqual(first);
      expect(isSolvedGrid(parseGrid(first.puzzle.solution))).toBe(true);
      expect(countSolutions(first.puzzle.givens)).toBe(1);
      expect(solveLogically(first.puzzle.givens)).toMatchObject({
        solved: true,
        grid: first.puzzle.solution
      });
      expect(validatePuzzle(first.puzzle)).toBe(true);
      expect(first.puzzle.givens.replaceAll('.', '')).toHaveLength(40);
    }
  );
});
