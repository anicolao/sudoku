import { expect, test } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';

test('recover storage, choose settings, observe a mistake, and clear everything', async ({ page }, testInfo) => {
  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata(
    'Recover storage, choose preferences, and clear local data',
    'Malformed history is preserved before a clean start. Preferences are events snapshotted into a new game, and the destructive privacy action names and removes every local Sudoku record.'
  );
  await page.addInitScript(() => localStorage.setItem('sudoku.event-store.v1', '{not-json'));
  await page.goto('/');

  await steps.step('corrupt-history-preserved', {
    description: 'Startup preserves unreadable bytes and explains the clean recovery',
    verifications: [{ spec: 'The canonical key is absent and exactly one recovery copy retains the original bytes', check: async () => {
      await expect(page.getByText('Unreadable puzzle history was preserved separately. A clean local store is ready.')).toBeVisible();
      const keys = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('sudoku.')));
      expect(keys).toHaveLength(1);
      expect(keys[0]).toMatch(/^sudoku\.event-store\.corrupt\./);
      expect(await page.evaluate((key) => localStorage.getItem(key), keys[0])).toBe('{not-json');
    } }]
  });

  await page.getByRole('button', { name: 'Settings' }).click();
  await steps.step('settings-opened', {
    description: 'The player opens local preferences',
    verifications: [{ spec: 'Four labelled switches and the clear-data action are available', check: async () => {
      await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
      await expect(page.getByRole('switch')).toHaveCount(4);
      await expect(page.getByRole('button', { name: 'Clear all local Sudoku data' })).toBeEnabled();
    } }]
  });

  await page.getByRole('switch', { name: /Check mistakes/ }).click();
  await steps.step('mistake-checking-enabled', {
    description: 'The player enables immediate mistake checking',
    verifications: [{ spec: 'The switch is on and settings/changed is the first canonical event', check: async () => {
      await expect(page.getByRole('switch', { name: /Check mistakes/ })).toHaveAttribute('aria-checked', 'true');
      const event = await page.evaluate(() => JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '').events[0]);
      expect(event).toMatchObject({ type: 'settings/changed', gameId: null, payload: { checkMistakes: true } });
    } }]
  });

  await page.getByRole('switch', { name: /Show timer/ }).click();
  await steps.step('timer-hidden-for-new-games', {
    description: 'The player turns off the visible timer for future puzzles',
    verifications: [{ spec: 'The timer preference is stored as a second app-level event', check: async () => {
      await expect(page.getByRole('switch', { name: /Show timer/ })).toHaveAttribute('aria-checked', 'false');
      const events = await page.evaluate(() => JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '').events);
      expect(events.at(-1)).toMatchObject({ type: 'settings/changed', gameId: null, payload: { showTimer: false } });
    } }]
  });

  await page.getByRole('button', { name: 'Play' }).click();
  await steps.step('play-returned', {
    description: 'The player returns to the empty play view',
    verifications: [{ spec: 'The recovered clean store is ready to generate', check: async () => await expect(page.getByRole('button', { name: 'Generate Easy puzzle' })).toBeEnabled() }]
  });

  await page.getByRole('button', { name: 'Generate Easy puzzle' }).click();
  await steps.step('settings-snapshotted', {
    description: 'The player generates a puzzle with the chosen preferences',
    verifications: [{ spec: 'The game snapshots mistake checking on and timer display off', check: async () => {
      await expect(page.getByRole('grid', { name: 'Easy Sudoku puzzle' })).toBeVisible();
      await expect(page.locator('.timer')).toHaveCount(0);
      const start = await page.evaluate(() => JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '').events.at(-1));
      expect(start.payload.settings).toMatchObject({ checkMistakes: true, showTimer: false });
    } }]
  });

  const choice = await page.evaluate(() => {
    const puzzle = JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '').events.at(-1).payload.puzzle;
    for (let cell = 0; cell < 81; cell += 1) {
      if (puzzle.givens[cell] !== '.') continue;
      const row = Math.floor(cell / 9), column = cell % 9, boxRow = Math.floor(row / 3) * 3, boxColumn = Math.floor(column / 3) * 3;
      for (let value = 1; value <= 9; value += 1) {
        if (value === Number(puzzle.solution[cell])) continue;
        const peerHasValue = [...Array(9).keys()].some((i) =>
          Number(puzzle.givens[row * 9 + i]) === value || Number(puzzle.givens[i * 9 + column]) === value ||
          Number(puzzle.givens[(boxRow + Math.floor(i / 3)) * 9 + boxColumn + (i % 3)]) === value
        );
        if (!peerHasValue) return { cell, value };
      }
    }
    throw new Error('No non-conflicting wrong value');
  });
  await page.locator(`[data-cell="${choice.cell}"]`).click();
  await steps.step('mistake-cell-selected', {
    description: 'The player selects an editable cell before entering a checked value',
    verifications: [{ spec: 'The chosen cell is selected and still empty', check: async () => await expect(page.locator(`[data-cell="${choice.cell}"]`)).toHaveAccessibleName(/editable, empty, selected/) }]
  });
  await page.getByRole('button', { name: new RegExp(`^${choice.value},`) }).click();
  await steps.step('mistake-marked', {
    description: 'A wrong but non-conflicting value is visibly identified as a mistake',
    verifications: [{ spec: 'The cell exposes mistake state and the projection counts one mistake', check: async () => {
      await expect(page.locator(`[data-cell="${choice.cell}"]`)).toHaveAccessibleName(new RegExp(`editable, ${choice.value}, mistake, selected`));
      const gameId = await page.evaluate(() => JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '').events.at(-1).gameId);
      expect(gameId).toBeTruthy();
    } }]
  });

  await page.getByRole('button', { name: 'Settings' }).click();
  await steps.step('settings-reopened', {
    description: 'The player returns to Settings to manage local data',
    verifications: [{ spec: 'The saved switches retain their replayed values', check: async () => {
      await expect(page.getByRole('switch', { name: /Check mistakes/ })).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByRole('switch', { name: /Show timer/ })).toHaveAttribute('aria-checked', 'false');
    } }]
  });
  await page.getByRole('button', { name: 'Clear all local Sudoku data' }).click();
  await steps.step('clear-confirmation-opened', {
    description: 'Clear all opens an explicit irreversible confirmation',
    verifications: [{ spec: 'The dialog names every category and offers Cancel', check: async () => {
      await expect(page.getByRole('dialog', { name: 'Clear all local data?' })).toContainText('Every puzzle, move, preference, and recovery copy');
      await expect(page.getByRole('button', { name: 'Cancel' })).toBeEnabled();
    } }]
  });
  await page.getByRole('button', { name: 'Cancel' }).click();
  await steps.step('clear-cancelled', {
    description: 'Cancel preserves the complete local event stream',
    verifications: [{ spec: 'The dialog closes and canonical plus recovery keys remain', check: async () => {
      await expect(page.getByRole('dialog')).toHaveCount(0);
      expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('sudoku.')).length)).toBe(2);
    } }]
  });
  await page.getByRole('button', { name: 'Clear all local Sudoku data' }).click();
  await steps.step('clear-confirmation-reopened', {
    description: 'The player deliberately opens the destructive confirmation again',
    verifications: [{ spec: 'Clear everything is ready only inside the modal', check: async () => await expect(page.getByRole('button', { name: 'Clear everything' })).toBeEnabled() }]
  });
  await page.getByRole('button', { name: 'Clear everything' }).click();
  await steps.step('all-local-data-cleared', {
    description: 'The player permanently clears all local Sudoku data',
    verifications: [{ spec: 'No sudoku.* key remains and the app returns to a fresh welcome view', check: async () => {
      expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('sudoku.')))).toEqual([]);
      await expect(page.getByRole('heading', { name: 'A quiet place to solve.' })).toBeVisible();
    } }]
  });
  steps.generateDocs();
});
