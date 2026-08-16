import { expect, test } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';

test('the final moves derive completion, history, review, and a repeated attempt', async ({ page }, testInfo) => {
  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata(
    'Complete, review, and repeat a puzzle',
    'A near-complete canonical fixture leaves the final user actions visible. Completion is derived from the last value fact, then History replays the result and can start a distinct attempt on the same puzzle.'
  );
  const cell = (index: number) => page.locator(`[data-cell="${index}"]`);
  const digit = (value: number) => page.getByRole('button', { name: new RegExp(`^${value},`) });
  const stream = async () => page.evaluate(() =>
    JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '{"events":[]}')
  );
  await page.goto('/');

  await page.getByRole('button', { name: 'Generate Easy puzzle' }).click();
  await expect(page.getByRole('grid')).toBeVisible();
  await steps.step('puzzle-generated', {
    description: 'The player generates the puzzle that will be completed',
    verifications: [
      { spec: 'The canonical stream starts with game/started', check: async () => expect((await stream()).events.map((event: { type: string }) => event.type)).toEqual(['game/started']) }
    ]
  });

  const finalCells = await page.evaluate(() => {
    const document = JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '');
    const start = document.events[0];
    const puzzle = start.payload.puzzle;
    const blanks = [...puzzle.givens].flatMap((value, cell) => value === '.' ? [cell] : []);
    const final = blanks.slice(-2);
    for (const cell of blanks.slice(0, -2)) {
      const sequence = document.nextSequence++;
      document.events.push({
        id: `fixture-${sequence}`, sequence, gameId: start.gameId,
        type: 'cell/value-entered', payload: { cell, value: Number(puzzle.solution[cell]) },
        occurredAt: '2026-08-16T12:00:00.000Z', elapsedMs: 0,
        schemaVersion: 1, reducerVersion: 1
      });
    }
    localStorage.setItem('sudoku.event-store.v1', JSON.stringify(document));
    return final;
  });
  await page.reload();
  await steps.step('two-cells-remain', {
    description: 'The reviewed fixture leaves exactly two editable cells for the player',
    verifications: [
      { spec: 'Exactly two cells remain empty and the puzzle is not yet complete', check: async () => {
        await expect(page.getByRole('gridcell', { name: /editable, empty/ })).toHaveCount(2);
        await expect(page.locator('.completion-panel')).toHaveCount(0);
      } }
    ]
  });

  const firstValue = await page.evaluate((index) => Number(
    JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '').events[0].payload.puzzle.solution[index]
  ), finalCells[0]);
  await cell(finalCells[0]).click();
  await steps.step('penultimate-cell-selected', {
    description: 'The player selects the first of the final two cells',
    verifications: [{ spec: 'The penultimate cell is selected and empty', check: async () => await expect(cell(finalCells[0])).toHaveAccessibleName(/editable, empty, selected/) }]
  });
  await digit(firstValue).click();
  await steps.step('penultimate-value-entered', {
    description: 'The player fills the penultimate value and play continues',
    verifications: [
      { spec: 'One empty cell remains and no completion panel appears early', check: async () => {
        await expect(page.getByRole('gridcell', { name: /editable, empty/ })).toHaveCount(1);
        await expect(page.locator('.completion-panel')).toHaveCount(0);
      } }
    ]
  });

  const finalValue = await page.evaluate((index) => Number(
    JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '').events[0].payload.puzzle.solution[index]
  ), finalCells[1]);
  await cell(finalCells[1]).click();
  await steps.step('final-cell-selected', {
    description: 'The player selects the one remaining empty cell',
    verifications: [{ spec: 'The last empty cell has selection and focus state', check: async () => await expect(cell(finalCells[1])).toHaveAttribute('aria-selected', 'true') }]
  });
  await digit(finalValue).click();
  await steps.step('puzzle-complete', {
    description: 'The final value completes the puzzle without a redundant completion event',
    verifications: [
      { spec: 'The solved board stays visible beside a factual completion summary', check: async () => {
        await expect(page.locator('.completion-panel')).toContainText('Puzzle complete');
        await expect(page.locator('.completion-panel')).toContainText('0 mistakes · 0 hints');
        await expect(page.getByRole('gridcell', { name: /editable, empty/ })).toHaveCount(0);
      } },
      { spec: 'All play controls are read-only', check: async () => {
        await expect(page.getByRole('button', { name: /^1,/ })).toBeDisabled();
        await expect(page.getByRole('button', { name: 'Hint' })).toBeDisabled();
      } },
      { spec: 'The last canonical event remains cell/value-entered while the log derives Solved puzzle', check: async () => {
        const document = await stream();
        expect(document.events.at(-1).type).toBe('cell/value-entered');
        expect(document.events.some((event: { type: string }) => event.type === 'game/completed')).toBe(false);
        await expect(page.locator('[data-event-type="game/completed"]')).toHaveText('Solved puzzle');
      } }
    ]
  });

  await page.getByRole('button', { name: 'View history' }).click();
  await steps.step('completed-game-in-history', {
    description: 'The player opens History and sees the replayed completed attempt',
    verifications: [
      { spec: 'The newest history card reports Solved with zero mistakes and hints', check: async () => {
        const card = page.locator('.history-card').first();
        await expect(card).toContainText('Solved');
        await expect(card).toContainText('Mistakes0');
        await expect(card).toContainText('Hints0');
      } }
    ]
  });

  await page.getByRole('button', { name: 'Review board' }).click();
  await steps.step('completed-board-reviewed', {
    description: 'Review board replays the solved grid without reopening it for edits',
    verifications: [
      { spec: 'The solved board is visible and number input remains disabled', check: async () => {
        await expect(page.getByRole('grid')).toBeVisible();
        await expect(page.getByRole('button', { name: /^1,/ })).toBeDisabled();
      } }
    ]
  });

  await page.getByRole('button', { name: 'History', exact: true }).click();
  await steps.step('history-reopened', {
    description: 'The player returns to the same immutable history card',
    verifications: [{ spec: 'One completed attempt remains available', check: async () => await expect(page.locator('.history-card')).toHaveCount(1) }]
  });

  const firstGameId = (await stream()).events[0].gameId;
  await page.getByRole('button', { name: 'Start over' }).click();
  await steps.step('new-attempt-started', {
    description: 'Start over creates a fresh attempt using the same committed puzzle',
    verifications: [
      { spec: 'The board resets to its original givens with active controls', check: async () => {
        await expect(page.getByRole('gridcell', { name: /editable, empty/ })).toHaveCount(41);
        await expect(page.getByRole('button', { name: 'Hint' })).toBeEnabled();
      } },
      { spec: 'A second game/started event has a new game ID but the same puzzle ID', check: async () => {
        const events = (await stream()).events;
        const starts = events.filter((event: { type: string }) => event.type === 'game/started');
        expect(starts).toHaveLength(2);
        expect(starts[1].gameId).not.toBe(firstGameId);
        expect(starts[1].payload.puzzle.id).toBe(starts[0].payload.puzzle.id);
      } }
    ]
  });

  steps.generateDocs();
});
