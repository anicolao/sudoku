import { describe, expect, it } from 'vitest';
import { elapsedAt, formatElapsed } from '../../src/lib/domain/selectors';
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
