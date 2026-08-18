import { replay } from '$lib/domain/reducer';
import type {
  AppProjection,
  Digit,
  GameSettings,
  ImportedCheckpoint,
  PuzzleDefinition,
  StoredEventDocumentV1,
  SudokuEvent
} from '$lib/domain/types';
import {
  CORRUPT_STORE_PREFIX,
  EVENT_STORE_KEY,
  emptyDocument,
  parseDocument,
  type EventMetadata
} from './event-store';

export const EVENT_DATABASE_NAME = 'sudoku.event-streams.v2';
export const EVENT_CHANNEL_NAME = 'sudoku.event-streams.v2';

const DATABASE_VERSION = 1;
const STREAM_STORE = 'streams';
const META_STORE = 'metadata';
const META_KEY = 'store';
const SETTINGS_STREAM = 'settings';

interface StreamRecord {
  id: string;
  revision: number;
  events: SudokuEvent[];
}

interface MetaRecord {
  id: typeof META_KEY;
  nextSequence: number;
}

export interface CommitResult {
  committed: boolean;
  gameId: string | null;
  projection: AppProjection;
}

export interface IndexedDbEventStoreLoadResult {
  store: IndexedDbEventStore;
  warning: string;
}

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction was aborted'));
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
  });
}

function streamId(gameId: string | null): string {
  return gameId ? `game:${gameId}` : SETTINGS_STREAM;
}

function documentFrom(streams: Iterable<StreamRecord>, nextSequence = 1): StoredEventDocumentV1 {
  const events = [...streams].flatMap((stream) => stream.events).sort((left, right) => left.sequence - right.sequence);
  return { storageVersion: 1, nextSequence, events };
}

function recordsFrom(document: StoredEventDocumentV1): StreamRecord[] {
  const grouped = new Map<string, SudokuEvent[]>();
  for (const event of document.events) {
    const id = streamId(event.gameId);
    grouped.set(id, [...(grouped.get(id) ?? []), event]);
  }
  return [...grouped].map(([id, events]) => ({ id, revision: events.length, events }));
}

async function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  const opening = factory.open(EVENT_DATABASE_NAME, DATABASE_VERSION);
  opening.onupgradeneeded = () => {
    const database = opening.result;
    if (!database.objectStoreNames.contains(STREAM_STORE)) database.createObjectStore(STREAM_STORE, { keyPath: 'id' });
    if (!database.objectStoreNames.contains(META_STORE)) database.createObjectStore(META_STORE, { keyPath: 'id' });
  };
  const database = await request(opening);
  database.onversionchange = () => database.close();
  return database;
}

async function readDatabase(database: IDBDatabase): Promise<{ document: StoredEventDocumentV1; streams: StreamRecord[] }> {
  const transaction = database.transaction([STREAM_STORE, META_STORE], 'readonly');
  const streamRequest = request(transaction.objectStore(STREAM_STORE).getAll() as IDBRequest<StreamRecord[]>);
  const metaRequest = request(transaction.objectStore(META_STORE).get(META_KEY) as IDBRequest<MetaRecord | undefined>);
  const [streams, meta] = await Promise.all([streamRequest, metaRequest]);
  await transactionComplete(transaction);
  return { streams, document: documentFrom(streams, meta?.nextSequence ?? 1) };
}

async function writeDocument(database: IDBDatabase, document: StoredEventDocumentV1): Promise<void> {
  const transaction = database.transaction([STREAM_STORE, META_STORE], 'readwrite');
  const streams = transaction.objectStore(STREAM_STORE);
  streams.clear();
  for (const record of recordsFrom(document)) streams.put(record);
  transaction.objectStore(META_STORE).put({ id: META_KEY, nextSequence: document.nextSequence } satisfies MetaRecord);
  await transactionComplete(transaction);
}

export class IndexedDbEventStore {
  private document: StoredEventDocumentV1;
  private projection: AppProjection;
  private revisions = new Map<string, number>();
  private warning: string;
  private pendingWrites = 0;

