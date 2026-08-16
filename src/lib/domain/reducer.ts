import type { AppProjection, SudokuEvent } from './types';

export const emptyProjection = (): AppProjection => ({ activeGameId: null, games: {}, diagnostics: [] });

export function replay(events: readonly SudokuEvent[]): AppProjection {
  const state = emptyProjection();
  const ids = new Set<string>();
  let expectedSequence = 1;
  for (const event of events) {
    if (ids.has(event.id) || event.sequence !== expectedSequence) {
      state.diagnostics.push('invalid-event-order');
      continue;
    }
    ids.add(event.id);
    expectedSequence += 1;
    if (event.type === 'game/started') {
      state.games[event.gameId] = {
        id: event.gameId,
        puzzle: event.payload.puzzle,
        startedAt: event.occurredAt
      };
      state.activeGameId = event.gameId;
    }
  }
  return state;
}
