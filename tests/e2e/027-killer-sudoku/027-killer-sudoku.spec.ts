import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';

test('play a Killer puzzle and return to its cage rules', async ({ page }, testInfo) => {
  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata('Play and resume Killer Sudoku', 'As a solver, I can start a checked Killer puzzle, read its cage totals, make reversible moves, return to the same rules and progress, inspect combinations, and request an explained deduction.');
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
        const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        expect(accessibility.violations).toEqual([]);
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
  await page.locator(`[data-cell="${a}"]`).click();
  await page.getByRole('button', { name: 'Inspect cage', exact: true }).click();
  await steps.step('inspect-cage', {
    description: 'Inspect the selected cage without changing pencil marks or digits',
    verifications: [{ spec: 'The inspector explains remaining sum and feasible sets', check: async () => {
      await expect(page.getByRole('heading', { name: `Cage total ${cage.total}` })).toBeVisible();
      await expect(page.getByText(/remaining across/)).toBeVisible();
      await expect(page.getByText(/Sets are checked against placed digits/)).toBeVisible();
    } }]
  });
  await page.getByRole('button', { name: 'Back to puzzle' }).click();
  await page.getByRole('button', { name: 'Hint', exact: true }).click();
  await page.getByRole('button', { name: /Explain next step/ }).click();
  await steps.step('explain-step', {
    description: 'A logical hint explains a cage or positional deduction without placing it',
    verifications: [{ spec: 'The explanation is a supported Killer deduction', check: async () => {
      await expect(page.getByRole('dialog')).not.toContainText('No listed technique');
      await expect(page.getByRole('heading', { name: /^Try / })).toBeVisible();
    } }]
  });
  await page.getByRole('button', { name: 'Back to puzzle' }).click();
  await page.getByRole('button', { name: 'Hint', exact: true }).click();
  await page.getByRole('button', { name: /Reveal one cell/ }).click();
  await expect(page.locator('.sudoku-cell.hinted')).toHaveCount(1);
  steps.generateDocs();
});
