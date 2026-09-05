import { givensAgree, isSolvedGrid, parseGrid, UNITS } from './sudoku';
import type {
  AppProjection,
  Digit,
  GameProjection,
  GameSettings,
  ImportedCheckpoint,
  ImportedPuzzleMetadata,
  ImportedPuzzleWorkAction,
  PuzzleDefinition,
  GameImportedEvent,
  ReversibleEvent,
  SudokuEvent
} from './types';

export const DEFAULT_SETTINGS = {
  checkMistakes: false,
  autoRemoveNotes: true,
  showTimer: true,
  numberFirst: true,
  notesFirst: false,
  notesBold: true,
  notesLarge: true,
  highlightMatchingNotes: true
} as const;

export const emptyProjection = (): AppProjection => ({
  settings: { ...DEFAULT_SETTINGS }, activeGameId: null, games: {}, diagnostics: []
});

const isReversible = (event: SudokuEvent): event is ReversibleEvent =>
  event.type === 'cell/value-entered' ||
  event.type === 'cell/note-toggled' ||
  event.type === 'cell/notes-filled' ||
  event.type === 'cell/cleared' ||
  event.type === 'cell/value-erased' ||
  event.type === 'hint/revealed' ||
  event.type === 'game/restarted';

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

function validSettings(settings: GameSettings): boolean {
  const record = settings as unknown as Record<string, unknown>;
  return ['checkMistakes', 'autoRemoveNotes', 'showTimer', 'numberFirst']
    .every((key) => typeof record[key] === 'boolean') &&
    (record.notesFirst === undefined || typeof record.notesFirst === 'boolean') &&
    (record.notesBold === undefined || typeof record.notesBold === 'boolean') &&
    (record.notesLarge === undefined || typeof record.notesLarge === 'boolean') &&
    (record.highlightMatchingNotes === undefined || typeof record.highlightMatchingNotes === 'boolean') &&
    Object.keys(record).every((key) => key in DEFAULT_SETTINGS);
}

