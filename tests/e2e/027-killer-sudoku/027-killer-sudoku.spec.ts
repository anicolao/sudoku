import { expect, test } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';

test('play a Killer puzzle and return to its cage rules', async ({ page }, testInfo) => {
  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata('Play and resume Killer Sudoku', 'As a solver, I can start a checked Killer puzzle, read its cage totals, make reversible moves, and return to the same rules and progress.');
  await page.goto('/');
  await page.getByRole('button', { name: 'Start Killer Sudoku' }).click();
  await page.getByRole('button', { name: 'Start Killer puzzle', exact: true }).click();
  const board = page.getByRole('grid', { name: 'Killer Sudoku puzzle' });
  await expect(board).toBeVisible();
  const puzzle = await page.evaluate(() => JSON.parse(localStorage.getItem('sudoku.event-store.v1')!).events[0].payload.puzzle);
  await steps.step('killer-ready', {
    description: 'A blank-givens Killer has labelled cages and ordinary number controls',
    verifications: [
      { spec: 'The checked rules and cages are stored with the puzzle', check: async () => {
        expect(puzzle.variant).toBe('killer');
        expect(puzzle.givens).toBe('.'.repeat(81));
        await expect(page.locator('.cage-overlay .cage')).toHaveCount(puzzle.cages.length);
        await expect(page.locator('[data-cell="0"]')).toHaveAttribute('aria-label', /cage total/);
      } }
    ]
  });
  const cage = puzzle.cages.find((c: { cells: number[] }) => c.cells.length > 1);
  const [a,b] = cage.cells;
  await page.locator(`[data-cell="${a}"]`).focus();
  await page.keyboard.press('1');
  await page.locator(`[data-cell="${b}"]`).focus();
  await page.keyboard.press('1');
  await expect(page.locator(`[data-cell="${b}"]`)).toHaveAttribute('aria-label', /conflict/);
  await page.getByRole('button', { name: /^Undo / }).click();
  await expect(page.locator(`[data-cell="${b}"] .cell-value`)).toHaveCount(0);
  await page.getByRole('button', { name: /^Undo / }).click();
  await expect(page.locator(`[data-cell="${a}"] .cell-value`)).toHaveCount(0);
  await page.locator(`[data-cell="${a}"]`).focus();
  await page.keyboard.press(puzzle.solution[a]);
  await expect(page.locator(`[data-cell="${a}"] .cell-value`)).toHaveText(puzzle.solution[a]);
  await page.waitForFunction(() => document.documentElement.dataset.eventStorePending !== 'true');
  await page.reload();
  await steps.step('killer-resumed', {
    description: 'Reload restores the same cage sums and placement',
    verifications: [
      { spec: 'Killer identity, cage count and placed digit survive reload', check: async () => {
        await expect(board).toBeVisible();
        await expect(page.locator('.cage-overlay .cage')).toHaveCount(puzzle.cages.length);
        await expect(page.locator(`[data-cell="${a}"] .cell-value`)).toHaveText(puzzle.solution[a]);
      } }
    ]
  });
  steps.generateDocs();
});
