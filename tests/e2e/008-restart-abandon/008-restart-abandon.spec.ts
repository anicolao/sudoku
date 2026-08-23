import { expect, test } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';

test('restart and abandon remain visible in history', async ({ page }, testInfo) => {
  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata(
    'Restart and abandon an attempt',
    'Restart keeps one game history, resets its mutable cells, and can be undone or redone. Abandon closes the attempt, retains its final board for review, and permits a distinct start-over attempt.'
  );
  const cell = (index: number) => page.locator(`[data-cell="${index}"]`);
  const digit = (value: number) => page.getByRole('button', { name: new RegExp(`^${value},`) });
  const events = async () => page.evaluate(() =>
    JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '{"events":[]}').events
  );
  await page.goto('/');

  await page.getByRole('button', { name: 'Generate Foundations puzzle' }).click();
  await steps.step('puzzle-generated', {
    description: 'The player generates an attempt that can be restarted or abandoned',
    verifications: [{ spec: 'Restart and Abandon are both available', check: async () => {
      await expect(page.getByRole('button', { name: 'Restart' })).toBeEnabled();
      await expect(page.getByRole('button', { name: 'Abandon' })).toBeEnabled();
    } }]
  });

  await cell(34).click();
  await steps.step('cell-selected-before-restart', {
    description: 'The player selects an editable cell before the first move',
    verifications: [{ spec: 'Row 4 column 8 is selected', check: async () => await expect(cell(34)).toHaveAttribute('aria-selected', 'true') }]
  });
  const correct = await page.evaluate(() => Number(
    JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '').events[0].payload.puzzle.solution[34]
  ));
  await digit(correct).click();
  await steps.step('value-entered-before-restart', {
    description: 'The player commits a value that Restart will clear',
    verifications: [{ spec: 'The value and its placement event are visible', check: async () => {
      await expect(cell(34)).toHaveAccessibleName(new RegExp(`editable, ${correct}, selected`));
      expect((await events()).at(-1).type).toBe('cell/value-entered');
    } }]
  });

  await page.getByRole('button', { name: 'Restart' }).click();
  await steps.step('puzzle-restarted', {
    description: 'Restart resets mutable cells but remains reversible',
    verifications: [
      { spec: 'All 41 editable cells are empty again', check: async () => await expect(page.getByRole('gridcell', { name: /editable, empty/ })).toHaveCount(41) },
      { spec: 'game/restarted follows the original value event', check: async () => {
        const stream = await events();
        expect(stream.map((event: { type: string }) => event.type)).toEqual(['game/started', 'cell/value-entered', 'game/restarted']);
        await expect(page.locator('[data-event-type]').first()).toHaveText('Restarted puzzle');
      } },
      { spec: 'Undo identifies the restart as its next reversible action', check: async () => {
        await expect(page.getByRole('button', { name: 'Undo Restarted puzzle' })).toBeEnabled();
      } }
    ]
  });

  await cell(34).click();
  await steps.step('cell-selected-after-restart', {
    description: 'The player selects the reset cell again',
    verifications: [{ spec: 'Selection remains ephemeral after restart', check: async () => {
      await expect(cell(34)).toHaveAttribute('aria-selected', 'true');
      expect(await events()).toHaveLength(3);
    } }]
  });
  await digit(correct).click();
  await steps.step('value-entered-after-restart', {
    description: 'The player makes one move in the restarted attempt',
    verifications: [{ spec: 'The restarted board contains the new value fact', check: async () => {
      await expect(cell(34)).toHaveAccessibleName(new RegExp(`editable, ${correct}, selected`));
      expect((await events()).at(-1).type).toBe('cell/value-entered');
    } }]
  });

  await page.getByRole('button', { name: 'Abandon' }).click();
  await steps.step('attempt-abandoned', {
    description: 'Abandon closes the unfinished attempt and opens History',
    verifications: [
      { spec: 'History labels the attempt Abandoned', check: async () => await expect(page.locator('.history-card')).toContainText('Abandoned') },
      { spec: 'game/abandoned is the final fact for the attempt', check: async () => expect((await events()).at(-1).type).toBe('game/abandoned') }
    ]
  });

  await page.getByRole('button', { name: 'Review board' }).click();
  await steps.step('abandoned-board-reviewed', {
    description: 'Review board shows the final abandoned position without edit controls',
    verifications: [
      { spec: 'The last value remains visible and the number pad is disabled', check: async () => {
        await expect(cell(34)).toHaveAccessibleName(new RegExp(`editable, ${correct}`));
        await expect(page.getByRole('button', { name: /^1,/ })).toBeDisabled();
      } }
    ]
  });

  await page.getByRole('button', { name: 'History', exact: true }).click();
  await steps.step('abandoned-history-reopened', {
    description: 'The player returns to the retained abandoned history card',
    verifications: [{ spec: 'Exactly one abandoned attempt remains', check: async () => {
      await expect(page.locator('.history-card')).toHaveCount(1);
      await expect(page.locator('.history-state')).toHaveText('Abandoned');
    } }]
  });

  const firstGameId = (await events())[0].gameId;
  await page.getByRole('button', { name: 'Start over' }).click();
  await steps.step('abandoned-puzzle-started-over', {
    description: 'Start over creates a clean active attempt from the same puzzle',
    verifications: [
      { spec: 'The original givens return with all editable cells empty', check: async () => await expect(page.getByRole('gridcell', { name: /editable, empty/ })).toHaveCount(41) },
      { spec: 'The second game/started event uses a different game ID', check: async () => {
        const starts = (await events()).filter((event: { type: string }) => event.type === 'game/started');
        expect(starts).toHaveLength(2);
        expect(starts[1].gameId).not.toBe(firstGameId);
      } }
    ]
  });

  steps.generateDocs();
});

test('restart can be undone and redone', async ({ page }) => {
  const cell = (index: number) => page.locator(`[data-cell="${index}"]`);
  await page.goto('/');
  await page.getByRole('button', { name: 'Generate Foundations puzzle' }).click();
  await expect(page.getByRole('gridcell')).toHaveCount(81);

  const correct = await page.evaluate(() => Number(
    JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '').events[0].payload.puzzle.solution[34]
  ));
  await cell(34).click();
  await page.getByRole('button', { name: new RegExp(`^${correct},`) }).click();
  await page.getByRole('button', { name: 'Restart' }).click();
  await expect(cell(34)).toHaveAccessibleName(/editable, empty/);

  await page.getByRole('button', { name: 'Undo Restarted puzzle' }).click();
  await expect(cell(34)).toHaveAccessibleName(new RegExp(`editable, ${correct}`));
  await expect(page.locator('[data-event-type]').first()).toHaveText('Undid: Restarted puzzle');
  await expect(page.getByRole('button', { name: 'Redo Restarted puzzle' })).toBeEnabled();

  await page.getByRole('button', { name: 'Redo Restarted puzzle' }).click();
  await expect(cell(34)).toHaveAccessibleName(/editable, empty/);
  await expect(page.locator('[data-event-type]').first()).toHaveText('Redid: Restarted puzzle');
  await expect(page.getByRole('button', { name: 'Undo Restarted puzzle' })).toBeEnabled();
});
