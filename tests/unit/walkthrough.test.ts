import { describe, expect, it } from 'vitest';
import type { Digit, SudokuEvent } from '../../src/lib/domain/types';
import { buildSolveWalkthrough } from '../../src/lib/domain/walkthrough';
import { generateEasyPuzzle, generatePuzzle } from '../../src/lib/generator/generate-puzzle';
import { solveLogically } from '../../src/lib/generator/logical-solver';

const gameId = 'game-walkthrough';
const envelope = (sequence: number) => ({
  id: `event-${sequence}`,
  sequence,
  gameId,
  occurredAt: `2026-08-16T12:${String(sequence).padStart(2, '0')}:00.000Z`,
  elapsedMs: sequence * 1_000,
  schemaVersion: 1 as const,
  reducerVersion: 1 as const
});

describe('instructional solve walkthroughs', () => {
  it('reconstructs a completed solve and proves direct rules from each pre-move board', () => {
    const puzzle = generateEasyPuzzle('walkthrough-seed').puzzle;
    const logical = solveLogically(puzzle.givens);
    const events: SudokuEvent[] = [{
      ...envelope(1),
      type: 'game/started',
      payload: {
        gameId,
        puzzle,
        settings: { checkMistakes: false, autoRemoveNotes: true, showTimer: true, numberFirst: true, notesFirst: false }
      }
    }];

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
    expect(walkthrough.steps[0]).toMatchObject({
      rule: 'starting-position', targetCell: null, action: 'Opened the puzzle'
    });
    expect(walkthrough.steps.slice(1).every((step) =>
      ['full-house', 'naked-single', 'hidden-single'].includes(step.rule)
    )).toBe(true);
    expect(walkthrough.steps.slice(1).every((step) =>
      step.targetCell !== null && step.contextCells.length > 0
    )).toBe(true);
    expect(walkthrough.steps.at(-1)?.game.status).toBe('complete');
    expect(walkthrough.steps.at(-1)?.explanation).toContain('completed the puzzle');
    expect(events[0].type).toBe('game/started');
  });

  it('keeps notes, mistakes, corrections, and undo factual instead of inventing techniques', () => {
    const puzzle = generateEasyPuzzle('walkthrough-actions').puzzle;
    const cell = puzzle.givens.indexOf('.');
    const solution = Number(puzzle.solution[cell]) as Digit;
    const wrong = (solution === 9 ? 1 : solution + 1) as Digit;
    const events: SudokuEvent[] = [
      {
        ...envelope(1), type: 'game/started',
        payload: {
          gameId, puzzle,
          settings: { checkMistakes: true, autoRemoveNotes: true, showTimer: true, numberFirst: true, notesFirst: false }
        }
      },
      { ...envelope(2), type: 'cell/note-toggled', payload: { cell, value: solution, enabled: true } },
      { ...envelope(3), type: 'move/undone', payload: { targetEventId: 'event-2' } },
      { ...envelope(4), type: 'cell/value-entered', payload: { cell, value: wrong } },
      { ...envelope(5), type: 'cell/value-erased', payload: { cell, value: wrong, targetEventId: 'event-4' } }
    ];

    const walkthrough = buildSolveWalkthrough(events, gameId);
    expect(walkthrough.steps.map((step) => step.rule)).toEqual([
      'starting-position', 'candidate-added', 'undo', 'mistake', 'correction'
    ]);
    expect(walkthrough.steps[1].explanation).toContain('does not claim which elimination rule');
    expect(walkthrough.steps[3].explanation).toContain('does not match');
    expect(walkthrough.steps.at(-1)?.game.values[cell]).toBeNull();
  });

  it('names an advanced rule when a recorded candidate removal matches its proof', () => {
    const puzzle = generatePuzzle('intermediate', 'level-corpus').puzzle;
    const logical = solveLogically(puzzle.givens);
    const eliminationIndex = logical.steps.findIndex((step) => step.eliminated?.length);
    expect(eliminationIndex).toBeGreaterThanOrEqual(0);
    const elimination = logical.steps[eliminationIndex];
    const events: SudokuEvent[] = [{
      ...envelope(1), type: 'game/started',
      payload: {
        gameId, puzzle,
        settings: { checkMistakes: false, autoRemoveNotes: false, showTimer: true, numberFirst: true, notesFirst: false }
      }
    }];
    for (const step of logical.steps.slice(0, eliminationIndex)) {
      if (step.cell === undefined || step.value === undefined) continue;
      const sequence = events.length + 1;
      events.push({
        ...envelope(sequence), type: 'cell/value-entered',
        payload: { cell: step.cell, value: step.value }
      });
    }
    const removed = elimination.eliminated?.[0];
    if (!removed) throw new Error('Expected an elimination step');
    const addSequence = events.length + 1;
    events.push({
      ...envelope(addSequence), type: 'cell/note-toggled',
      payload: { ...removed, enabled: true }
    });
    const removeSequence = events.length + 1;
    events.push({
      ...envelope(removeSequence), type: 'cell/note-toggled',
      payload: { ...removed, enabled: false }
    });

    const step = buildSolveWalkthrough(events, gameId).steps.at(-1);
    expect(step?.rule).toBe(elimination.technique);
    expect(step?.ruleLabel).not.toBe('Candidate removed');
    expect(step?.targetCell).toBe(removed.cell);
    expect(step?.contextCells.length).toBeGreaterThan(0);
    expect(step?.explanation).toContain('proves this candidate cannot remain');
  });
});
