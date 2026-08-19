import type { GameProjection, ReversibleEvent, SettingsChangedEvent, SudokuEvent } from './types';
import { difficultyLabel } from './difficulty';

const cellName = (cell: number): string => `r${Math.floor(cell / 9) + 1}c${(cell % 9) + 1}`;

export interface GameLogEntry {
  id: string;
  type: string;
  text: string;
}

export function describeMove(event: ReversibleEvent): string {
  if (event.type === 'cell/value-entered') return `Placed ${event.payload.value} in ${cellName(event.payload.cell)}`;
  if (event.type === 'cell/value-erased') return `Erased ${event.payload.value} from ${cellName(event.payload.cell)}`;
  if (event.type === 'cell/cleared') return `Erased ${cellName(event.payload.cell)}`;
  if (event.type === 'cell/notes-filled') return `Filled all notes in ${cellName(event.payload.cell)}`;
  if (event.type === 'hint/revealed') return `Revealed ${event.payload.value} in ${cellName(event.payload.cell)}`;
  return `${event.payload.enabled ? 'Added' : 'Removed'} note ${event.payload.value} ${event.payload.enabled ? 'to' : 'from'} ${cellName(event.payload.cell)}`;
}

export function formatGameLog(events: readonly SudokuEvent[], gameId: string, game?: GameProjection): GameLogEntry[] {
  const entries: GameLogEntry[] = events
    .filter((event): event is Exclude<SudokuEvent, SettingsChangedEvent> => event.gameId === gameId)
    .map((event) => {
      if (event.type === 'game/started') {
        return { id: event.id, type: event.type, text: `Started ${difficultyLabel(event.payload.puzzle.difficulty)} puzzle` };
      }
      if (event.type === 'game/imported') {
        const text = event.payload.importKind === 'progress-transfer'
          ? `Continued transferred puzzle at ${Math.floor(event.elapsedMs / 60_000)}:${String(Math.floor(event.elapsedMs / 1_000) % 60).padStart(2, '0')}`
          : `Opened shared ${difficultyLabel(event.payload.puzzle.difficulty)} puzzle`;
        return { id: event.id, type: event.type, text };
      }
      if (event.type === 'game/paused') return { id: event.id, type: event.type, text: 'Paused puzzle' };
      if (event.type === 'game/resumed') return { id: event.id, type: event.type, text: 'Resumed puzzle' };
      if (event.type === 'game/restarted') return { id: event.id, type: event.type, text: 'Restarted puzzle' };
      if (event.type === 'game/abandoned') return { id: event.id, type: event.type, text: 'Abandoned puzzle' };
      if (event.type === 'move/undone' || event.type === 'move/redone') {
        const target = events.find((candidate) => candidate.id === event.payload.targetEventId);
        const targetText = target && (target.type === 'cell/value-entered' || target.type === 'cell/value-erased' || target.type === 'cell/note-toggled' || target.type === 'cell/notes-filled' || target.type === 'cell/cleared')
          ? describeMove(target)
          : event.payload.targetEventId;
        return { id: event.id, type: event.type, text: `${event.type === 'move/undone' ? 'Undid' : 'Redid'}: ${targetText}` };
      }
      return { id: event.id, type: event.type, text: describeMove(event) };
    })
    .reverse();
  if (game?.status === 'complete') {
    entries.unshift({ id: `complete-${game.id}`, type: 'game/completed', text: 'Solved puzzle' });
  }
  return entries;
}
