import { expect, test } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';

test('a second tap expands highlighting to every matching number peer set', async ({ page }, testInfo) => {
  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata(
    'Expand one cell highlight to every matching number',
    'The first tap on a filled cell shows its own peers in blue. A second tap on that cell shows every occurrence of its digit and the union of all their peer sets in pink; a third tap returns to the local view.'
  );
  const cell = (index: number) => page.locator(`[data-cell="${index}"]`);

  await page.goto('/');
  await page.getByRole('button', { name: 'Generate Foundations puzzle' }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('sudoku.event-store.v1'))).not.toBeNull();
  const choice = await page.evaluate(() => {
    const puzzle = JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '').events[0].payload.puzzle;
    for (let digit = 1; digit <= 9; digit += 1) {
      const cells = [...puzzle.givens].flatMap((value, cell) => Number(value) === digit ? [cell] : []);
      if (cells.length >= 2) return { digit, cell: cells[0], matches: cells };
    }
    throw new Error('Generated puzzle has no repeated given digit');
  });
  const expectedPeerCount = await page.evaluate((matches) => {
    const peers = new Set<number>();
    for (const cell of matches) {
      const row = Math.floor(cell / 9), column = cell % 9;
      for (let offset = 0; offset < 9; offset += 1) {
        peers.add(row * 9 + offset);
        peers.add(offset * 9 + column);
        peers.add((Math.floor(row / 3) * 3 + Math.floor(offset / 3)) * 9 + Math.floor(column / 3) * 3 + offset % 3);
      }
      peers.delete(cell);
    }
    return peers.size;
  }, choice.matches);
  await steps.step('puzzle-generated', {
    description: 'The player generates a board with repeated instances of a digit',
    verifications: [{ spec: `Digit ${choice.digit} appears in at least two fixed cells`, check: async () => expect(choice.matches.length).toBeGreaterThanOrEqual(2) }]
  });

  await cell(choice.cell).click();
  await steps.step('single-peer-highlight', {
    description: `The first tap selects one ${choice.digit} and shows its peers in blue`,
    verifications: [
      { spec: 'Exactly the selected cell’s 20 peers use the local peer treatment', check: async () => await expect(page.locator('[data-highlight="peer"]')).toHaveCount(20) },
      { spec: 'Every matching digit uses the ordinary blue matching treatment', check: async () => await expect(page.locator('[data-highlight="matching"]')).toHaveCount(choice.matches.length) }
    ]
  });

  await cell(choice.cell).click();
  await steps.step('number-wide-highlight', {
    description: `The second tap expands ${choice.digit} highlighting across the puzzle in pink`,
    verifications: [
      { spec: 'Every instance of the digit has the number-wide treatment', check: async () => await expect(page.locator('[data-highlight="number-match"]')).toHaveCount(choice.matches.length) },
      { spec: 'The union of every matching digit’s peer set has the pink treatment', check: async () => await expect(page.locator('[data-highlight="number-peer"]')).toHaveCount(expectedPeerCount) },
      { spec: 'The pink peer colour is visually distinct from the blue local peer colour', check: async () => {
        expect(await page.locator('[data-highlight="number-peer"]').first().evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(253, 232, 239)');
      } }
    ]
  });

  await cell(choice.cell).click();
  await steps.step('local-highlight-restored', {
    description: 'The third tap returns to the selected cell’s local blue peers',
    verifications: [
      { spec: 'The 20 local peers are blue again', check: async () => await expect(page.locator('[data-highlight="peer"]')).toHaveCount(20) },
      { spec: 'No number-wide pink highlight remains', check: async () => await expect(page.locator('[data-highlight^="number-"]')).toHaveCount(0) }
    ]
  });

  steps.generateDocs();
});
