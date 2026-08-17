import { describe, expect, it } from 'vitest';
import { isSolvedGrid, parseGrid } from '../../src/lib/domain/sudoku';
import { DIFFICULTY_BY_ID, DIFFICULTY_LEVELS, TECHNIQUE_DIFFICULTY } from '../../src/lib/domain/difficulty';
import type { PuzzleDifficulty } from '../../src/lib/domain/types';
import { generateEasyPuzzle, generatePuzzle, validatePuzzle } from '../../src/lib/generator/generate-puzzle';
import { solveLogically } from '../../src/lib/generator/logical-solver';
import { countSolutions } from '../../src/lib/generator/solve';

describe('Foundations compatibility entry point', () => {
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

describe('chapter-matched puzzle levels', () => {
  it.each<PuzzleDifficulty>(['foundations', 'intermediate', 'advanced', 'expert', 'master'])(
    'generates a unique %s puzzle rated by its logical solve path',
    (difficulty) => {
      const generated = generatePuzzle(difficulty, 'level-corpus');
      const repeated = generatePuzzle(difficulty, 'level-corpus');
      const alternative = generatePuzzle(difficulty, 'alternate-corpus');
      const logical = solveLogically(generated.puzzle.givens, { maxDifficulty: difficulty });
      const clueCount = generated.puzzle.givens.replaceAll('.', '').length;

      expect(generated.puzzle.difficulty).toBe(difficulty);
      expect(repeated).toEqual(generated);
      expect(alternative.puzzle.givens).not.toBe(generated.puzzle.givens);
      expect(logical).toMatchObject({ solved: true, difficulty, grid: generated.puzzle.solution });
      expect(clueCount).toBeGreaterThanOrEqual(DIFFICULTY_BY_ID[difficulty].clueRange[0]);
      expect(clueCount).toBeLessThanOrEqual(DIFFICULTY_BY_ID[difficulty].clueRange[1]);
      expect(validatePuzzle(generated.puzzle)).toBe(true);
      const index = DIFFICULTY_LEVELS.findIndex((level) => level.id === difficulty);
      if (index > 0 && difficulty !== 'master') {
        expect(solveLogically(generated.puzzle.givens, {
          maxDifficulty: DIFFICULTY_LEVELS[index - 1].id
        }).solved).toBe(false);
      }
      if (difficulty === 'master') {
        expect(logical.steps.filter((step) => TECHNIQUE_DIFFICULTY[step.technique] === 'expert').length).toBeGreaterThanOrEqual(3);
      }
    }
  );
});
