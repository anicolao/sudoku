import { UNITS } from './sudoku';
import type { AppProjection, Digit, GameProjection, SudokuEvent } from './types';

export const emptyProjection = (): AppProjection => ({ activeGameId: null, games: {}, diagnostics: [] });

function isEditable(game: GameProjection, cell: number): boolean {
  return Number.isInteger(cell) && cell >= 0 && cell < 81 && game.puzzle.givens[cell] === '.';
}

function deriveConflicts(game: GameProjection): number[] {
  const board = [...game.puzzle.givens].map((given, cell) =>
    given === '.' ? game.values[cell] : Number(given)
  );
  const conflicts = new Set<number>();
  for (const unit of UNITS) {
    const positions = new Map<number, number[]>();
    for (const cell of unit) {
      const value = board[cell];
      if (!value) continue;
      positions.set(value, [...(positions.get(value) ?? []), cell]);
    }
    for (const cells of positions.values()) if (cells.length > 1) cells.forEach((cell) => conflicts.add(cell));
  }
  return [...conflicts].sort((left, right) => left - right);
}

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
        settings: event.payload.settings,
        startedAt: event.occurredAt,
        values: Array<Digit | null>(81).fill(null),
        notes: Array.from({ length: 81 }, () => []),
        conflicts: []
      };
      state.activeGameId = event.gameId;
      continue;
    }

    const game = state.games[event.gameId];
    if (!game || !isEditable(game, event.payload.cell)) {
      state.diagnostics.push('illegal-cell-edit');
      continue;
    }

    if (event.type === 'cell/value-entered') {
      game.values[event.payload.cell] = event.payload.value;
      game.notes[event.payload.cell] = [];
      if (game.settings.autoRemoveNotes) {
        for (const unit of UNITS) {
          if (!unit.includes(event.payload.cell)) continue;
          for (const peer of unit) {
            game.notes[peer] = game.notes[peer].filter((note) => note !== event.payload.value);
          }
        }
      }
      game.conflicts = deriveConflicts(game);
      continue;
    }

    if (game.values[event.payload.cell] !== null) {
      state.diagnostics.push('notes-on-filled-cell');
      continue;
    }
    const notes = new Set(game.notes[event.payload.cell]);
    if (event.payload.enabled) notes.add(event.payload.value);
    else notes.delete(event.payload.value);
    game.notes[event.payload.cell] = [...notes].sort();
  }
  return state;
}
