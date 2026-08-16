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

export interface GameStartedEvent {
  id: string;
  sequence: number;
  gameId: string;
  type: 'game/started';
  payload: {
    gameId: string;
    puzzle: PuzzleDefinition;
  };
  occurredAt: string;
  elapsedMs: number;
  schemaVersion: 1;
  reducerVersion: 1;
}

export type SudokuEvent = GameStartedEvent;

export interface GameProjection {
  id: string;
  puzzle: PuzzleDefinition;
  startedAt: string;
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
