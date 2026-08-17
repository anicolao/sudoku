export type Digit = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type PuzzleDifficulty =
  | 'foundations'
  | 'intermediate'
  | 'advanced'
  | 'expert'
  | 'master';

export type PuzzleRating = PuzzleDifficulty | 'custom';

export type PuzzleProvenance =
  | { kind: 'generated'; seed: string; generatorVersion: 1 | 2 }
  | { kind: 'puzzle-link'; formatVersion: 1; fingerprint: string }
  | { kind: 'progress-transfer'; formatVersion: 1; fingerprint: string };

export type SolveTechnique =
  | 'naked-single'
  | 'hidden-single'
  | 'naked-pair'
  | 'hidden-pair'
  | 'pointing-pair'
  | 'box-line-reduction'
  | 'naked-triple'
  | 'hidden-triple'
  | 'x-wing'
  | 'swordfish'
  | 'y-wing'
  | 'single-digit-chain'
  | 'simple-colors'
  | 'xy-chain'
  | 'medusa'
  | 'unique-rectangle';

export interface PuzzleDefinition {
  id: string;
  givens: string;
  solution: string;
  difficulty: PuzzleRating;
  seed?: string;
  generatorVersion?: 1 | 2;
  validatorVersion: 1 | 2 | 3;
  hardestTechnique: SolveTechnique | null;
  provenance?: PuzzleProvenance;
}

export interface GameSettings {
  checkMistakes: boolean;
  autoRemoveNotes: boolean;
  showTimer: boolean;
  numberFirst: boolean;
}

interface EventEnvelope<GameId extends string | null = string> {
  id: string;
  sequence: number;
  gameId: GameId;
  occurredAt: string;
  elapsedMs: number;
  schemaVersion: 1;
  reducerVersion: 1;
}

export interface SettingsChangedEvent extends EventEnvelope<null> {
  type: 'settings/changed';
  payload: Partial<GameSettings>;
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

export interface HintRevealedEvent extends EventEnvelope {
  type: 'hint/revealed';
  payload: { cell: number; value: Digit };
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

export interface GameRestartedEvent extends EventEnvelope {
  type: 'game/restarted';
  payload: Record<string, never>;
}

export interface GameAbandonedEvent extends EventEnvelope {
  type: 'game/abandoned';
  payload: Record<string, never>;
}

export type ReversibleEvent =
  | ValueEnteredEvent
  | NoteToggledEvent
  | CellClearedEvent
  | HintRevealedEvent;
export type SudokuEvent =
  | SettingsChangedEvent
  | GameStartedEvent
  | ReversibleEvent
  | MoveUndoneEvent
  | MoveRedoneEvent
  | GamePausedEvent
  | GameResumedEvent
  | GameRestartedEvent
  | GameAbandonedEvent;

export interface GameProjection {
  id: string;
  puzzle: PuzzleDefinition;
  settings: GameSettings;
  startedAt: string;
  values: Array<Digit | null>;
  notes: Digit[][];
  conflicts: number[];
  mistakeCells: number[];
  undoTargetId: string | null;
  redoTargetId: string | null;
  paused: boolean;
  elapsedMs: number;
  resumedAt: string | null;
  status: 'active' | 'complete' | 'abandoned';
  hints: number;
  mistakes: number;
  hintedCells: number[];
  completedAt: string | null;
}

export interface AppProjection {
  settings: GameSettings;
  activeGameId: string | null;
  games: Record<string, GameProjection>;
  diagnostics: string[];
}

export interface StoredEventDocumentV1 {
  storageVersion: 1;
  nextSequence: number;
  events: SudokuEvent[];
}
