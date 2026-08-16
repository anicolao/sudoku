import { describe, expect, it } from 'vitest';
import { generateEasyPuzzle } from '../../src/lib/generator/generate-puzzle';
import { EventStore, EVENT_STORE_KEY } from '../../src/lib/storage/event-store';

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
    const projection = store.startGame(puzzle, new Date('2026-08-16T12:00:00.000Z'), 'event-1');
    expect(projection.activeGameId).toBe(`game-${puzzle.id}-1`);
    expect(JSON.parse(storage.getItem(EVENT_STORE_KEY) ?? '')).toMatchObject({
      storageVersion: 1,
      nextSequence: 2,
      events: [{ type: 'game/started', sequence: 1, payload: { puzzle } }]
    });
    expect(new EventStore(storage).getProjection()).toEqual(projection);
  });
});