  constructor(
    private readonly database: IDBDatabase | null,
    private readonly storage: Storage,
    document: StoredEventDocumentV1,
    streams: StreamRecord[],
    warning = '',
    private readonly mirrorForE2E = false
  ) {
    this.document = document;
    this.projection = replay(document.events);
    this.revisions = new Map(streams.map((stream) => [stream.id, stream.revision]));
    this.warning = warning;
  }

  getProjection(): AppProjection { return structuredClone(this.projection); }
  getDocument(): StoredEventDocumentV1 { return structuredClone(this.document); }
  isPersistent(): boolean { return this.database !== null; }
  getWarning(): string { return this.warning; }

  private beginWrite(): void {
    this.pendingWrites += 1;
    if (typeof globalThis.document !== 'undefined') globalThis.document.documentElement.dataset.eventStorePending = 'true';
  }

  private endWrite(): void {
    this.pendingWrites -= 1;
    if (typeof globalThis.document !== 'undefined' && this.pendingWrites === 0) {
      globalThis.document.documentElement.dataset.eventStorePending = 'false';
    }
  }

  private updateCache(document: StoredEventDocumentV1, streams: StreamRecord[]): void {
    this.document = document;
    this.projection = replay(document.events);
    this.revisions = new Map(streams.map((stream) => [stream.id, stream.revision]));
    if (this.mirrorForE2E) this.storage.setItem(EVENT_STORE_KEY, JSON.stringify(document));
  }

  async reload(): Promise<AppProjection> {
    if (!this.database) return this.getProjection();
    try {
      const latest = await readDatabase(this.database);
      this.updateCache(latest.document, latest.streams);
    } catch {
      this.warning = 'Progress can no longer be read from this browser.';
    }
    return this.getProjection();
  }

  private async append(create: (sequence: number) => SudokuEvent): Promise<CommitResult> {
    this.beginWrite();
    try {
      return await this.appendTransaction(create);
    } finally {
      this.endWrite();
    }
  }

  private async appendTransaction(create: (sequence: number) => SudokuEvent): Promise<CommitResult> {
    const revisionSnapshot = new Map(this.revisions);
    if (!this.database) {
      const event = create(this.document.nextSequence);
      const id = streamId(event.gameId);
      const expectedRevision = revisionSnapshot.get(id) ?? 0;
      const next: StoredEventDocumentV1 = {
        storageVersion: 1,
        nextSequence: this.document.nextSequence + 1,
        events: [...this.document.events, event]
      };
      this.updateCache(next, recordsFrom(next));
      this.revisions.set(id, expectedRevision + 1);
      return { committed: true, gameId: event.gameId, projection: this.getProjection() };
    }

    let event: SudokuEvent | null = null;
    let committed = false;
    try {
      const transaction = this.database.transaction([STREAM_STORE, META_STORE], 'readwrite');
      const metadata = transaction.objectStore(META_STORE);
      const streams = transaction.objectStore(STREAM_STORE);
      const meta = await request(metadata.get(META_KEY) as IDBRequest<MetaRecord | undefined>);
      const sequence = meta?.nextSequence ?? 1;
      event = create(sequence);
      const id = streamId(event.gameId);
      const expectedRevision = revisionSnapshot.get(id) ?? 0;
      const current = await request(streams.get(id) as IDBRequest<StreamRecord | undefined>);
      if ((current?.revision ?? 0) === expectedRevision) {
        streams.put({
          id,
          revision: expectedRevision + 1,
          events: [...(current?.events ?? []), event]
        } satisfies StreamRecord);
        metadata.put({ id: META_KEY, nextSequence: sequence + 1 } satisfies MetaRecord);
        committed = true;
      }
      await transactionComplete(transaction);
    } catch {
      this.warning = 'This browser could not save that action. Your puzzle was refreshed from its last saved event.';
    }

    await this.reload();
    return { committed, gameId: event?.gameId ?? null, projection: this.getProjection() };
  }

