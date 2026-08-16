import { describe, expect, it } from 'vitest';
import { replay } from '../../src/lib/domain/reducer';
import type { PuzzleDefinition, SudokuEvent } from '../../src/lib/domain/types';

const puzzle: PuzzleDefinition = {
  id: 'easy-v1-test',
  givens: `1${'.'.repeat(80)}`,
  solution: '123456789'.repeat(9),
  difficulty: 'easy',
  seed: 'test',
  generatorVersion: 1,
  validatorVersion: 1,
  hardestTechnique: 'naked-single'
};

const envelope = (sequence: number) => ({
  id: `event-${sequence}`,
  sequence,
  gameId: 'game-1',
  occurredAt: `2026-08-16T12:00:0${sequence - 1}.000Z`,
  elapsedMs: 0,
  schemaVersion: 1 as const,
  reducerVersion: 1 as const
});

describe('event replay for values and notes', () => {
  it('derives values, explicit notes, automatic note cleanup, and conflicts', () => {
    const events: SudokuEvent[] = [
      {
        ...envelope(1),
        type: 'game/started',
        payload: {
          gameId: 'game-1', puzzle,
          settings: { checkMistakes: false, autoRemoveNotes: true, showTimer: true, numberFirst: true }
        }
      },
      { ...envelope(2), type: 'cell/note-toggled', payload: { cell: 1, value: 2, enabled: true } },
      { ...envelope(3), type: 'cell/note-toggled', payload: { cell: 2, value: 2, enabled: true } },
      { ...envelope(4), type: 'cell/value-entered', payload: { cell: 1, value: 2 } },
      { ...envelope(5), type: 'cell/value-entered', payload: { cell: 2, value: 1 } }
    ];
    const game = replay(events).games['game-1'];
    expect(game.values.slice(0, 3)).toEqual([null, 2, 1]);
    expect(game.notes[1]).toEqual([]);
    expect(game.notes[2]).toEqual([]);
    expect(game.conflicts).toEqual([0, 2]);
  });

  it('rejects edits to fixed givens during replay', () => {
    const events: SudokuEvent[] = [
      {
        ...envelope(1),
        type: 'game/started',
        payload: {
          gameId: 'game-1', puzzle,
          settings: { checkMistakes: false, autoRemoveNotes: true, showTimer: true, numberFirst: true }
        }
      },
      { ...envelope(2), type: 'cell/value-entered', payload: { cell: 0, value: 9 } }
    ];
    const state = replay(events);
    expect(state.games['game-1'].values[0]).toBeNull();
    expect(state.diagnostics).toContain('illegal-cell-edit');
  });

  it('derives undo, redo, and a new branch without deleting history', () => {
    const events: SudokuEvent[] = [
      {
        ...envelope(1), type: 'game/started',
        payload: {
          gameId: 'game-1', puzzle,
          settings: { checkMistakes: false, autoRemoveNotes: true, showTimer: true, numberFirst: true }
        }
      },
      { ...envelope(2), type: 'cell/value-entered', payload: { cell: 1, value: 2 } },
      { ...envelope(3), type: 'cell/cleared', payload: { cell: 1 } },
      { ...envelope(4), type: 'move/undone', payload: { targetEventId: 'event-3' } },
      { ...envelope(5), type: 'move/redone', payload: { targetEventId: 'event-3' } },
      { ...envelope(6), type: 'move/undone', payload: { targetEventId: 'event-3' } },
      { ...envelope(7), type: 'cell/value-entered', payload: { cell: 2, value: 3 } }
    ];
    const state = replay(events);
    expect(state.games['game-1'].values.slice(0, 3)).toEqual([null, 2, 3]);
    expect(state.games['game-1'].undoTargetId).toBe('event-7');
    expect(state.games['game-1'].redoTargetId).toBeNull();
    expect(state.diagnostics).toEqual([]);
    expect(events).toHaveLength(7);
  });

  it('freezes elapsed time while paused and resumes from the event snapshot', () => {
    const events: SudokuEvent[] = [
      {
        ...envelope(1), type: 'game/started',
        payload: {
          gameId: 'game-1', puzzle,
          settings: { checkMistakes: false, autoRemoveNotes: true, showTimer: true, numberFirst: true }
        }
      },
      { ...envelope(2), elapsedMs: 65_000, type: 'game/paused', payload: {} },
      { ...envelope(3), elapsedMs: 65_000, type: 'game/resumed', payload: {} },
      { ...envelope(4), elapsedMs: 95_000, type: 'game/paused', payload: {} }
    ];
    const game = replay(events).games['game-1'];
    expect(game.paused).toBe(true);
    expect(game.elapsedMs).toBe(95_000);
    expect(game.resumedAt).toBeNull();
    expect(replay(events).games['game-1']).toEqual(game);
  });
});
