import { UNITS } from './sudoku';
import type {
  AppProjection,
  Digit,
  GameProjection,
  ReversibleEvent,
  SudokuEvent
} from './types';

export const emptyProjection = (): AppProjection => ({ activeGameId: null, games: {}, diagnostics: [] });

const isReversible = (event: SudokuEvent): event is ReversibleEvent =>
  event.type === 'cell/value-entered' ||
  event.type === 'cell/note-toggled' ||
  event.type === 'cell/cleared';

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

function applyMove(game: GameProjection, event: ReversibleEvent, diagnostics: string[]): void {
  if (!isEditable(game, event.payload.cell)) {
    diagnostics.push('illegal-cell-edit');
    return;
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
    return;
  }
  if (event.type === 'cell/cleared') {
    game.values[event.payload.cell] = null;
    game.notes[event.payload.cell] = [];
    return;
  }
  if (game.values[event.payload.cell] !== null) {
    diagnostics.push('notes-on-filled-cell');
    return;
  }
  const notes = new Set(game.notes[event.payload.cell]);
  if (event.payload.enabled) notes.add(event.payload.value);
  else notes.delete(event.payload.value);
  game.notes[event.payload.cell] = [...notes].sort();
}

export function replay(events: readonly SudokuEvent[]): AppProjection {
  const state = emptyProjection();
  const ids = new Set<string>();
  const valid: SudokuEvent[] = [];
  const activeStacks = new Map<string, string[]>();
  const redoStacks = new Map<string, string[]>();
  const inactive = new Set<string>();
  let expectedSequence = 1;

  for (const event of events) {
    if (ids.has(event.id) || event.sequence !== expectedSequence) {
      state.diagnostics.push('invalid-event-order');
      continue;
    }
    ids.add(event.id);
    expectedSequence += 1;
    valid.push(event);

    if (event.type === 'game/started') {
      state.games[event.gameId] = {
        id: event.gameId,
        puzzle: event.payload.puzzle,
        settings: event.payload.settings,
        startedAt: event.occurredAt,
        values: Array<Digit | null>(81).fill(null),
        notes: Array.from({ length: 81 }, () => []),
        conflicts: [],
        undoTargetId: null,
        redoTargetId: null
      };
      state.activeGameId = event.gameId;
      activeStacks.set(event.gameId, []);
      redoStacks.set(event.gameId, []);
      continue;
    }

    const active = activeStacks.get(event.gameId);
    const redo = redoStacks.get(event.gameId);
    if (!state.games[event.gameId] || !active || !redo) {
      state.diagnostics.push('event-before-game');
      continue;
    }

    if (isReversible(event)) {
      active.push(event.id);
      redo.splice(0);
      continue;
    }

    if (event.type === 'move/undone') {
      if (active.at(-1) !== event.payload.targetEventId) {
        state.diagnostics.push('invalid-undo-target');
        continue;
      }
      active.pop();
      redo.push(event.payload.targetEventId);
      inactive.add(event.payload.targetEventId);
      continue;
    }

    if (redo.at(-1) !== event.payload.targetEventId) {
      state.diagnostics.push('invalid-redo-target');
      continue;
    }
    redo.pop();
    active.push(event.payload.targetEventId);
    inactive.delete(event.payload.targetEventId);
  }

  for (const game of Object.values(state.games)) {
    for (const event of valid) {
      if (event.gameId === game.id && isReversible(event) && !inactive.has(event.id)) {
        applyMove(game, event, state.diagnostics);
      }
    }
    game.conflicts = deriveConflicts(game);
    game.undoTargetId = activeStacks.get(game.id)?.at(-1) ?? null;
    game.redoTargetId = redoStacks.get(game.id)?.at(-1) ?? null;
  }
  return state;
}
