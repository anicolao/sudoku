import { expect, test } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';

test('tabs follow the same stream and can keep different puzzles open', async ({ context, page }, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Generate Foundations puzzle' }).click();
  await expect(page.getByRole('gridcell')).toHaveCount(81);

  const later = await context.newPage();
  const steps = new TestStepHelper(later, testInfo);
  steps.setMetadata(
    'Solve in more than one tab',
    'Every puzzle has an independent IndexedDB event stream. Tabs viewing the same puzzle follow committed events and remain editable; opening another puzzle affects only that tab.'
  );
  await later.goto('/');
  await steps.step('second-tab-follows-puzzle', {
    description: 'A second tab opens the same in-progress puzzle',
    verifications: [
      { spec: 'The complete board is reconstructed from IndexedDB', check: async () => await expect(later.getByRole('gridcell')).toHaveCount(81) },
      { spec: 'Number input remains available in the second tab', check: async () => await expect(later.locator('.number-pad button:enabled')).toHaveCount(9) }
    ]
  });

  const puzzle = await later.evaluate(() =>
    JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '').events[0].payload.puzzle as { givens: string; solution: string }
  );
  const blanks = [...puzzle.givens].flatMap((given, cell) => given === '.' ? [cell] : []);
  const [firstCell, secondCell] = blanks;
  const firstValue = Number(puzzle.solution[firstCell]);
  const secondValue = Number(puzzle.solution[secondCell]);
  const takeover = await context.newPage();
  await takeover.addInitScript(() => { delete (window as Window & { BroadcastChannel?: unknown }).BroadcastChannel; });
  await takeover.goto('/');
  await expect(takeover.getByRole('gridcell')).toHaveCount(81);

  await page.locator(`[data-cell="${firstCell}"]`).click();
  await page.getByRole('button', { name: new RegExp(`^${firstValue},`) }).click();
  await steps.step('first-tab-event-followed', {
    description: 'The first tab commits a value to the shared puzzle stream',
    verifications: [
      { spec: 'The second tab follows the committed value without reloading', check: async () => await expect(later.locator(`[data-cell="${firstCell}"]`)).toHaveAccessibleName(new RegExp(`editable, ${firstValue}`)) },
      { spec: 'The observing tab remains writable', check: async () => await expect(later.locator('.number-pad button:enabled')).toHaveCount(9) }
    ]
  });

  steps.usePage(takeover);
  await takeover.locator(`[data-cell="${secondCell}"]`).click();
  await steps.step('second-tab-cell-selected', {
    description: 'A background tab that missed the notification receives focus',
    verifications: [
      { spec: 'The player can select a cell even before the stale stream catches up', check: async () => await expect(takeover.locator(`[data-cell="${secondCell}"]`)).toHaveAccessibleName(/editable, empty, selected/) }
    ]
  });
  await takeover.getByRole('button', { name: new RegExp(`^${secondValue},`) }).click();
  await steps.step('second-tab-event-committed', {
    description: 'The focused tab catches up and commits its first action',
    verifications: [
      { spec: 'The preflight refresh retains the earlier value and accepts the new one', check: async () => {
        await expect(takeover.locator(`[data-cell="${firstCell}"]`)).toHaveAccessibleName(new RegExp(`editable, ${firstValue}`));
        await expect(takeover.locator(`[data-cell="${secondCell}"]`)).toHaveAccessibleName(new RegExp(`editable, ${secondValue}`));
      } },
      { spec: 'Other tabs recover the takeover event when focused, even without its notification', check: async () => {
        await page.evaluate(() => window.dispatchEvent(new Event('focus')));
        await expect(page.locator(`[data-cell="${secondCell}"]`)).toHaveAccessibleName(new RegExp(`editable, ${secondValue}`));
        await later.evaluate(() => window.dispatchEvent(new Event('focus')));
        await expect(later.locator(`[data-cell="${secondCell}"]`)).toHaveAccessibleName(new RegExp(`editable, ${secondValue}`));
      } }
    ]
  });

  steps.usePage(later);
  await later.getByRole('button', { name: 'Puzzles', exact: true }).click();
  await steps.step('puzzle-library-opened', {
    description: 'The player opens the puzzle library while the first puzzle remains active',
    verifications: [
      { spec: 'Generation remains available with an in-progress puzzle', check: async () => await expect(later.getByRole('button', { name: 'Generate Foundations puzzle' })).toBeEnabled() },
      { spec: 'The interface explains that the current puzzle remains in History', check: async () => await expect(later.getByText('Generating another puzzle keeps this one available in History.')).toBeVisible() }
    ]
  });
  await later.getByRole('button', { name: 'Generate Foundations puzzle' }).click();
  await steps.step('different-puzzle-opened', {
    description: 'The second tab opens another independent puzzle stream',
    verifications: [
      { spec: 'The new board starts without either earlier entry', check: async () => {
        await expect(later.locator(`[data-cell="${firstCell}"]`)).not.toHaveAccessibleName(new RegExp(`editable, ${firstValue}`));
        await expect(later.locator(`[data-cell="${secondCell}"]`)).not.toHaveAccessibleName(new RegExp(`editable, ${secondValue}`));
      } },
      { spec: 'The first tab stays on its original puzzle and retains both values', check: async () => {
        await expect(page.locator(`[data-cell="${firstCell}"]`)).toHaveAccessibleName(new RegExp(`editable, ${firstValue}`));
        await expect(page.locator(`[data-cell="${secondCell}"]`)).toHaveAccessibleName(new RegExp(`editable, ${secondValue}`));
      } }
    ]
  });
  steps.generateDocs();
});
