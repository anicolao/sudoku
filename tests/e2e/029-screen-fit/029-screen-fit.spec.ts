import { expect, test } from '@playwright/test';
import { assertNoClippedDescendants } from '../helpers/test-step-helper';

test('every primary screen and modal fits without scrolling or occluded controls', async ({ page }) => {
  const expectScreenToFit = async (name: string): Promise<void> => {
    await test.step(`${name} fits the viewport`, async () => {
      await expect(page.evaluate(assertNoClippedDescendants)).resolves.toBeUndefined();
    });
  };

  await page.goto('/');
  await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
  await expectScreenToFit('Welcome');

  await page.getByRole('button', { name: 'Puzzles', exact: true }).click();
  await expectScreenToFit('Puzzle library');
  await page.getByRole('button', { name: 'Import from photo' }).click();
  await expect(page.getByRole('heading', { name: 'Import from a photo' })).toBeVisible();
  await expectScreenToFit('Photo import');
  await page.getByRole('button', { name: 'Back to Puzzles' }).click();

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expectScreenToFit('Settings');
  await page.getByRole('button', { name: 'Clear all local Sudoku data' }).click();
  await expectScreenToFit('Clear-data confirmation');
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByRole('button', { name: 'Generate Foundations puzzle' }).click();
  await expect(page.getByRole('grid')).toBeVisible();
  await expectScreenToFit('Active puzzle');

  await page.getByRole('button', { name: 'Pause' }).click();
  await expectScreenToFit('Paused puzzle');
  await page.getByRole('button', { name: 'Resume' }).click();

  const placement = await page.evaluate(() => {
    const puzzle = JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '').events[0].payload.puzzle;
    const cell = [...puzzle.givens].findIndex((value: string) => value === '.');
    return { cell, value: Number(puzzle.solution[cell]) };
  });
  await page.locator(`[data-cell="${placement.cell}"]`).click();
  await page.getByRole('button', { name: new RegExp(`^${placement.value},`) }).click();

  await page.getByRole('button', { name: 'Hint' }).click();
  await expectScreenToFit('Hint choices');
  await page.getByRole('button', { name: /Technique only/ }).click();
  await expect(page.getByRole('dialog', { name: /Try / })).toBeVisible();
  await expectScreenToFit('Technique hint');
  await page.getByRole('button', { name: 'Back to puzzle' }).click();

  await page.getByRole('button', { name: 'Hint' }).click();
  await page.getByRole('button', { name: /Visual hint/ }).click();
  await expect(page.getByRole('status', { name: /Visual hint for/ })).toBeVisible();
  await expectScreenToFit('Visual hint');
  await page.getByRole('button', { name: 'Done' }).click();

  await page.getByRole('button', { name: 'History', exact: true }).click();
  await expectScreenToFit('History');

  await page.getByRole('button', { name: 'Walkthrough' }).click();
  await expect(page.getByText('Placement 1 of 1')).toBeVisible();
  await expectScreenToFit('Walkthrough');
  await page.getByRole('button', { name: 'Back to History' }).click();

  await page.getByRole('button', { name: 'Share' }).click();
  await expectScreenToFit('Share choices');
  await page.getByRole('button', { name: /Share puzzle only/ }).click();
  await expect(page.getByTestId('share-qr')).toBeVisible();
  await expectScreenToFit('Share QR code');

  const sharedLink = await page.getByTestId('share-link').getAttribute('data-link');
  expect(sharedLink).toBeTruthy();
  await page.goto(sharedLink!);
  await expect(page.getByRole('heading', { name: 'Shared puzzle ready' })).toBeVisible();
  await expectScreenToFit('Incoming shared puzzle');
});

test('the completed puzzle screen fits without hiding its actions', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Generate Foundations puzzle' }).click();
  await expect(page.getByRole('grid')).toBeVisible();

  await page.evaluate(async () => {
    const document = JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '');
    const start = document.events[0];
    const puzzle = start.payload.puzzle;
    for (let cell = 0; cell < 81; cell += 1) {
      if (puzzle.givens[cell] !== '.') continue;
      const sequence = document.nextSequence++;
      document.events.push({
        id: `completed-fit-${sequence}`,
        sequence,
        gameId: start.gameId,
        type: 'cell/value-entered',
        payload: { cell, value: Number(puzzle.solution[cell]) },
        occurredAt: '2026-10-10T12:00:00.000Z',
        elapsedMs: 0,
        schemaVersion: 1,
        reducerVersion: 1
      });
    }
    await (window as unknown as { __sudokuReplaceEventDocument: (value: unknown) => Promise<unknown> })
      .__sudokuReplaceEventDocument(document);
  });
  await page.reload();

  await expect(page.getByRole('heading', { name: 'Puzzle complete', exact: true, level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View history' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose another puzzle' })).toBeVisible();
  await expect(page.evaluate(assertNoClippedDescendants)).resolves.toBeUndefined();
});
