import { expect, test } from 'vitest';
import { generateKillerPuzzle } from '../../src/lib/generator/killer-puzzle';
import { KILLER_DIFFICULTIES, rateKiller, solveKillerLogically } from '../../src/lib/domain/killer-analysis';
import { canonicalCages, solveKiller, validPuzzleRules } from '../../src/lib/domain/killer';
import { EventStore, MemoryStorage } from '../../src/lib/storage/event-store';
import { createPrng } from '../../src/lib/generator/prng';
import { constructCages, constructSolution } from '../../src/lib/generator/killer-construction';
import { isSolvedGrid } from '../../src/lib/domain/sudoku';

test.each(KILLER_DIFFICULTIES)('%s has the requested logical difficulty, not merely larger cages', (difficulty) => {
  for (const seed of ['walkthrough-seed', 'a', 'b']) {
    const { puzzle, attempts } = generateKillerPuzzle(seed, difficulty);
    expect(attempts).toBeLessThanOrEqual(500);
    expect(puzzle.killerDifficulty).toBe(difficulty);
    expect(puzzle.givens).toBe('.'.repeat(81));
    expect(puzzle.cages!.every((cage) => cage.cells.length >= 2)).toBe(true);
    expect(puzzle.cages).toEqual(canonicalCages(puzzle.cages));
    expect(validPuzzleRules(puzzle)).toBe(true);
    expect(solveKiller(puzzle.givens, puzzle.cages!)).toEqual({ count: 1, solution: puzzle.solution });
    expect(rateKiller(puzzle.givens, puzzle.cages!)?.difficulty).toBe(difficulty);
    const simpler = difficulty === 'hard' ? 'medium' : difficulty === 'medium' ? 'easy' : null;
    if (simpler) expect(solveKillerLogically(puzzle.givens, puzzle.cages!, simpler).solved).toBe(false);
  }
}, 30_000);

test('construction creates distinct solutions and partitions from an empty grid', () => {
  const solutions = new Set<string>(), layouts = new Set<string>();
  for (let n=0; n<12; n++) {
    const random = createPrng(`diversity-${n}`);
    const solution = constructSolution(random);
    expect(isSolvedGrid(solution)).toBe(true);
    // Canonical digit renaming rules out merely relabelling one stored solution.
    const labels = new Map<number, number>();
    const normalized = solution.map((d) => { if (!labels.has(d)) labels.set(d, labels.size + 1); return labels.get(d); }).join('');
    solutions.add(normalized);
    const cages = constructCages(solution, random, 2);
    if (cages) layouts.add(JSON.stringify(canonicalCages(cages).map((c) => c.cells)));
  }
  expect(solutions.size).toBe(12);
  expect(layouts.size).toBeGreaterThanOrEqual(10);
});

test('construction is bounded and reports failure without a fallback pattern', () => {
  expect(() => generateKillerPuzzle('a', 'hard', 1)).toThrow(/within 1 attempts/);
  expect(() => generateKillerPuzzle('a', 'easy', 0)).toThrow(/budget/);
  expect(() => generateKillerPuzzle('a', 'easy', 501)).toThrow(/budget/);
});

test('old stored Killer puzzles with one-cell cages still replay', () => {
  const { puzzle } = generateKillerPuzzle('legacy');
  const cage = puzzle.cages![0];
  const legacy = { ...puzzle, killerDifficulty: undefined, killerRatingVersion: undefined,
    cages: canonicalCages([...puzzle.cages!.slice(1), ...cage.cells.map((cell) => ({ cells:[cell], total:Number(puzzle.solution[cell]) }))]),
    provenance: { kind:'killer-generated' as const, generatorVersion:1 as const, seed:'legacy' }
  };
  const store = new EventStore(new MemoryStorage());
  const projection = store.startGame(legacy, { id:'legacy', occurredAt:new Date('2026-01-01') });
  const replayed = new EventStore(new MemoryStorage(), store.getDocument()).getProjection();
  expect(replayed.diagnostics).toEqual([]);
  expect(replayed.games[projection.activeGameId!].puzzle.cages).toEqual(legacy.cages);
});
