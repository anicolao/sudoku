import { replay } from '$lib/domain/reducer';
import type {
  AppProjection,
  GameStartedEvent,
  PuzzleDefinition,
  StoredEventDocumentV1
} from '$lib/domain/types';

export const EVENT_STORE_KEY = 'sudoku.event-store.v1';

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

export class EventStore {
  private document: StoredEventDocumentV1;
  private projection: AppProjection;

  constructor(private readonly storage: Storage) {
    this.document = readDocument(storage);
    this.projection = replay(this.document.events);
  }

  getProjection(): AppProjection {
    return structuredClone(this.projection);
  }

  getDocument(): StoredEventDocumentV1 {
    return structuredClone(this.document);
  }

  startGame(puzzle: PuzzleDefinition, now: Date, id: string): AppProjection {
    const latest = readDocument(this.storage);
    const gameId = `game-${puzzle.id}-${latest.nextSequence}`;
    const event: GameStartedEvent = {
      id,
      sequence: latest.nextSequence,
      gameId,
      type: 'game/started',
      payload: { gameId, puzzle },
      occurredAt: now.toISOString(),
      elapsedMs: 0,
      schemaVersion: 1,
      reducerVersion: 1
    };
    const next: StoredEventDocumentV1 = {
      ...latest,
      nextSequence: latest.nextSequence + 1,
      events: [...latest.events, event]
    };
    this.storage.setItem(EVENT_STORE_KEY, JSON.stringify(next));
    this.document = next;
    this.projection = replay(next.events);
    return this.getProjection();
  }
}
