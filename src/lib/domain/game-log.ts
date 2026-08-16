import type { SudokuEvent } from './types';

const cellName = (cell: number): string => `r${Math.floor(cell / 9) + 1}c${(cell % 9) + 1}`;

export interface GameLogEntry {
  id: string;
  type: SudokuEvent['type'];
  text: string;
}

export function formatGameLog(events: readonly SudokuEvent[], gameId: string): GameLogEntry[] {
  return events
    .filter((event) => event.gameId === gameId)
    .map((event) => {
      if (event.type === 'game/started') {
        return { id: event.id, type: event.type, text: 'Started Easy puzzle' };
      }
      if (event.type === 'cell/value-entered') {
        return {
          id: event.id,
          type: event.type,
          text: `Placed ${event.payload.value} in ${cellName(event.payload.cell)}`
        };
      }
      return {
        id: event.id,
        type: event.type,
        text: `${event.payload.enabled ? 'Added' : 'Removed'} note ${event.payload.value} ${event.payload.enabled ? 'to' : 'from'} ${cellName(event.payload.cell)}`
      };
    })
    .reverse();
}