  startGame(puzzle: PuzzleDefinition, metadata: EventMetadata): Promise<CommitResult> {
    const storedPuzzle = { ...puzzle, provenance: puzzle.provenance ? { ...puzzle.provenance } : undefined };
    const settings = { ...this.projection.settings };
    return this.append((sequence) => {
      const gameId = `game-${storedPuzzle.id}-${sequence}`;
      return {
        id: metadata.id, sequence, gameId, type: 'game/started', payload: { gameId, puzzle: storedPuzzle, settings },
        occurredAt: metadata.occurredAt.toISOString(), elapsedMs: metadata.elapsedMs ?? 0, schemaVersion: 1, reducerVersion: 1
      };
    });
  }

  importGame(
    puzzle: PuzzleDefinition,
    importKind: 'puzzle-link' | 'progress-transfer',
    transferId: string | null,
    checkpoint: ImportedCheckpoint | null,
    metadata: EventMetadata,
    importedSettings: GameSettings = this.projection.settings
  ): Promise<CommitResult> {
    if (transferId && this.findImportedGame(transferId)) {
      return Promise.resolve({ committed: false, gameId: this.findImportedGame(transferId), projection: this.getProjection() });
    }
    const storedPuzzle = { ...puzzle, provenance: puzzle.provenance ? { ...puzzle.provenance } : undefined };
    const settings = { ...importedSettings };
    return this.append((sequence) => {
      const gameId = `game-${storedPuzzle.id}-${sequence}`;
      return {
        id: metadata.id, sequence, gameId, type: 'game/imported',
        payload: {
          gameId, importKind, transferId, puzzle: storedPuzzle, settings,
          checkpoint: checkpoint ? {
            values: [...checkpoint.values], notes: checkpoint.notes.map((notes) => [...notes]),
            hintedCells: [...checkpoint.hintedCells], elapsedMs: checkpoint.elapsedMs,
            hints: checkpoint.hints, mistakes: checkpoint.mistakes, paused: true
          } : null
        },
        occurredAt: metadata.occurredAt.toISOString(), elapsedMs: checkpoint?.elapsedMs ?? 0,
        schemaVersion: 1, reducerVersion: 1
      };
    });
  }

  findImportedGame(transferId: string): string | null {
    const event = this.document.events.find((candidate) => candidate.type === 'game/imported' && candidate.payload.transferId === transferId);
    return event?.gameId ?? null;
  }

  changeSettings(changes: Partial<GameSettings>, metadata: EventMetadata): Promise<CommitResult> {
    return this.append((sequence) => ({
      id: metadata.id, sequence, gameId: null, type: 'settings/changed', payload: changes,
      occurredAt: metadata.occurredAt.toISOString(), elapsedMs: 0, schemaVersion: 1, reducerVersion: 1
    }));
  }

  enterValue(gameId: string, cell: number, value: Digit, metadata: EventMetadata): Promise<CommitResult> {
    return this.gameEvent(gameId, metadata, 'cell/value-entered', { cell, value });
  }

  toggleNote(gameId: string, cell: number, value: Digit, enabled: boolean, metadata: EventMetadata): Promise<CommitResult> {
    return this.gameEvent(gameId, metadata, 'cell/note-toggled', { cell, value, enabled });
  }

  clearCell(gameId: string, cell: number, metadata: EventMetadata): Promise<CommitResult> {
    return this.gameEvent(gameId, metadata, 'cell/cleared', { cell });
  }

  undo(gameId: string, targetEventId: string, metadata: EventMetadata): Promise<CommitResult> {
    return this.gameEvent(gameId, metadata, 'move/undone', { targetEventId });
  }

  redo(gameId: string, targetEventId: string, metadata: EventMetadata): Promise<CommitResult> {
    return this.gameEvent(gameId, metadata, 'move/redone', { targetEventId });
  }

