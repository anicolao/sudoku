import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { generateEasyPuzzle } from '../../src/lib/generator/generate-puzzle';
import { EVENT_STORE_KEY, MemoryStorage } from '../../src/lib/storage/event-store';
import { loadIndexedDbEventStore } from '../../src/lib/storage/indexeddb-event-store';

const at = (id: string, minute = 0) => ({
  id,
  occurredAt: new Date(`2026-08-16T12:${String(minute).padStart(2, '0')}:00.000Z`)
});

describe('IndexedDB event streams', () => {
  it('migrates the legacy flat document once and removes the canonical localStorage copy', async () => {
    const storage = new MemoryStorage();
    const legacy = {
      storageVersion: 1,
      nextSequence: 2,
      events: [{
        id: 'settings-1', sequence: 1, gameId: null, type: 'settings/changed',
        payload: { showTimer: false }, occurredAt: at('unused').occurredAt.toISOString(), elapsedMs: 0,
        schemaVersion: 1, reducerVersion: 1
      }]
    };
    storage.setItem(EVENT_STORE_KEY, JSON.stringify(legacy));

    const loaded = await loadIndexedDbEventStore(storage, new IDBFactory());

    expect(loaded.warning).toContain('moved to IndexedDB');
    expect(storage.getItem(EVENT_STORE_KEY)).toBeNull();
    expect(loaded.store.getDocument()).toEqual(legacy);
    expect(loaded.store.getProjection().settings.showTimer).toBe(false);
  });

  it('commits non-overlapping streams from independently loaded tabs', async () => {
    const factory = new IDBFactory();
    const storage = new MemoryStorage();
    const left = (await loadIndexedDbEventStore(storage, factory)).store;
    const right = (await loadIndexedDbEventStore(storage, factory)).store;
    const firstPuzzle = generateEasyPuzzle('independent-left').puzzle;
    const secondPuzzle = generateEasyPuzzle('independent-right').puzzle;

    const [first, second] = await Promise.all([
      left.startGame(firstPuzzle, at('left-start')),
      right.startGame(secondPuzzle, at('right-start'))
    ]);

    expect(first.committed).toBe(true);
    expect(second.committed).toBe(true);
    const projection = await left.reload();
    expect(Object.keys(projection.games)).toHaveLength(2);
    expect(left.getDocument().events.map((event) => event.sequence)).toEqual([1, 2]);
  });

  it('discards an overlapping event on one game and reloads the winning event', async () => {
    const factory = new IDBFactory();
    const storage = new MemoryStorage();
    const creator = (await loadIndexedDbEventStore(storage, factory)).store;
    const puzzle = generateEasyPuzzle('overlap').puzzle;
    const started = await creator.startGame(puzzle, at('start'));
    const gameId = started.gameId!;
    const firstCell = [...puzzle.givens].findIndex((given) => given === '.');
    const secondCell = [...puzzle.givens].findIndex((given, index) => given === '.' && index !== firstCell);
    const left = (await loadIndexedDbEventStore(storage, factory)).store;
    const right = (await loadIndexedDbEventStore(storage, factory)).store;

    const results = await Promise.all([
      left.enterValue(gameId, firstCell, Number(puzzle.solution[firstCell]) as 1, at('left-move', 1)),
      right.enterValue(gameId, secondCell, Number(puzzle.solution[secondCell]) as 1, at('right-move', 1))
    ]);

    expect(results.filter((result) => result.committed)).toHaveLength(1);
    expect(results.filter((result) => !result.committed)).toHaveLength(1);
    expect(left.getDocument().events).toHaveLength(2);
    expect(right.getDocument().events).toHaveLength(2);
    expect(left.getProjection()).toEqual(right.getProjection());
  });
});
