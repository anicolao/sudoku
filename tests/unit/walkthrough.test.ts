import { describe, expect, it } from 'vitest';
import type { Digit, PuzzleDefinition, SudokuEvent } from '../../src/lib/domain/types';
import {
  buildSolveWalkthrough,
  buildSolveWalkthroughAsync,
  type WalkthroughBuildProgress
} from '../../src/lib/domain/walkthrough';
import { generateEasyPuzzle } from '../../src/lib/generator/generate-puzzle';
import { solveLogically } from '../../src/lib/generator/logical-solver';

const gameId = 'game-walkthrough';
const settings = {
  checkMistakes: false,
  autoRemoveNotes: true,
  showTimer: true,
  numberFirst: true,
  notesFirst: false
};
const envelope = (sequence: number) => ({
  id: `event-${sequence}`,
  sequence,
  gameId,
  occurredAt: `2026-08-16T12:${String(sequence).padStart(2, '0')}:00.000Z`,
  elapsedMs: sequence * 1_000,
  schemaVersion: 1 as const,
  reducerVersion: 1 as const
});
const startEvent = (puzzle: PuzzleDefinition): SudokuEvent => ({
  ...envelope(1),
  type: 'game/started',
  payload: { gameId, puzzle, settings }
});

describe('instructional solve walkthroughs', () => {
  it('jumps only between placements and uses a book rule or Unknown rule for every move', () => {
    const puzzle = generateEasyPuzzle('walkthrough-seed').puzzle;
    const logical = solveLogically(puzzle.givens);
    const events: SudokuEvent[] = [startEvent(puzzle)];

    for (const step of logical.steps) {
      if (step.cell === undefined || step.value === undefined) continue;
      const sequence = events.length + 1;
      events.push({
        ...envelope(sequence),
        type: 'cell/value-entered',
        payload: { cell: step.cell, value: step.value }
      });
    }

    const walkthrough = buildSolveWalkthrough(events, gameId);
    expect(walkthrough.steps).toHaveLength(events.length - 1);
    expect(walkthrough.steps.every((step) => step.targetCell !== null)).toBe(true);
    expect(walkthrough.steps.every((step) => [
      'Full House', 'Naked Single', 'Hidden Single', 'Naked Pairs', 'Hidden Pairs',
      'Pointing Pairs', 'Y-Wing', 'X-Wing', 'Swordfish', 'Naked Triples',
      'Simple Colors', 'XY-Chains', 'Unique Rectangles', '3D Medusa', 'Unknown rule'
    ].includes(step.ruleLabel))).toBe(true);
    expect(walkthrough.steps.at(-1)?.game.status).toBe('complete');
    expect(walkthrough.steps.at(-1)?.explanation).toContain('completed the puzzle');
  });

  it('skips notes, undo, and correction events and marks an unproved placement Unknown rule', () => {
    const puzzle = generateEasyPuzzle('walkthrough-actions').puzzle;
    const cell = puzzle.givens.indexOf('.');
    const solution = Number(puzzle.solution[cell]) as Digit;
    const wrong = (solution === 9 ? 1 : solution + 1) as Digit;
    const events: SudokuEvent[] = [
      startEvent(puzzle),
      { ...envelope(2), type: 'cell/note-toggled', payload: { cell, value: solution, enabled: true } },
      { ...envelope(3), type: 'move/undone', payload: { targetEventId: 'event-2' } },
      { ...envelope(4), type: 'cell/value-entered', payload: { cell, value: wrong } },
      { ...envelope(5), type: 'cell/value-erased', payload: { cell, value: wrong, targetEventId: 'event-4' } }
    ];

    const walkthrough = buildSolveWalkthrough(events, gameId);
    expect(walkthrough.steps).toHaveLength(1);
    expect(walkthrough.steps[0]).toMatchObject({
      eventId: 'event-4',
      rule: 'unknown-rule',
      ruleLabel: 'Unknown rule',
      targetCell: cell
    });
    expect(walkthrough.steps[0].explanation).toContain('no solving rule accounts');
  });

  it('prefers Full House when the placement is also a naked single', () => {
    const solution = '549371628826945371173628945654719283917283456382456719738562194491837562265194837';
    const puzzle: PuzzleDefinition = {
      id: 'full-house-fixture',
      givens: `.${solution.slice(1)}`,
      solution,
      difficulty: 'custom',
      validatorVersion: 3,
      hardestTechnique: null
    };
    const events: SudokuEvent[] = [
      startEvent(puzzle),
      { ...envelope(2), type: 'cell/value-entered', payload: { cell: 0, value: 5 } }
    ];

    expect(buildSolveWalkthrough(events, gameId).steps[0]).toMatchObject({
      rule: 'full-house',
      ruleLabel: 'Full House'
    });
  });

  it('finds the simplest advanced book rule that directly accounts for a placement', () => {
    const puzzle: PuzzleDefinition = {
      id: 'hidden-pairs-fixture',
      givens: '.....1...8.6.4.37..7...894.........39..2.3.56.82..67.973....1.4.9...75...6.194...',
      solution: '549371628826945371173628945654719283917283456382456719738562194491837562265194837',
      difficulty: 'custom',
      validatorVersion: 3,
      hardestTechnique: null
    };
    const events: SudokuEvent[] = [
      startEvent(puzzle),
      { ...envelope(2), type: 'cell/value-entered', payload: { cell: 20, value: 3 } }
    ];

    const step = buildSolveWalkthrough(events, gameId).steps[0];
    expect(step).toMatchObject({ rule: 'hidden-pair', ruleLabel: 'Hidden Pairs', targetCell: 20 });
    expect(step.contextCells).toContain(2);
    expect(step.explanation).toContain('simplest listed rule');
  });

  it('uses Unknown rule for a correct placement that no listed rule proves', () => {
    const puzzle: PuzzleDefinition = {
      id: 'unknown-rule-fixture',
      givens: '.....1...8.6.4.37..7...894.........39..2.3.56.82..67.973....1.4.9...75...6.194...',
      solution: '549371628826945371173628945654719283917283456382456719738562194491837562265194837',
      difficulty: 'custom',
      validatorVersion: 3,
      hardestTechnique: null
    };
    const events: SudokuEvent[] = [
      startEvent(puzzle),
      { ...envelope(2), type: 'cell/value-entered', payload: { cell: 0, value: 5 } }
    ];

    const step = buildSolveWalkthrough(events, gameId).steps[0];
    expect(step).toMatchObject({ rule: 'unknown-rule', ruleLabel: 'Unknown rule', targetCell: 0 });
    expect(step.explanation).toContain('No rule in the walkthrough\'s book list can be proven');
  });

  it('reports asynchronous analysis progress once per recorded placement', async () => {
    const solution = '549371628826945371173628945654719283917283456382456719738562194491837562265194837';
    const puzzle: PuzzleDefinition = {
      id: 'progress-fixture',
      givens: `..${solution.slice(2)}`,
      solution,
      difficulty: 'custom',
      validatorVersion: 3,
      hardestTechnique: null
    };
    const events: SudokuEvent[] = [
      startEvent(puzzle),
      { ...envelope(2), type: 'cell/value-entered', payload: { cell: 0, value: 5 } },
      { ...envelope(3), type: 'cell/value-entered', payload: { cell: 1, value: 4 } }
    ];
    const progress: WalkthroughBuildProgress[] = [];
    let yields = 0;

    const walkthrough = await buildSolveWalkthroughAsync(events, gameId, {
      onProgress: (update) => progress.push(update),
      yieldControl: async () => { yields += 1; }
    });

    expect(walkthrough.steps).toHaveLength(2);
    expect(progress).toEqual([
      { completed: 0, total: 2 },
      { completed: 1, total: 2 },
      { completed: 2, total: 2 }
    ]);
    expect(yields).toBe(2);
  });
});
