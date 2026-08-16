import { replay } from '$lib/domain/reducer';
import type {
  AppProjection,
  Digit,
  GameSettings,
  PuzzleDefinition,
  StoredEventDocumentV1,
  SudokuEvent
} from '$lib/domain/types';

export const EVENT_STORE_KEY = 'sudoku.event-store.v1';

const DEFAULT_SETTINGS: GameSettings = {
  checkMistakes: false,
  autoRemoveNotes: true,
  showTimer: true,
  numberFirst: true
};

const emptyDocument = (): StoredEventDocumentV1 => ({ storageVersion: 1, nextSequence: 1, events: [] });

function readDocument(storage: Storage): StoredEventDocumentV1 {
  const raw = storage.getItem(EVENT_STORE_KEY);
  if (!raw) return emptyDocument();
  const parsed = JSON.parse(raw) as StoredEventDocumentV1;
  if (parsed.storageVersion !== 1 || !Array.isArray(parsed.events) || !Number.isInteger(parsed.nextSequence)) {
    throw new Error('This puzzle history cannot be opened safely');
  }
  return parsed;
}

export interface EventMetadata {
  id: string;
  occurredAt: Date;
  elapsedMs?: number;
}

export class EventStore {
  private document: StoredEventDocumentV1;
  private projection: AppProjection;

  constructor(private readonly storage: Storage) {
    this.document = readDocument(storage);
    this.projection = replay(this.document.events);
  }

  getProjection(): AppProjection { return structuredClone(this.projection); }
  getDocument(): StoredEventDocumentV1 { return structuredClone(this.document); }

  private append(
    metadata: EventMetadata,
    create: (sequence: number) => SudokuEvent
  ): AppProjection {
    const latest = readDocument(this.storage);
    const event = create(latest.nextSequence);
    const next: StoredEventDocumentV1 = {
      storageVersion: 1,
      nextSequence: latest.nextSequence + 1,
      events: [...latest.events, event]
    };
    this.storage.setItem(EVENT_STORE_KEY, JSON.stringify(next));
    this.document = next;
    this.projection = replay(next.events);
    return this.getProjection();
  }

  startGame(puzzle: PuzzleDefinition, metadata: EventMetadata): AppProjection {
    return this.append(metadata, (sequence) => {
      const gameId = `game-${puzzle.id}-${sequence}`;
      return {
        id: metadata.id,
        sequence,
        gameId,
        type: 'game/started',
        payload: { gameId, puzzle, settings: DEFAULT_SETTINGS },
        occurredAt: metadata.occurredAt.toISOString(),
        elapsedMs: metadata.elapsedMs ?? 0,
        schemaVersion: 1,
        reducerVersion: 1
      };
    });
  }

  enterValue(gameId: string, cell: number, value: Digit, metadata: EventMetadata): AppProjection {
    return this.append(metadata, (sequence) => ({
      id: metadata.id,
      sequence,
      gameId,
      type: 'cell/value-entered',
      payload: { cell, value },
      occurredAt: metadata.occurredAt.toISOString(),
      elapsedMs: metadata.elapsedMs ?? 0,
      schemaVersion: 1,
      reducerVersion: 1
    }));
  }

  toggleNote(
    gameId: string,
    cell: number,
    value: Digit,
    enabled: boolean,
    metadata: EventMetadata
  ): AppProjection {
    return this.append(metadata, (sequence) => ({
      id: metadata.id,
      sequence,
      gameId,
      type: 'cell/note-toggled',
      payload: { cell, value, enabled },
      occurredAt: metadata.occurredAt.toISOString(),
      elapsedMs: metadata.elapsedMs ?? 0,
      schemaVersion: 1,
      reducerVersion: 1
    }));
  }
}
