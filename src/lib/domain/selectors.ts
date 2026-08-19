import type { Digit, GameProjection } from './types';

export function remainingDigit(game: GameProjection, digit: Digit): number {
  let correctPlacements = 0;
  for (let cell = 0; cell < 81; cell += 1) {
    const entry = game.puzzle.givens[cell] === '.'
      ? game.values[cell]
      : Number(game.puzzle.givens[cell]);
    if (entry === digit && Number(game.puzzle.solution[cell]) === digit) correctPlacements += 1;
  }
  return Math.max(0, 9 - correctPlacements);
}

export function elapsedAt(game: GameProjection, now: Date): number {
  if (game.paused || !game.resumedAt) return game.elapsedMs;
  return Math.max(game.elapsedMs, game.elapsedMs + now.getTime() - Date.parse(game.resumedAt));
}

export function formatElapsed(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