  pause(gameId: string, metadata: EventMetadata): Promise<CommitResult> { return this.gameEvent(gameId, metadata, 'game/paused', {}); }
  resume(gameId: string, metadata: EventMetadata): Promise<CommitResult> { return this.gameEvent(gameId, metadata, 'game/resumed', {}); }
  revealHint(gameId: string, cell: number, value: Digit, metadata: EventMetadata): Promise<CommitResult> {
    return this.gameEvent(gameId, metadata, 'hint/revealed', { cell, value });
  }
  restart(gameId: string, metadata: EventMetadata): Promise<CommitResult> { return this.gameEvent(gameId, metadata, 'game/restarted', {}); }
  abandon(gameId: string, metadata: EventMetadata): Promise<CommitResult> { return this.gameEvent(gameId, metadata, 'game/abandoned', {}); }

  private gameEvent(
    gameId: string,
    metadata: EventMetadata,
    type: SudokuEvent['type'],
    payload: Record<string, unknown>
  ): Promise<CommitResult> {
    return this.append((sequence) => ({
      id: metadata.id, sequence, gameId, type, payload,
      occurredAt: metadata.occurredAt.toISOString(), elapsedMs: metadata.elapsedMs ?? 0,
      schemaVersion: 1, reducerVersion: 1
    } as SudokuEvent));
  }

  async clearAll(): Promise<AppProjection> {
    this.beginWrite();
    try {
      if (this.database) await writeDocument(this.database, emptyDocument());
      for (let index = this.storage.length - 1; index >= 0; index -= 1) {
        const key = this.storage.key(index);
        if (key?.startsWith('sudoku.')) this.storage.removeItem(key);
      }
      this.warning = '';
      this.updateCache(emptyDocument(), []);
      if (this.mirrorForE2E) this.storage.removeItem(EVENT_STORE_KEY);
      return this.getProjection();
    } finally {
      this.endWrite();
    }
  }

  async replaceDocumentForTests(document: StoredEventDocumentV1): Promise<AppProjection> {
    if (!this.mirrorForE2E) throw new Error('Test document replacement is unavailable');
    if (this.database) await writeDocument(this.database, document);
    this.updateCache(document, recordsFrom(document));
    return this.getProjection();
  }
}

export async function loadIndexedDbEventStore(
  storage: Storage,
  factory: IDBFactory | undefined,
  now = new Date(),
  mirrorForE2E = false
): Promise<IndexedDbEventStoreLoadResult> {
  if (!factory) {
    const warning = 'This browser cannot save progress. This session will continue in memory.';
    return { store: new IndexedDbEventStore(null, storage, emptyDocument(), [], warning, mirrorForE2E), warning };
  }

  try {
    const database = await openDatabase(factory);
    let current = await readDatabase(database);
    let warning = '';
    const legacy = storage.getItem(EVENT_STORE_KEY);
    if (current.document.events.length === 0 && legacy) {
      try {
        const parsed = parseDocument(legacy);
        await writeDocument(database, parsed.document);
        current = await readDatabase(database);
        storage.removeItem(EVENT_STORE_KEY);
        warning = 'Local puzzle history was safely moved to IndexedDB.';
      } catch {
        const quarantineKey = `${CORRUPT_STORE_PREFIX}${now.toISOString().replace(/[:.]/g, '-')}`;
        storage.setItem(quarantineKey, legacy);
        storage.removeItem(EVENT_STORE_KEY);
        warning = 'Unreadable puzzle history was preserved separately. A clean local store is ready.';
      }
    } else if (legacy && !mirrorForE2E) {
      storage.removeItem(EVENT_STORE_KEY);
    }
    const store = new IndexedDbEventStore(database, storage, current.document, current.streams, warning, mirrorForE2E);
    return { store, warning };
  } catch {
    const warning = 'This browser cannot save progress. This session will continue in memory.';
    return { store: new IndexedDbEventStore(null, storage, emptyDocument(), [], warning, mirrorForE2E), warning };
  }
}
