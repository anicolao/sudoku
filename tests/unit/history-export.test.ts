import { IDBFactory } from 'fake-indexeddb';
import { expect, test } from 'vitest';
import { replay } from '../../src/lib/domain/reducer';
import { generateEasyPuzzle } from '../../src/lib/generator/generate-puzzle';
import { generateKillerPuzzle } from '../../src/lib/generator/killer-puzzle';
import { serializeHistory } from '../../src/lib/export/history-export';
import { MemoryStorage } from '../../src/lib/storage/event-store';
import { loadIndexedDbEventStore } from '../../src/lib/storage/indexeddb-event-store';

const at = (id: string) => ({ id, occurredAt: new Date('2026-09-21T12:00:00Z'), elapsedMs: 1234 });
const metadata = { exportedAt: new Date('2026-09-21T12:05:00Z'), appVersion: '0.1.0', appRevision: 'test', persistent: true };

test('exports every stream, including a missed other-tab write and a pending local move, without rewriting events', async () => {
  const storage = new MemoryStorage(), factory = new IDBFactory();
  const left = (await loadIndexedDbEventStore(storage, factory)).store;
  const right = (await loadIndexedDbEventStore(storage, factory)).store;
  const classic = generateEasyPuzzle('export').puzzle;
  const killer = generateKillerPuzzle('walkthrough-seed').puzzle;
  await left.changeSettings({ showTimer: false }, at('settings'));
  const classicId = (await left.startGame(classic, at('classic'))).gameId!;
  await left.abandon(classicId, at('abandon'));
  const killerId = (await right.startGame(killer, at('killer'))).gameId!;
  await right.toggleNote(killerId, 0, 1, true, at('note'));
  await right.undo(killerId, 'note', at('undo'));
  await right.redo(killerId, 'note', at('redo'));
  const pending = left.revealHint(killerId, 0, Number(killer.solution[0]) as 1, at('hint'));
  const snapshot = await left.snapshotForExport();
  await pending;
  const exported = JSON.parse(serializeHistory(snapshot, metadata));
  expect(exported.format).toBe('sudoku-history');
  expect(exported.formatVersion).toBe(1);
  expect(exported.coverage.includesSolutions).toBe(true);
  expect(exported.eventDocument).toEqual(left.getDocument());
  expect(exported.eventDocument.events.map((event: { id: string }) => event.id)).toEqual(['settings', 'classic', 'abandon', 'killer', 'note', 'undo', 'redo', 'hint']);
  const restored = replay(exported.eventDocument.events);
  expect(restored).toEqual(left.getProjection());
  expect(restored.games[killerId].puzzle.cages).toEqual(killer.cages);
  expect(restored.games[classicId].puzzle.solution).toBe(classic.solution);
  expect(restored.diagnostics).toEqual([]);
  expect(await left.snapshotForExport()).toEqual(snapshot);
}, 30_000);

test('empty and memory-only exports remain valid and explicitly scoped', async () => {
  const { store } = await loadIndexedDbEventStore(new MemoryStorage(), undefined);
  const empty = JSON.parse(serializeHistory(await store.snapshotForExport(), { ...metadata, persistent: false }));
  expect(empty.storage).toBe('memory-only');
  expect(empty.eventDocument.events).toEqual([]);
  const pending = store.startGame(generateEasyPuzzle('memory-export').puzzle, at('memory'));
  const snapshot = await store.snapshotForExport();
  await pending;
  expect(snapshot.events).toHaveLength(1);
  expect(Object.keys(replay(snapshot.events).games)).toHaveLength(1);
});

test('a failed database read rejects rather than silently exporting the cached history', async () => {
  const { store } = await loadIndexedDbEventStore(new MemoryStorage(), new IDBFactory());
  (store as unknown as { database: IDBDatabase }).database.close();
  await expect(store.snapshotForExport()).rejects.toThrow();
});
