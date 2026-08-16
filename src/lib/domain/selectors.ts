import type { GameProjection } from './types';

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
