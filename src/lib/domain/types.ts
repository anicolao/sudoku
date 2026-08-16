export type Digit = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type SolveTechnique =
  | 'naked-single'
  | 'hidden-single'
  | 'naked-pair'
  | 'pointing-pair';

export interface PuzzleDefinition {
  id: string;
  givens: string;
  solution: string;
  difficulty: 'easy';
  seed: string;
  generatorVersion: 1;
  validatorVersion: 1;
  hardestTechnique: SolveTechnique;
}

export interface GameSettings {
  checkMistakes: boolean;
  autoRemoveNotes: boolean;
  showTimer: boolean;
  numberFirst: boolean;
}

interface EventEnvelope {
  id: string;
  sequence: number;
  gameId: string;
  occurredAt: string;
  elapsedMs: number;
  schemaVersion: 1;
  reducerVersion: 1;
}

export interface GameStartedEvent extends EventEnvelope {
  type: 'game/started';
  payload: {
    gameId: string;
    puzzle: PuzzleDefinition;
    settings: GameSettings;
  };
}

export interface ValueEnteredEvent extends EventEnvelope {
  type: 'cell/value-entered';
  payload: { cell: number; value: Digit };
}

export interface NoteToggledEvent extends EventEnvelope {
  type: 'cell/note-toggled';
  payload: { cell: number; value: Digit; enabled: boolean };
}

export interface CellClearedEvent extends EventEnvelope {
  type: 'cell/cleared';
  payload: { cell: number };
}

export interface MoveUndoneEvent extends EventEnvelope {
  type: 'move/undone';
  payload: { targetEventId: string };
}

export interface MoveRedoneEvent extends EventEnvelope {
  type: 'move/redone';
  payload: { targetEventId: string };
}

export interface GamePausedEvent extends EventEnvelope {
  type: 'game/paused';
  payload: Record<string, never>;
}

export interface GameResumedEvent extends EventEnvelope {
  type: 'game/resumed';
  payload: Record<string, never>;
}

export type ReversibleEvent = ValueEnteredEvent | NoteToggledEvent | CellClearedEvent;
export type SudokuEvent =
  | GameStartedEvent
  | ReversibleEvent
  | MoveUndoneEvent
  | MoveRedoneEvent
  | GamePausedEvent
  | GameResumedEvent;

export interface GameProjection {
  id: string;
  puzzle: PuzzleDefinition;
  settings: GameSettings;
  startedAt: string;
  values: Array<Digit | null>;
  notes: Digit[][];
  conflicts: number[];
  undoTargetId: string | null;
  redoTargetId: string | null;
  paused: boolean;
  elapsedMs: number;
  resumedAt: string | null;
}

export interface AppProjection {
  activeGameId: string | null;
  games: Record<string, GameProjection>;
  diagnostics: string[];
}

export interface StoredEventDocumentV1 {
  storageVersion: 1;
  nextSequence: number;
  events: SudokuEvent[];
}
