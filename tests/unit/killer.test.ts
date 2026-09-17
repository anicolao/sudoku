import { PEERS } from '../../src/lib/domain/sudoku';
import type { Digit } from '../../src/lib/domain/types';
import { nextKillerPlacement, solveKillerLogically, killerRelationships } from '../../src/lib/domain/killer-analysis';
import { buildHumanSolveSequence } from '../../src/lib/domain/walkthrough';
import { describe, expect, test } from 'vitest';
import { canonicalCages, cagePossibilities, solveKiller, validPuzzleRules } from '../../src/lib/domain/killer';
import { generateKillerPuzzle } from '../../src/lib/generator/killer-puzzle';
import { EventStore, MemoryStorage } from '../../src/lib/storage/event-store';
const examples = ['coverage-a', 'coverage-b', 'coverage-c'].map((seed) => {
  const { puzzle } = generateKillerPuzzle(seed);
  return { cages: puzzle.cages!, solution: puzzle.solution };
});

describe('Killer rules visible in play', () => {
  test('constructed puzzles are unique with no given digits or single-cell cages', () => {
    for (const entry of examples) expect(solveKiller('.'.repeat(81), canonicalCages(entry.cages))).toEqual({ count: 1, solution: entry.solution });
  });
  // Each seed performs two full constructions. Give each case its own budget,
  // matching the other generator tests instead of sharing the default 5 seconds.
  test.each(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'])(
    'seed %s is reproducible and has no singleton cages', (seed) => {
      const result = generateKillerPuzzle(seed);
      expect(validPuzzleRules(result.puzzle)).toBe(true);
      expect(result.puzzle.cages!.every((cage) => cage.cells.length >= 2 && cage.cells.length <= 5)).toBe(true);
      expect(generateKillerPuzzle(seed)).toEqual(result);
    }, 30_000
  );
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
  test('constructed puzzles have complete logical traces without a solution oracle', () => {
    for (const entry of examples) {
      const logical = solveKillerLogically('.'.repeat(81), entry.cages);
      expect(logical.solved).toBe(true);
      expect(logical.grid).toBe(entry.solution);
      expect(logical.steps).toHaveLength(81);
      expect(logical.steps.some((step) => step.rule === 'killer-45' || step.prerequisites?.some((reason) => reason.includes('cage')))).toBe(true);
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
    for (const entry of examples) for (const r of killerRelationships(Array(81).fill(0), entry.cages)) {
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

test('cage peers outside ordinary houses have reversible automatic notes and completion', () => {
  const store = new EventStore(new MemoryStorage());
  const p=generateKillerPuzzle('a').puzzle;
  // Construct an explicit connected cross-box cage, independently of the
  // random generator's choice of shapes for this seed.
  const cells = Array.from({length:81},(_,a)=>[a,a+1,a+9])
    .find((cs)=>cs.every((c)=>c<81) && cs[0]%9<8 && !PEERS[cs[1]].includes(cs[2]) &&
      new Set(cs.map((c)=>p.solution[c])).size===3)!;
  p.cages = canonicalCages([
    { cells, total:cells.reduce((sum,c)=>sum+Number(p.solution[c]),0) },
    ...Array.from({length:81},(_,c)=>c).filter((c)=>!cells.includes(c)).map((cell)=>({cells:[cell],total:Number(p.solution[cell])}))
  ]);
  let sequence=0;
  const meta=()=>({id:`move-${++sequence}`,occurredAt:new Date('2026-01-01')});
  let state=store.startGame(p,meta());
  const id=state.activeGameId!;
  const pair=p.cages!.flatMap((cage)=>cage.cells.flatMap(a=>cage.cells.map(b=>[a,b]))).find(([a,b])=>a!==b && !PEERS[a].includes(b))!;
  expect(pair).toBeDefined();
  const [a,b]=pair, value=Number(p.solution[a]) as Digit;
  store.toggleNote(id,b,value,true,meta());
  const placement=meta();
  state=store.enterValue(id,a,value,placement);
  expect(state.games[id].notes[b]).not.toContain(value);
  state=store.undo(id,placement.id,meta());
  expect(state.games[id].notes[b]).toContain(value);
  state=store.redo(id,placement.id,meta());
  expect(state.games[id].notes[b]).not.toContain(value);
  state=store.eraseValue(id,a,value,placement.id,meta());
  expect(state.games[id].notes[b]).toContain(value);
  for(let cell=0;cell<81;cell++) state=store.enterValue(id,cell,Number(p.solution[cell]) as Digit,meta());
  expect(state.games[id].status).toBe('complete');
  expect(state.games[id].conflicts).toEqual([]);
  expect(state.diagnostics).toEqual([]);
});
