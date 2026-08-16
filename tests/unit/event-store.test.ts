import { describe, expect, it } from 'vitest';
import { generateEasyPuzzle } from '../../src/lib/generator/generate-puzzle';
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
    store.changeSettings({ checkMistakes: true, showTimer: false }, {
      occurredAt: new Date('2026-08-16T12:00:00.000Z'), id: 'settings-1'
    });
    const puzzle = generateEasyPuzzle('settings-seed').puzzle;
    const projection = store.startGame(puzzle, {
      occurredAt: new Date('2026-08-16T12:01:00.000Z'), id: 'start-2'
    });
    expect(projection.settings).toMatchObject({ checkMistakes: true, showTimer: false });
    expect(projection.games[projection.activeGameId ?? ''].settings).toEqual(projection.settings);
    expect(store.getDocument().events[0]).toMatchObject({ type: 'settings/changed', gameId: null });
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
