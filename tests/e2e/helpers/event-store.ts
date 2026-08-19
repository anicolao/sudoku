import { expect, type Page } from '@playwright/test';
import type { SudokuEvent } from '../../../src/lib/domain/types';

type StoredEventOfType<T extends SudokuEvent['type']> = Extract<SudokuEvent, { type: T }>;

export async function waitForStoredEvent<T extends SudokuEvent['type']>(
  page: Page,
  type: T
): Promise<StoredEventOfType<T>> {
  const readEvent = () => page.evaluate((eventType) => {
    const raw = localStorage.getItem('sudoku.event-store.v1');
    if (!raw) return null;
    const document = JSON.parse(raw) as { events?: SudokuEvent[] };
    if (!Array.isArray(document.events)) return null;
    return document.events.find((event) => event.type === eventType) ?? null;
  }, type);

  await expect.poll(readEvent).not.toBeNull();
  const event = await readEvent();
  if (!event) throw new Error(`No ${type} event was committed`);
  return event as StoredEventOfType<T>;
}
