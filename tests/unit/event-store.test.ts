import { describe, expect, it } from 'vitest';
import { generateEasyPuzzle } from '../../src/lib/generator/generate-puzzle';
import type { Digit } from '../../src/lib/domain/types';
import { CORRUPT_STORE_PREFIX, EventStore, EVENT_STORE_KEY, loadEventStore } from '../../src/lib/storage/event-store';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe('event store', () => {
  it('appends game/started atomically and reconstructs it by replay', () => {
    const storage = new MemoryStorage();
    const puzzle = generateEasyPuzzle('store-seed').puzzle;
    const store = new EventStore(storage);
    const projection = store.startGame(puzzle, {
      occurredAt: new Date('2026-08-16T12:00:00.000Z'),
      id: 'event-1'
    });
    expect(projection.activeGameId).toBe(`game-${puzzle.id}-1`);
    expect(JSON.parse(storage.getItem(EVENT_STORE_KEY) ?? '')).toMatchObject({
      storageVersion: 1,
      nextSequence: 2,
      events: [{ type: 'game/started', sequence: 1, payload: { puzzle } }]
    });
    expect(new EventStore(storage).getProjection()).toEqual(projection);
  });

  it('replays app settings and snapshots them into the next game', () => {
    const storage = new MemoryStorage();
    const store = new EventStore(storage);
    expect(store.getProjection().settings).toMatchObject({ notesBold: true, notesLarge: true });
    store.changeSettings({ checkMistakes: true, showTimer: false, notesBold: false, notesLarge: false }, {
      occurredAt: new Date('2026-08-16T12:00:00.000Z'), id: 'settings-1'
    });
    const puzzle = generateEasyPuzzle('settings-seed').puzzle;
    const projection = store.startGame(puzzle, {
      occurredAt: new Date('2026-08-16T12:01:00.000Z'), id: 'start-2'
    });
    expect(projection.settings).toMatchObject({ checkMistakes: true, showTimer: false, notesBold: false, notesLarge: false });
    expect(projection.games[projection.activeGameId ?? ''].settings).toEqual(projection.settings);
    expect(store.getDocument().events[0]).toMatchObject({ type: 'settings/changed', gameId: null });
  });

  it('opens a shared puzzle from one explicit import origin event', () => {
    const storage = new MemoryStorage();
    const generated = generateEasyPuzzle('shared-origin').puzzle;
    const puzzle = {
      ...generated,
      id: 'shared-123456789abc',
      seed: undefined,
      generatorVersion: undefined,
      validatorVersion: 3 as const,
      provenance: { kind: 'puzzle-link' as const, formatVersion: 1 as const, fingerprint: '123456789abc' }
    };
    const store = new EventStore(storage);
    const projection = store.importGame(puzzle, 'puzzle-link', null, null, {
      occurredAt: new Date('2026-08-16T12:00:00.000Z'), id: 'import-1'
    });

    expect(projection.games[projection.activeGameId ?? '']).toMatchObject({
      puzzle,
      values: Array(81).fill(null),
      paused: false,
      undoTargetId: null
    });
    expect(store.getDocument().events).toMatchObject([{
      type: 'game/imported',
      payload: { importKind: 'puzzle-link', transferId: null, checkpoint: null }
    }]);
  });

  it('imports a paused checkpoint with transferred settings exactly once', () => {
    const storage = new MemoryStorage();
    const generated = generateEasyPuzzle('transfer-origin').puzzle;
    const puzzle = {
      ...generated,
      provenance: { kind: 'progress-transfer' as const, formatVersion: 1 as const, fingerprint: 'abc123' }
    };
    const store = new EventStore(storage);
    const values = Array(81).fill(null);
    const editable = [...puzzle.givens].findIndex((value) => value === '.');
    values[editable] = Number(puzzle.solution[editable]);
    const settings = { checkMistakes: true, autoRemoveNotes: false, showTimer: false, numberFirst: false, notesFirst: true };
    const checkpoint = {
      values,
      notes: Array.from({ length: 81 }, () => []),
      hintedCells: [editable],
      elapsedMs: 12_345,
      hints: 1,
      mistakes: 2,
      paused: true as const
    };

    const first = store.importGame(puzzle, 'progress-transfer', '00112233445566778899aabb', checkpoint, {
      occurredAt: new Date('2026-08-16T12:00:00.000Z'), id: 'import-1'
    }, settings);
    const second = store.importGame(puzzle, 'progress-transfer', '00112233445566778899aabb', checkpoint, {
      occurredAt: new Date('2026-08-16T12:01:00.000Z'), id: 'import-2'
    }, settings);

    expect(second).toEqual(first);
    expect(store.getDocument().events).toHaveLength(1);
    expect(store.findImportedGame('00112233445566778899aabb')).toBe(first.activeGameId);
    expect(first.games[first.activeGameId ?? '']).toMatchObject({ paused: true, settings, elapsedMs: 12_345 });
  });

  it('derives completion when a stored transfer checkpoint is already solved', () => {
    const storage = new MemoryStorage();
    const generated = generateEasyPuzzle('complete-transfer').puzzle;
    const puzzle = {
      ...generated,
      provenance: { kind: 'progress-transfer' as const, formatVersion: 1 as const, fingerprint: 'def456' }
    };
    const values = [...puzzle.givens].map((given, cell) => given === '.' ? Number(puzzle.solution[cell]) as Digit : null);
    const store = new EventStore(storage);
    const projection = store.importGame(puzzle, 'progress-transfer', 'ffeeddccbbaa998877665544', {
      values,
      notes: Array.from({ length: 81 }, () => []),
      hintedCells: [], elapsedMs: 99_000, hints: 0, mistakes: 0, paused: true
    }, { occurredAt: new Date('2026-08-16T12:00:00.000Z'), id: 'complete-import' });

    expect(projection.games[projection.activeGameId ?? '']).toMatchObject({
      status: 'complete', paused: true, completedAt: '2026-08-16T12:00:00.000Z'
    });
  });

  it('migrates a frozen V0 document before publishing it', () => {
    const storage = new MemoryStorage();
    storage.setItem(EVENT_STORE_KEY, JSON.stringify({ storageVersion: 0, events: [] }));
    const loaded = loadEventStore(storage);
    expect(loaded.warning).toContain('safely upgraded');
    expect(JSON.parse(storage.getItem(EVENT_STORE_KEY) ?? '')).toEqual({
      storageVersion: 1, nextSequence: 1, events: []
    });
  });

  it('quarantines malformed bytes and starts a validated clean document', () => {
    const storage = new MemoryStorage();
    storage.setItem(EVENT_STORE_KEY, '{not-json');
    const loaded = loadEventStore(storage, new Date('2026-08-16T12:00:00.000Z'));
    expect(loaded.warning).toContain('preserved separately');
    expect(storage.getItem(EVENT_STORE_KEY)).toBeNull();
    expect(storage.getItem(`${CORRUPT_STORE_PREFIX}2026-08-16T12-00-00-000Z`)).toBe('{not-json');
    expect(loaded.store.getProjection().games).toEqual({});
  });

  it('continues in memory if a canonical write fails', () => {
    class FailingStorage extends MemoryStorage {
      override setItem(): void { throw new DOMException('full', 'QuotaExceededError'); }
    }
    const loaded = loadEventStore(new FailingStorage());
    expect(loaded.store.isPersistent()).toBe(false);
    const puzzle = generateEasyPuzzle('memory-seed').puzzle;
    expect(() => loaded.store.startGame(puzzle, {
      occurredAt: new Date('2026-08-16T12:00:00.000Z'), id: 'event-1'
    })).not.toThrow();
    expect(loaded.store.getProjection().activeGameId).not.toBeNull();
  });
});
