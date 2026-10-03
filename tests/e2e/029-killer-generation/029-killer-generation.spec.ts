import { expect, test } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';

test('construct fresh Killer puzzles at the chosen logical difficulty', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata('Construct a Killer at your chosen difficulty', 'As a solver, I can choose Easy, Medium or Hard, generate a new puzzle with a balanced mix of cage sizes and no givens or one-cell cages, and read the actual logical difficulty on the board and in History.');
  await page.goto('/');
  await page.getByRole('button', { name: 'Start Killer Sudoku' }).click();
  await steps.step('choose-killer-difficulty', {
    description: 'Choose a technique-based Killer difficulty before construction',
    verifications: [{ spec: 'Easy, Medium and Hard explain their solving techniques; there are no preset layouts', check: async () => {
      await expect(page.getByRole('button', { name:'Easy', exact:true })).toHaveAttribute('aria-pressed','true');
      await expect(page.getByRole('button', { name:'Medium', exact:true })).toBeVisible();
      await expect(page.getByRole('button', { name:'Hard', exact:true })).toBeVisible();
      await expect(page.getByText(/no given digits or one-cell cages/)).toBeVisible();
    } }]
  });
  const solutions = new Set<string>();
  for (const difficulty of ['Medium','Hard']) {
    await page.getByRole('button', { name:difficulty, exact:true }).click();
    await page.getByRole('button', { name:'Start Killer puzzle', exact:true }).click();
    await expect(page.getByRole('grid', { name:'Killer Sudoku puzzle' })).toBeVisible({ timeout:30_000 });
    const origin = await page.evaluate(() => JSON.parse(localStorage.getItem('sudoku.event-store.v1')!).events.findLast((e:{type:string})=>e.type==='game/started'));
    solutions.add(origin.payload.puzzle.solution);
    await steps.step(`generated-${difficulty.toLowerCase()}`, {
      description: `Construct and play a new ${difficulty} Killer`,
      verifications: [{ spec: 'The generated board records its level, version 3 provenance, and an entirely multi-cell cage partition', check: async () => {
        const puzzle=origin.payload.puzzle;
        expect(puzzle.killerDifficulty).toBe(difficulty.toLowerCase());
        expect(puzzle.killerRatingVersion).toBe(1);
        expect(puzzle.provenance.generatorVersion).toBe(3);
        expect(puzzle.givens).toBe('.'.repeat(81));
        expect(puzzle.cages.filter((c:{cells:number[]})=>c.cells.length===2).length / puzzle.cages.length).toBeLessThanOrEqual(0.45);
        expect(puzzle.cages.filter((c:{cells:number[]})=>c.cells.length>=4).length).toBeGreaterThanOrEqual(3);
        expect(puzzle.cages.every((c:{cells:number[]})=>c.cells.length>=2)).toBe(true);
        await expect(page.locator('.puzzle-heading')).toContainText(`${difficulty} Killer Sudoku`);
        await expect(page.locator('.cage-overlay .cage')).toHaveCount(puzzle.cages.length);
      } }]
    });
    await page.getByRole('button',{name:'History',exact:true}).click();
    await expect(page.locator('.history-card')).toContainText(`${difficulty} Killer`);
    if(difficulty==='Medium') {
      await page.getByRole('button',{name:'Puzzles',exact:true}).click();
      await page.getByRole('button',{name:'Start Killer Sudoku'}).click();
    }
  }
  expect(solutions.size).toBe(2);
  steps.generateDocs();
});
