import { UNITS } from './sudoku';
import type {
  AppProjection,
  Digit,
  GameProjection,
  ReversibleEvent,
  SudokuEvent
} from './types';

export const DEFAULT_SETTINGS = {
  checkMistakes: false,
  autoRemoveNotes: true,
  showTimer: true,
  numberFirst: true
} as const;

export const emptyProjection = (): AppProjection => ({
  settings: { ...DEFAULT_SETTINGS }, activeGameId: null, games: {}, diagnostics: []
});

const isReversible = (event: SudokuEvent): event is ReversibleEvent =>
  event.type === 'cell/value-entered' ||
  event.type === 'cell/note-toggled' ||
  event.type === 'cell/cleared' ||
  event.type === 'hint/revealed';

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
  if (event.type === 'hint/revealed') {
    if (event.payload.value !== Number(game.puzzle.solution[event.payload.cell])) {
      diagnostics.push('invalid-hint-value');
      return;
    }
    game.values[event.payload.cell] = event.payload.value;
    game.notes[event.payload.cell] = [];
    game.hintedCells.push(event.payload.cell);
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

    if (event.type === 'settings/changed') {
      const changes = event.payload;
      if (Object.values(changes).some((value) => typeof value !== 'boolean')) {
        state.diagnostics.push('invalid-settings');
      } else {
        state.settings = { ...state.settings, ...changes };
      }
      continue;
    }

    if (event.type === 'game/started' || event.type === 'game/imported') {
      const checkpoint = event.type === 'game/imported' ? event.payload.checkpoint : null;
      state.games[event.gameId] = {
        id: event.gameId,
        puzzle: event.payload.puzzle,
        settings: event.payload.settings,
        startedAt: event.occurredAt,
        values: checkpoint ? structuredClone(checkpoint.values) : Array<Digit | null>(81).fill(null),
        notes: checkpoint ? structuredClone(checkpoint.notes) : Array.from({ length: 81 }, () => []),
        conflicts: [],
        mistakeCells: [],
        undoTargetId: null,
        redoTargetId: null,
        paused: checkpoint?.paused ?? false,
        elapsedMs: checkpoint?.elapsedMs ?? 0,
        resumedAt: checkpoint ? null : event.occurredAt,
        status: 'active',
        hints: checkpoint?.hints ?? 0,
        mistakes: checkpoint?.mistakes ?? 0,
        hintedCells: checkpoint ? [...checkpoint.hintedCells] : [],
        completedAt: null
      };
      state.activeGameId = event.gameId;
      activeStacks.set(event.gameId, []);
      redoStacks.set(event.gameId, []);
      continue;
    }

    const active = event.gameId ? activeStacks.get(event.gameId) : undefined;
    const redo = event.gameId ? redoStacks.get(event.gameId) : undefined;
    if (!event.gameId || !state.games[event.gameId] || !active || !redo) {
      state.diagnostics.push('event-before-game');
      continue;
    }

    if (isReversible(event)) {
      active.push(event.id);
      redo.splice(0);
      continue;
    }

    if (event.type === 'game/paused' || event.type === 'game/resumed') continue;
    if (event.type === 'game/restarted') {
      active.splice(0);
      redo.splice(0);
      continue;
    }
    if (event.type === 'game/abandoned') continue;

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
      if (event.gameId !== game.id || event.type === 'game/started' || event.type === 'game/imported') continue;
      if (event.type === 'game/paused') {
        if (game.paused || event.elapsedMs < game.elapsedMs) state.diagnostics.push('invalid-pause');
        else {
          game.elapsedMs = event.elapsedMs;
          game.resumedAt = null;
          game.paused = true;
        }
        continue;
      }
      if (event.type === 'game/resumed') {
        if (!game.paused || event.elapsedMs < game.elapsedMs) state.diagnostics.push('invalid-resume');
        else {
          game.elapsedMs = event.elapsedMs;
          game.resumedAt = event.occurredAt;
          game.paused = false;
        }
        continue;
      }
      if (event.type === 'game/restarted') {
        game.values.fill(null);
        game.notes = Array.from({ length: 81 }, () => []);
        game.conflicts = [];
        game.hintedCells = [];
        game.hints = 0;
        game.mistakes = 0;
        game.status = 'active';
        game.completedAt = null;
        continue;
      }
      if (event.type === 'game/abandoned') {
        game.status = 'abandoned';
        game.paused = true;
        game.resumedAt = null;
        continue;
      }
      if (!game.paused && event.elapsedMs >= game.elapsedMs) {
        game.elapsedMs = event.elapsedMs;
        game.resumedAt = event.occurredAt;
      }
      if (event.type === 'hint/revealed') game.hints += 1;
      if (event.type === 'cell/value-entered' && game.settings.checkMistakes && event.payload.value !== Number(game.puzzle.solution[event.payload.cell])) {
        game.mistakes += 1;
      }
      if (isReversible(event) && !inactive.has(event.id) && game.status === 'active') {
        applyMove(game, event, state.diagnostics);
        const board = [...game.puzzle.givens].map((given, cell) =>
          given === '.' ? game.values[cell] : Number(given)
        ).join('');
        if (board === game.puzzle.solution) {
          game.status = 'complete';
          game.completedAt = event.occurredAt;
          game.elapsedMs = event.elapsedMs;
          game.resumedAt = null;
        }
      }
    }
    game.conflicts = deriveConflicts(game);
    game.mistakeCells = game.settings.checkMistakes
      ? game.values.flatMap((value, cell) => value !== null && value !== Number(game.puzzle.solution[cell]) ? [cell] : [])
      : [];
    game.undoTargetId = activeStacks.get(game.id)?.at(-1) ?? null;
    game.redoTargetId = redoStacks.get(game.id)?.at(-1) ?? null;
  }
  return state;
}
