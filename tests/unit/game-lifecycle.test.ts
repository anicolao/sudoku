import { describe, expect, it } from 'vitest';
import { replay } from '../../src/lib/domain/reducer';
import type { SudokuEvent } from '../../src/lib/domain/types';
import { generateEasyPuzzle } from '../../src/lib/generator/generate-puzzle';

describe('hint, completion, restart, and abandonment', () => {
  it('derives terminal state without a redundant completion event', () => {
    const puzzle = generateEasyPuzzle('lifecycle').puzzle;
    const gameId = 'game-lifecycle';
    const events: SudokuEvent[] = [{
      id: 'event-1', sequence: 1, gameId, type: 'game/started',
      payload: {
        gameId, puzzle,
        settings: { checkMistakes: false, autoRemoveNotes: true, showTimer: true, numberFirst: true, notesFirst: false }
      },
      occurredAt: '2026-08-16T12:00:00.000Z', elapsedMs: 0,
      schemaVersion: 1, reducerVersion: 1
    }];
    const blanks = [...puzzle.givens].flatMap((value, cell) => value === '.' ? [cell] : []);
    blanks.forEach((cell, index) => {
      const sequence = index + 2;
      events.push({
        id: `event-${sequence}`, sequence, gameId,
        type: index === 0 ? 'hint/revealed' : 'cell/value-entered',
        payload: { cell, value: Number(puzzle.solution[cell]) as never },
        occurredAt: `2026-08-16T12:00:${String(index).padStart(2, '0')}.000Z`,
        elapsedMs: index * 1000, schemaVersion: 1, reducerVersion: 1
      });
    });

    const complete = replay(events).games[gameId];
    expect(complete.status).toBe('complete');
    expect(complete.hints).toBe(1);
    expect(complete.hintedCells).toEqual([blanks[0]]);
    expect(events.some((event) => (event.type as string) === 'game/completed')).toBe(false);

    const restartSequence = events.length + 1;
    events.push({
      id: `event-${restartSequence}`, sequence: restartSequence, gameId,
      type: 'game/restarted', payload: {}, occurredAt: '2026-08-16T12:05:00.000Z',
      elapsedMs: complete.elapsedMs, schemaVersion: 1, reducerVersion: 1
    });
    const restarted = replay(events).games[gameId];
    expect(restarted.status).toBe('active');
    expect(restarted.values.every((value) => value === null)).toBe(true);
    expect(restarted.hints).toBe(0);

    const abandonSequence = events.length + 1;
    events.push({
      id: `event-${abandonSequence}`, sequence: abandonSequence, gameId,
      type: 'game/abandoned', payload: {}, occurredAt: '2026-08-16T12:06:00.000Z',
      elapsedMs: complete.elapsedMs, schemaVersion: 1, reducerVersion: 1
    });
    expect(replay(events).games[gameId].status).toBe('abandoned');
  });
});
