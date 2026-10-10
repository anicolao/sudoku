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

  const placement = await page.evaluate(() => {
    const puzzle = JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '').events[0].payload.puzzle;
    const cell = [...puzzle.givens].findIndex((value: string) => value === '.');
    return { cell, value: Number(puzzle.solution[cell]) };
  });
  await page.locator(`[data-cell="${placement.cell}"]`).click();
  await page.getByRole('button', { name: new RegExp(`^${placement.value},`) }).click();

  await page.getByRole('button', { name: 'Hint' }).click();
  await expectScreenToFit('Hint choices');
  await page.getByRole('button', { name: 'Cancel' }).click();

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