function validImportedCheckpoint(
  puzzle: PuzzleDefinition,
  settings: GameSettings,
  checkpoint: ImportedCheckpoint | null
): boolean {
  try {
    if (!validSettings(settings) || !isSolvedGrid(parseGrid(puzzle.solution)) ||
      !givensAgree(puzzle.givens, puzzle.solution)) return false;
    if (!checkpoint) return true;
    if (!checkpoint.paused || checkpoint.values.length !== 81 || checkpoint.notes.length !== 81 ||
      !Number.isSafeInteger(checkpoint.elapsedMs) || checkpoint.elapsedMs < 0 ||
      !Number.isSafeInteger(checkpoint.hints) || checkpoint.hints < 0 ||
      !Number.isSafeInteger(checkpoint.mistakes) || checkpoint.mistakes < 0) return false;
    const hints = new Set(checkpoint.hintedCells);
    if (hints.size !== checkpoint.hintedCells.length ||
      [...hints].some((cell) => !Number.isInteger(cell) || cell < 0 || cell >= 81)) return false;
    for (let cell = 0; cell < 81; cell += 1) {
      const value = checkpoint.values[cell];
      const notes = checkpoint.notes[cell];
      if (value !== null && (!Number.isInteger(value) || value < 1 || value > 9)) return false;
      if (!Array.isArray(notes) || new Set(notes).size !== notes.length ||
        notes.some((note) => !Number.isInteger(note) || note < 1 || note > 9)) return false;
      if (puzzle.givens[cell] !== '.' && (value !== null || notes.length > 0)) return false;
      if (value !== null && notes.length > 0) return false;
      if (hints.has(cell) && value !== Number(puzzle.solution[cell])) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function validImportOrigin(event: GameImportedEvent): boolean {
  if (event.payload.importKind === 'camera-photo') {
    return event.payload.transferId === null && event.payload.checkpoint === null &&
      event.payload.work === undefined && event.payload.sharedMetadata === undefined &&
      event.payload.initialView === undefined &&
      event.payload.puzzle.provenance?.kind === 'camera-photo' &&
      event.payload.puzzle.provenance.recognizerVersion === 1 &&
      /^[0-9a-f]{64}$/.test(event.payload.puzzle.provenance.fingerprint);
  }
  if (event.payload.importKind === 'puzzle-link') {
    if (event.payload.transferId !== null || event.payload.checkpoint !== null ||
      event.payload.puzzle.provenance?.kind !== 'puzzle-link') return false;
    const version = event.payload.puzzle.provenance.formatVersion;
    if (version === 1) return event.payload.work === undefined && event.payload.sharedMetadata === undefined &&
      event.payload.initialView === undefined;
    if (version === 2) return event.payload.sharedMetadata === undefined &&
      (event.payload.initialView === undefined || event.payload.initialView === 'walkthrough') &&
      Array.isArray(event.payload.work) && event.payload.work.length > 0 &&
      validImportedWork(event.payload.puzzle, event.payload.work) &&
      (event.payload.initialView !== 'walkthrough' || event.payload.work.some((action) => action.type === 'value'));
    if (version !== 3) return false;
    if (event.payload.initialView !== undefined && event.payload.initialView !== 'walkthrough') return false;
    if (event.payload.initialView === 'walkthrough' &&
      (!Array.isArray(event.payload.work) || !event.payload.work.some((action) => action.type === 'value'))) return false;
    return (event.payload.work === undefined ||
      (Array.isArray(event.payload.work) && validImportedWork(event.payload.puzzle, event.payload.work))) &&
      validImportedMetadata(event.payload.puzzle, event.payload.settings, event.payload.sharedMetadata);
  }
  return /^[0-9a-f]{24}$/.test(event.payload.transferId ?? '') && event.payload.checkpoint !== null &&
    event.payload.work === undefined && event.payload.sharedMetadata === undefined && event.payload.initialView === undefined &&
    event.payload.puzzle.provenance?.kind === 'progress-transfer';
}

function validImportedMetadata(
  puzzle: PuzzleDefinition,
  settings: GameSettings,
  metadata: ImportedPuzzleMetadata | undefined
): boolean {
  if (!metadata || typeof metadata !== 'object') return false;
  const record = metadata as unknown as Record<string, unknown>;
  if (Object.keys(record).length === 0 ||
    Object.keys(record).some((key) => !['elapsedMs', 'hintedCells', 'mistakes', 'settings'].includes(key))) return false;
  if (metadata.elapsedMs !== undefined && (!Number.isSafeInteger(metadata.elapsedMs) ||
    metadata.elapsedMs < 0 || metadata.elapsedMs > 365 * 24 * 60 * 60 * 1_000)) return false;
  if (metadata.mistakes !== undefined && (!Number.isSafeInteger(metadata.mistakes) ||
    metadata.mistakes < 0 || metadata.mistakes > 1_000_000)) return false;
  if (metadata.settings !== undefined) {
    if (!metadata.settings || typeof metadata.settings !== 'object' || Array.isArray(metadata.settings)) return false;
    const sharedSettings = metadata.settings as Record<string, unknown>;
    if (Object.keys(sharedSettings).length === 0 ||
      Object.keys(sharedSettings).some((key) => !(key in DEFAULT_SETTINGS)) ||
      Object.entries(sharedSettings).some(([key, value]) => typeof value !== 'boolean' || settings[key as keyof GameSettings] !== value)) {
      return false;
    }
  }
  if (metadata.hintedCells !== undefined) {
    if (!Array.isArray(metadata.hintedCells) || metadata.hintedCells.length === 0 ||
      new Set(metadata.hintedCells).size !== metadata.hintedCells.length) return false;
    if (metadata.hintedCells.some((cell) => !Number.isInteger(cell) || cell < 0 || cell >= 81 ||
      puzzle.givens[cell] !== '.')) return false;
  }
  return true;
}

function validImportedWork(
  puzzle: PuzzleDefinition,
  work: readonly ImportedPuzzleWorkAction[]
): boolean {
  if (work.length > 512) return false;
  const values = Array<Digit | null>(81).fill(null);
  for (const action of work) {
    if (!action || typeof action !== 'object' || !Number.isInteger(action.cell) ||
      action.cell < 0 || action.cell >= 81 || puzzle.givens[action.cell] !== '.') return false;
    if (action.type === 'value') {
      if (Object.keys(action).some((key) => !['type', 'cell', 'value'].includes(key)) ||
        !Number.isInteger(action.value) || action.value < 1 || action.value > 9) return false;
      values[action.cell] = action.value;
      continue;
    }
    if (action.type !== 'notes' || Object.keys(action).some((key) => !['type', 'cell', 'values', 'enabled'].includes(key)) ||
      typeof action.enabled !== 'boolean' || !Array.isArray(action.values) || action.values.length === 0 ||
      new Set(action.values).size !== action.values.length ||
      action.values.some((value) => !Number.isInteger(value) || value < 1 || value > 9) ||
      values[action.cell] !== null) return false;
  }
  return true;
}

function applyImportedWork(game: GameProjection, work: readonly ImportedPuzzleWorkAction[]): void {
  for (const action of work) {
    if (action.type === 'value') {
      game.values[action.cell] = action.value;
      game.notes[action.cell] = [];
      continue;
    }
    const notes = new Set(game.notes[action.cell]);
    action.values.forEach((value) => action.enabled ? notes.add(value) : notes.delete(value));
    game.notes[action.cell] = [...notes].sort();
  }
}

function applyMove(game: GameProjection, event: ReversibleEvent, diagnostics: string[]): void {
  if (event.type === 'game/restarted') return;
  if (!isEditable(game, event.payload.cell)) {
    diagnostics.push('illegal-cell-edit');
    return;
  }
  if (event.type === 'cell/value-entered') {
    game.values[event.payload.cell] = event.payload.value;
    game.valueSourceEventIds[event.payload.cell] = event.id;
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
    game.valueSourceEventIds[event.payload.cell] = null;
    game.notes[event.payload.cell] = [];
    game.hintedCells.push(event.payload.cell);
    return;
  }
  if (event.type === 'cell/cleared') {
    game.values[event.payload.cell] = null;
    game.valueSourceEventIds[event.payload.cell] = null;
    game.notes[event.payload.cell] = [];
    return;
  }
  if (event.type === 'cell/value-erased') return;
  if (event.type === 'cell/notes-filled') {
    if (game.values[event.payload.cell] !== null) {
      diagnostics.push('notes-on-filled-cell');
      return;
    }
    const values = event.payload.values ?? [1, 2, 3, 4, 5, 6, 7, 8, 9];
    if (!Array.isArray(values) || new Set(values).size !== values.length ||
      values.some((value) => !Number.isInteger(value) || value < 1 || value > 9)) {
      diagnostics.push('invalid-notes-filled');
      return;
    }
    const notes = new Set(game.notes[event.payload.cell]);
    values.forEach((value) => notes.add(value));
    game.notes[event.payload.cell] = [...notes].sort();
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
      if (event.type === 'game/imported' &&
        (!validImportOrigin(event) || !validImportedCheckpoint(event.payload.puzzle, event.payload.settings, checkpoint))) {
        state.diagnostics.push('invalid-import');
        continue;
      }
      state.games[event.gameId] = {
        id: event.gameId,
        puzzle: event.payload.puzzle,
        settings: { ...DEFAULT_SETTINGS, ...event.payload.settings },
        startedAt: event.occurredAt,
        values: checkpoint ? structuredClone(checkpoint.values) : Array<Digit | null>(81).fill(null),
        valueSourceEventIds: Array<string | null>(81).fill(null),
        notes: checkpoint ? structuredClone(checkpoint.notes) : Array.from({ length: 81 }, () => []),
        conflicts: [],
        mistakeCells: [],
        undoTargetId: null,
        redoTargetId: null,
        paused: checkpoint?.paused ?? false,
        elapsedMs: checkpoint?.elapsedMs ?? (event.type === 'game/imported' ? event.payload.sharedMetadata?.elapsedMs : undefined) ?? 0,
        resumedAt: checkpoint ? null : event.occurredAt,
        status: 'active',
        hints: checkpoint?.hints ?? (event.type === 'game/imported' ? event.payload.sharedMetadata?.hintedCells?.length : undefined) ?? 0,
        mistakes: checkpoint?.mistakes ?? (event.type === 'game/imported' ? event.payload.sharedMetadata?.mistakes : undefined) ?? 0,
        hintedCells: checkpoint ? [...checkpoint.hintedCells] :
          event.type === 'game/imported' ? [...(event.payload.sharedMetadata?.hintedCells ?? [])] : [],
        completedAt: null
      };
      state.activeGameId = event.gameId;
      activeStacks.set(event.gameId, []);
      redoStacks.set(event.gameId, []);
      const importedGame = state.games[event.gameId];
      if (event.type === 'game/imported' && event.payload.work) {
        applyImportedWork(importedGame, event.payload.work);
      }
      const importedBoard = [...importedGame.puzzle.givens].map((given, cell) =>
        given === '.' ? importedGame.values[cell] : Number(given)
      ).join('');
      if (importedBoard === importedGame.puzzle.solution) {
        importedGame.status = 'complete';
        importedGame.paused = true;
        importedGame.resumedAt = null;
        importedGame.completedAt = event.occurredAt;
      }
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

  const eventsById = new Map(valid.map((event) => [event.id, event]));
  const erasedValueEvents = new Set<string>();
  for (const event of valid) {
    if (event.type !== 'cell/value-erased' || inactive.has(event.id)) continue;
    const target = eventsById.get(event.payload.targetEventId);
    if (!target || target.type !== 'cell/value-entered' || target.gameId !== event.gameId ||
      target.payload.cell !== event.payload.cell || target.payload.value !== event.payload.value ||
      target.sequence >= event.sequence || inactive.has(target.id) || erasedValueEvents.has(target.id)) {
      state.diagnostics.push('invalid-value-erase-target');
      continue;
    }
    erasedValueEvents.add(target.id);
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
        if (inactive.has(event.id)) continue;
        game.values.fill(null);
        game.valueSourceEventIds.fill(null);
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
      if (isReversible(event) && !inactive.has(event.id) && !erasedValueEvents.has(event.id) && game.status === 'active') {
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
