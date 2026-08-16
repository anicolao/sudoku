import type { ReversibleEvent, SudokuEvent } from './types';

const cellName = (cell: number): string => `r${Math.floor(cell / 9) + 1}c${(cell % 9) + 1}`;

export interface GameLogEntry {
  id: string;
  type: SudokuEvent['type'];
  text: string;
}

export function describeMove(event: ReversibleEvent): string {
  if (event.type === 'cell/value-entered') return `Placed ${event.payload.value} in ${cellName(event.payload.cell)}`;
  if (event.type === 'cell/cleared') return `Erased ${cellName(event.payload.cell)}`;
  return `${event.payload.enabled ? 'Added' : 'Removed'} note ${event.payload.value} ${event.payload.enabled ? 'to' : 'from'} ${cellName(event.payload.cell)}`;
}

export function formatGameLog(events: readonly SudokuEvent[], gameId: string): GameLogEntry[] {
  return events
    .filter((event) => event.gameId === gameId)
    .map((event) => {
      if (event.type === 'game/started') {
        return { id: event.id, type: event.type, text: 'Started Easy puzzle' };
      }
      if (event.type === 'game/paused') return { id: event.id, type: event.type, text: 'Paused puzzle' };
      if (event.type === 'game/resumed') return { id: event.id, type: event.type, text: 'Resumed puzzle' };
      if (event.type === 'move/undone' || event.type === 'move/redone') {
        const target = events.find((candidate) => candidate.id === event.payload.targetEventId);
        const targetText = target && (target.type === 'cell/value-entered' || target.type === 'cell/note-toggled' || target.type === 'cell/cleared')
          ? describeMove(target)
          : event.payload.targetEventId;
        return { id: event.id, type: event.type, text: `${event.type === 'move/undone' ? 'Undid' : 'Redid'}: ${targetText}` };
      }
      return { id: event.id, type: event.type, text: describeMove(event) };
    })
    .reverse();
}
