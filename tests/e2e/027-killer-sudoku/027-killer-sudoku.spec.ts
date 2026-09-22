import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';

test('play a Killer puzzle and return to its cage rules', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata('Play and resume Killer Sudoku', 'As a solver, I can construct a fresh rated Killer without givens or one-cell cages, read centered cage totals in transparent border gaps, follow rounded boundaries through inside corners, see the entire selected cage highlighted, make reversible moves, return to the same rules and progress, inspect combinations, and request an explained deduction.');
  await page.goto('/');
  await page.getByRole('button', { name: 'Start Killer Sudoku' }).click();
  await expect(page.getByRole('button', { name: 'Easy', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Easy', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Start Killer puzzle', exact: true }).focus();
  await page.keyboard.press('Enter');
  const board = page.getByRole('grid', { name: 'Killer Sudoku puzzle' });
  await expect(board).toBeVisible({ timeout: 30_000 });
  const puzzle = await page.evaluate(() => JSON.parse(localStorage.getItem('sudoku.event-store.v1')!).events[0].payload.puzzle);
  await steps.step('killer-ready', {
    description: 'A fresh Killer has continuous rounded cage outlines and centered sums in transparent border gaps',
    verifications: [
      { spec: 'Keyboard focus enters the introduction, stays inside with Tab, and starts with Enter; checked cages are stored', check: async () => {
        const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        expect(accessibility.violations).toEqual([]);
        expect(puzzle.variant).toBe('killer');
        expect(puzzle.givens).toBe('.'.repeat(81));
        expect(puzzle.killerDifficulty).toBe('easy');
        expect(puzzle.provenance.generatorVersion).toBe(3);
        expect(puzzle.cages.every((cage: { cells: number[] }) => cage.cells.length >= 2)).toBe(true);
        await expect(page.locator('.cage-overlay .cage')).toHaveCount(puzzle.cages.length);
        await expect(page.locator('.cage-overlay .cage-outline')).toHaveCount(puzzle.cages.length);
        await expect(page.locator('.cage-overlay .cage-corners')).toHaveCount(puzzle.cages.length);
        // Rectangles only cut holes in the border mask; none paint over cells.
        await expect(page.locator('.cage-overlay .cage > rect')).toHaveCount(0);
        for (const sum of await page.locator('.cage-overlay .cage-sum').all()) {
          await expect(sum).toHaveAttribute('text-anchor', 'middle');
        }
        await expect(page.locator('[data-cell="0"]')).toHaveAttribute('aria-label', /cage total/);
      } }
    ]
  });
  const cage = puzzle.cages.find((c: { cells: number[] }) => c.cells.length >= 4);
  const [a,b] = cage.cells;
  await page.locator(`[data-cell="${a}"]`).click();
  await steps.step('selected-cage', {
    description: 'Selecting a cell lights up its whole cage with a pale fill and stronger dashed boundary',
    verifications: [{ spec: 'Mouse and keyboard selection move a single cage highlight without altering puzzle values', check: async () => {
      await expect(page.locator('.cage-overlay .cage-selected')).toHaveCount(1);
      await expect(page.locator('.sudoku-cell.cage-member')).toHaveCount(cage.cells.length);
      const other = puzzle.cages.find((c: { cells: number[] }) => !c.cells.includes(a));
      await page.locator(`[data-cell="${other.cells[0]}"]`).focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('.sudoku-cell.cage-member')).toHaveCount(other.cells.length);
      await expect(page.locator('.cage-overlay .cage-selected')).toHaveAttribute('data-cage-total', String(other.total));
      await page.locator(`[data-cell="${a}"]`).click();
      await expect(page.locator('.sudoku-cell .cell-value')).toHaveCount(0);
    } }]
  });
  await page.locator(`[data-cell="${a}"]`).click();
  await expect(page.locator(`[data-cell="${a}"]`)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('1');
  await expect(page.locator(`[data-cell="${a}"] .cell-value`)).toHaveText('1');
  await page.locator(`[data-cell="${b}"]`).click();
  await expect(page.locator(`[data-cell="${b}"]`)).toHaveAttribute('aria-selected', 'true');
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
        await expect(board).toBeVisible({ timeout: 30_000 });
        await expect(page.locator('.cage-overlay .cage')).toHaveCount(puzzle.cages.length);
        await expect(page.locator(`[data-cell="${a}"] .cell-value`)).toHaveText(puzzle.solution[a]);
      } }
    ]
  });
  await page.locator(`[data-cell="${a}"]`).click();
  await page.getByRole('button', { name: 'Inspect cage', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Back to puzzle' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Back to puzzle' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Inspect cage', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Inspect cage', exact: true }).click();
  await steps.step('inspect-cage', {
    description: 'Inspect the selected cage without changing pencil marks or digits',
    verifications: [{ spec: 'The inspector contains keyboard focus, Escape returns to Cage, and remaining sum and feasible sets are explained', check: async () => {
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
