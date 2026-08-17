import { expect, test } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';

test('erase, undo, redo, and a new branch remain append-only', async ({ page }, testInfo) => {
  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata(
    'Erase, undo, redo, and branch',
    'The board moves backward and forward by appending compensating facts; a new move after undo closes the old redo branch without deleting it.'
  );
  await page.goto('/');
  const cell = (index: number) => page.locator(`[data-cell="${index}"]`);
  const digit = (value: number) => page.getByRole('button', { name: new RegExp(`^${value},`) });
  const stream = async () => page.evaluate(() =>
    JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '{"events":[]}').events
  );

  await page.getByRole('button', { name: 'Generate Foundations puzzle' }).click();
  await steps.step('puzzle-generated', {
    description: 'The player generates the puzzle used for the correction journey',
    verifications: [
      { spec: 'The board and start event are ready', check: async () => {
        await expect(page.getByRole('grid')).toBeVisible();
        expect((await stream()).map((event: { type: string }) => event.type)).toEqual(['game/started']);
      } }
    ]
  });

  await cell(34).click();
  await steps.step('editable-cell-selected', {
    description: 'The player selects row 4 column 8',
    verifications: [
      { spec: 'The cell is selected and Erase remains unavailable while it is empty', check: async () => {
        await expect(cell(34)).toHaveAttribute('aria-selected', 'true');
        await expect(page.getByRole('button', { name: 'Erase' })).toBeDisabled();
      } }
    ]
  });

  const correct = await page.evaluate(() => Number(
    JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '').events[0].payload.puzzle.solution[34]
  ));
  await digit(correct).click();
  await steps.step('value-entered', {
    description: 'The player enters a value that can now be erased or undone',
    verifications: [
      { spec: 'The value is visible and Erase is enabled', check: async () => {
        await expect(cell(34)).toHaveAccessibleName(new RegExp(`editable, ${correct}, selected`));
        await expect(page.getByRole('button', { name: 'Erase' })).toBeEnabled();
      } },
      { spec: 'Undo names the exact placement it will affect', check: async () => {
        await expect(page.getByRole('button', { name: `Undo Placed ${correct} in r4c8` })).toBeEnabled();
      } }
    ]
  });

  await page.getByRole('button', { name: 'Erase' }).click();
  await steps.step('value-erased', {
    description: 'Erase clears the selected editable cell with one canonical event',
    verifications: [
      { spec: 'Row 4 column 8 is empty again', check: async () => await expect(cell(34)).toHaveAccessibleName(/editable, empty, selected/) },
      { spec: 'The newest event and log row record Erased r4c8', check: async () => {
        expect((await stream()).at(-1).type).toBe('cell/cleared');
        await expect(page.locator('[data-event-type]').first()).toHaveText('Erased r4c8');
      } }
    ]
  });

  await page.getByRole('button', { name: 'Undo Erased r4c8' }).click();
  await steps.step('erase-undone', {
    description: 'Undo restores the erased value by appending a compensation',
    verifications: [
      { spec: 'The original value is visible again', check: async () => await expect(cell(34)).toHaveAccessibleName(new RegExp(`editable, ${correct}, selected`)) },
      { spec: 'The stream retains clear and appends move/undone', check: async () => {
        const events = await stream();
        expect(events.map((event: { type: string }) => event.type)).toEqual(['game/started', 'cell/value-entered', 'cell/cleared', 'move/undone']);
        await expect(page.locator('[data-event-type]').first()).toHaveText('Undid: Erased r4c8');
      } }
    ]
  });

  await page.getByRole('button', { name: 'Redo Erased r4c8' }).click();
  await steps.step('erase-redone', {
    description: 'Redo reapplies the same clear without rewriting the original event',
    verifications: [
      { spec: 'The cell is empty and the clear is again the active move', check: async () => {
        await expect(cell(34)).toHaveAccessibleName(/editable, empty, selected/);
        await expect(page.getByRole('button', { name: 'Undo Erased r4c8' })).toBeEnabled();
      } },
      { spec: 'The newest event and log entry are move/redone', check: async () => {
        expect((await stream()).at(-1).type).toBe('move/redone');
        await expect(page.locator('[data-event-type]').first()).toHaveText('Redid: Erased r4c8');
      } }
    ]
  });

  await page.getByRole('button', { name: 'Undo Erased r4c8' }).click();
  await steps.step('erase-undone-again', {
    description: 'The player undoes the clear once more before choosing a new direction',
    verifications: [
      { spec: 'The value is restored and Redo is available', check: async () => {
        await expect(cell(34)).toHaveAccessibleName(new RegExp(`editable, ${correct}, selected`));
        await expect(page.getByRole('button', { name: 'Redo Erased r4c8' })).toBeEnabled();
      } }
    ]
  });

  await cell(27).click();
  await steps.step('branch-cell-selected', {
    description: 'The player selects a different empty cell while the old clear is redoable',
    verifications: [
      { spec: 'Selection changes without affecting the redo branch', check: async () => {
        await expect(cell(27)).toHaveAttribute('aria-selected', 'true');
        await expect(page.getByRole('button', { name: 'Redo Erased r4c8' })).toBeEnabled();
      } }
    ]
  });

  await digit(2).click();
  await steps.step('new-branch-created', {
    description: 'A new placement commits a branch and makes the old redo unavailable',
    verifications: [
      { spec: 'The new value is visible with its derived conflict and Redo is disabled', check: async () => {
        await expect(cell(27)).toHaveAccessibleName(/editable, 2, conflict, selected/);
        await expect(page.getByRole('button', { name: 'Redo' })).toBeDisabled();
      } },
      { spec: 'All seven facts remain append-only and the new move is last', check: async () => {
        const events = await stream();
        expect(events).toHaveLength(7);
        expect(events.at(-1)).toMatchObject({ type: 'cell/value-entered', payload: { cell: 27, value: 2 } });
      } },
      { spec: 'The game log shows the new branch above the retained undo and redo history', check: async () => {
        await expect(page.locator('[data-event-type]').first()).toHaveText('Placed 2 in r4c1');
        await expect(page.locator('[data-event-type="move/redone"]')).toHaveCount(1);
        await expect(page.locator('[data-event-type="move/undone"]')).toHaveCount(2);
      } }
    ]
  });

  steps.generateDocs();
});
