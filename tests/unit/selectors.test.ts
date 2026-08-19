import { describe, expect, it } from 'vitest';
import { elapsedAt, formatElapsed, remainingDigit } from '../../src/lib/domain/selectors';
import type { GameProjection } from '../../src/lib/domain/types';

describe('active timer selectors', () => {
  const game = {
    paused: false,
    elapsedMs: 65_000,
    resumedAt: '2026-08-16T12:01:05.000Z'
  } as GameProjection;

  it('adds only active time and formats it with tabular minutes and seconds', () => {
    expect(elapsedAt(game, new Date('2026-08-16T12:01:35.000Z'))).toBe(95_000);
    expect(formatElapsed(95_000)).toBe('01:35');
    expect(elapsedAt({ ...game, paused: true }, new Date('2026-08-16T14:00:00.000Z'))).toBe(65_000);
  });
});

describe('remaining digit selector', () => {
  it('counts only correct placements and reaches zero when all nine are present', () => {
    const values = Array(81).fill(null);
    for (const cell of [9, 18, 27, 36, 45, 54, 63]) values[cell] = 1;
    values[1] = 1;
    const game = {
      puzzle: {
        givens: `1${'.'.repeat(80)}`,
        solution: '123456789'.repeat(9)
      },
      values
    } as GameProjection;

    expect(remainingDigit(game, 1)).toBe(1);
    values[72] = 1;
    expect(remainingDigit(game, 1)).toBe(0);
    values[72] = null;
    expect(remainingDigit(game, 1)).toBe(1);
  });
});
