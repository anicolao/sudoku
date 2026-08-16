import { expect, test } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';

test('a later tab is read-only and follows the first writer', async ({ context, page }, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Generate Easy puzzle' }).click();
  await expect(page.getByRole('gridcell')).toHaveCount(81);

  const later = await context.newPage();
  const steps = new TestStepHelper(later, testInfo);
  steps.setMetadata(
    'Protect the active game from a second tab',
    'Opening Sudoku again never creates a silent second writer. The later tab becomes a live read-only view while the first tab retains authority.'
  );
  await later.goto('/');
  await steps.step('later-tab-read-only', {
    description: 'The later tab detects the already-open Sudoku session',
    verifications: [
      { spec: 'A specific read-only banner identifies the first tab as the place to continue', check: async () => await expect(later.getByText('Another Sudoku tab was opened first. Continue there to make changes.')).toBeVisible() },
      { spec: 'Every number input is disabled in the later tab', check: async () => await expect(later.locator('.number-pad button:enabled')).toHaveCount(0) }
    ]
  });

  const editableCell = await page.locator('[data-cell]').evaluateAll((cells) =>
    cells.findIndex((cell) => cell.getAttribute('aria-label')?.includes('editable'))
  );
  const correct = await page.evaluate((cell) => {
    const start = JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '').events[0];
    return Number(start.payload.puzzle.solution[cell]);
  }, editableCell);
  await page.locator(`[data-cell="${editableCell}"]`).click();
  await page.getByRole('button', { name: new RegExp(`^${correct},`) }).click();
  await steps.step('first-tab-move-observed', {
    description: 'The first tab places a value and the later tab refreshes from storage',
    verifications: [
      { spec: 'The later board shows the exact value written by the first tab', check: async () => await expect(later.locator(`[data-cell="${editableCell}"]`)).toHaveAccessibleName(new RegExp(`editable, ${correct}`)) },
      { spec: 'The later tab remains read-only after refreshing', check: async () => await expect(later.locator('.number-pad button:enabled')).toHaveCount(0) }
    ]
  });
  steps.generateDocs();
});
