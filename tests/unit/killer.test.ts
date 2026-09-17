import { nextKillerPlacement, solveKillerLogically, killerRelationships } from '../../src/lib/domain/killer-analysis';
import { buildHumanSolveSequence } from '../../src/lib/domain/walkthrough';
import { describe, expect, test } from 'vitest';
import { canonicalCages, cagePossibilities, solveKiller, validPuzzleRules } from '../../src/lib/domain/killer';
import { generateKillerPuzzle } from '../../src/lib/generator/killer-puzzle';
import { EventStore, MemoryStorage } from '../../src/lib/storage/event-store';
import corpus from '../../src/lib/generator/killer-corpus.json';

describe('Killer rules visible in play', () => {
  test('each collection entry is unique with no given digits', () => {
    for (const entry of corpus) expect(solveKiller('.'.repeat(81), canonicalCages(entry.cages))).toEqual({ count: 1, solution: entry.solution });
  });
  test('seeded transformations preserve connected cages and the unique solution', () => {
    for (const seed of ['a','b','c','d','e','f','g','h']) {
      const result = generateKillerPuzzle(seed);
      expect(validPuzzleRules(result.puzzle)).toBe(true);
      expect(generateKillerPuzzle(seed)).toEqual(result);
    }
  });
  test('rejects overlaps, disconnected cages, and unknown rule versions', () => {
    const p = generateKillerPuzzle('a').puzzle;
    expect(() => canonicalCages([{ cells: [0,80], total: 3 }])).toThrow();
    expect(() => canonicalCages([...p.cages!, p.cages![0]])).toThrow();
    expect(validPuzzleRules({ ...p, killerRulesVersion: 2 as 1 })).toBe(false);
    expect(validPuzzleRules({ ...p, variant: undefined })).toBe(false);
  });
  test('cell assignments reject a plausible set with no matching positions', () => {
    const grid = Array(81).fill(0);
    const domains = Array.from({ length: 81 }, () => [1,2,3]);
    domains[0] = [1]; domains[1] = [1]; domains[2] = [2,3];
    expect(cagePossibilities(grid, { cells: [0,1,2], total: 6 }, domains as never).assignments).toBe(0);
    expect(cagePossibilities(grid, { cells: [0,1], total: 4 }).combinations).toEqual([[1,3]]);
  });
  test('replay restores cages and rejects malformed persisted rules', () => {
    const store = new EventStore(new MemoryStorage());
    const p = generateKillerPuzzle('a').puzzle;
    store.startGame(p, { id: 'start', occurredAt: new Date('2026-01-01') });
    const document = store.getDocument();
    expect(new EventStore(new MemoryStorage(), document).getProjection().games[document.events[0].gameId!].puzzle.cages).toEqual(p.cages);
    (document.events[0] as any).payload.puzzle.cages[0].total++;
    expect(new EventStore(new MemoryStorage(), document).getProjection().diagnostics).toContain('invalid-puzzle-rules');
  });
});


describe('Killer discovery story', () => {
  test('every starter has a complete logical trace without a solution oracle', () => {
    for (const entry of corpus) {
      const logical = solveKillerLogically('.'.repeat(81), entry.cages);
      expect(logical.solved).toBe(true);
      expect(logical.grid).toBe(entry.solution);
      expect(logical.steps).toHaveLength(81);
      expect(new Set(logical.steps.map((s) => s.rule)).size).toBeGreaterThan(1);
    }
  });
  test('each hinted digit excludes all other candidates under exhaustive validation', () => {
    const p = generateKillerPuzzle('proof').puzzle;
    const grid = Array(81).fill(0);
    for (let i = 0; i < 8; i++) {
      const step = nextKillerPlacement(grid, p.cages!)!;
      expect(step).not.toBeNull();
      for (let d=1; d<=9; d++) if (d !== step.value) {
        grid[step.targetCell] = d;
        expect(solveKiller(grid.map((v)=>v || '.').join(''), p.cages!).count).toBe(0);
      }
      grid[step.targetCell] = step.value;
    }
  });
  test('derived equations agree with the solution without adding no-repeat constraints', () => {
    for (const entry of corpus) for (const r of killerRelationships(Array(81).fill(0), entry.cages)) {
      expect(r.cells.reduce((sum, c) => sum + Number(entry.solution[c]), 0)).toBe(r.total);
    }
  });
  test('human walkthrough finishes all 81 blank cells and ignores human notes', () => {
    const store = new EventStore(new MemoryStorage());
    const state = store.startGame(generateKillerPuzzle('a').puzzle, { id: 'origin', occurredAt: new Date('2026-01-01') });
    const game = state.games[state.activeGameId!];
    game.notes = Array.from({length:81},()=>[9]);
    const steps = buildHumanSolveSequence(game);
    expect(steps).toHaveLength(81);
    expect(steps.every((s)=>s.rule !== 'unknown-rule')).toBe(true);
  });
});
