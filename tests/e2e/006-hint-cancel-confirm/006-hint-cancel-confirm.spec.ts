import { expect, test } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';

test('a hint can name a technique, identify a cell, or reveal it', async ({ page }, testInfo) => {
  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata(
    'Choose how much help a hint provides',
    'Technique and cell guidance use the same simplest book-rule placement without changing canonical history. A reveal places that target and records the exact cell and value.'
  );
  const stream = async () => page.evaluate(() =>
    JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '{"events":[]}').events
  );
  await page.goto('/');

  await page.getByRole('button', { name: 'Generate Foundations puzzle' }).click();
  await steps.step('puzzle-generated', {
    description: 'The generated puzzle offers an enabled Hint action',
    verifications: [
      { spec: 'Hint is available and the summary has no hint event', check: async () => {
        await expect(page.getByRole('button', { name: 'Hint' })).toBeEnabled();
        expect(await stream()).toHaveLength(1);
      } }
    ]
  });

  await page.getByRole('button', { name: 'Hint' }).click();
  await steps.step('hint-choices-opened', {
    description: 'The player opens three distinct levels of help',
    verifications: [
      { spec: 'The modal offers technique, cell, and reveal choices', check: async () => {
        const dialog = page.getByRole('dialog', { name: 'Choose a hint' });
        await expect(dialog).toBeVisible();
        await expect(dialog.getByRole('button', { name: /Technique only/ })).toBeEnabled();
        await expect(dialog.getByRole('button', { name: /Cell only/ })).toBeEnabled();
        await expect(dialog.getByRole('button', { name: /Reveal one cell/ })).toBeEnabled();
      } },
      { spec: 'Opening the choices appends no event', check: async () => expect(await stream()).toHaveLength(1) }
    ]
  });

  await page.getByRole('button', { name: /Technique only/ }).click();
  await steps.step('technique-hint-shown', {
    description: 'The player asks only which technique to try',
    verifications: [
      { spec: 'The result names one supported book rule without naming a cell or value', check: async () => {
        const dialog = page.getByRole('dialog', { name: /Try / });
        await expect(dialog.getByRole('heading')).toHaveText(/Try (Full House|Naked Single|Hidden Single|Naked Pairs|Hidden Pairs|Pointing Pairs|Y-Wing|X-Wing|Swordfish|Naked Triples|Simple Colors|XY-Chains|Unique Rectangles|3D Medusa)/);
        await expect(dialog).toContainText('simplest book rule');
        await expect(dialog).not.toContainText(/r\d+c\d+/);
      } },
      { spec: 'Technique advice changes no cell and appends no event', check: async () => {
        await expect(page.getByRole('gridcell', { selected: true })).toHaveCount(0);
        expect(await stream()).toHaveLength(1);
      } }
    ]
  });

  await page.getByRole('button', { name: 'Back to puzzle' }).click();
  await page.getByRole('button', { name: 'Hint' }).click();
  await page.getByRole('button', { name: /Cell only/ }).click();
  let advisedCell = -1;
  await steps.step('cell-hint-shown', {
    description: 'The player asks which cell to solve without seeing its contents',
    verifications: [
      { spec: 'The result names one coordinate and selects that still-empty cell', check: async () => {
        const selected = page.getByRole('gridcell', { selected: true });
        await expect(selected).toHaveCount(1);
        await expect(selected).toHaveAccessibleName(/editable, empty, selected/);
        advisedCell = Number(await selected.getAttribute('data-cell'));
        const coordinate = `r${Math.floor(advisedCell / 9) + 1}c${(advisedCell % 9) + 1}`;
        await expect(page.getByRole('dialog', { name: `Try ${coordinate}` })).toContainText('number is still yours to find');
      } },
      { spec: 'Cell advice reveals no number and appends no event', check: async () => {
        await expect(page.getByRole('gridcell', { name: /revealed by hint/ })).toHaveCount(0);
        expect(await stream()).toHaveLength(1);
      } }
    ]
  });

  await page.getByRole('button', { name: 'Back to puzzle' }).click();
  await page.getByRole('button', { name: 'Hint' }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await steps.step('hint-cancelled', {
    description: 'The player can still cancel from the choice menu',
    verifications: [
      { spec: 'The dialog closes and the board still has only its fixed givens', check: async () => {
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await expect(page.getByRole('gridcell', { name: /revealed by hint/ })).toHaveCount(0);
      } },
      { spec: 'Cancellation leaves the event stream unchanged', check: async () => expect(await stream()).toHaveLength(1) }
    ]
  });

  await page.getByRole('button', { name: 'Hint' }).click();
  await steps.step('hint-choices-reopened', {
    description: 'The player returns and chooses the full reveal',
    verifications: [
      { spec: 'Reveal one cell is now the explicit confirm action', check: async () => await expect(page.getByRole('button', { name: 'Reveal one cell' })).toBeEnabled() }
    ]
  });

  await page.getByRole('button', { name: 'Reveal one cell' }).click();
  await steps.step('one-cell-revealed', {
    description: 'Reveal places the same simplest target identified by Cell only',
    verifications: [
      { spec: 'Exactly one cell is labelled as revealed by hint and selected', check: async () => {
        const hinted = page.getByRole('gridcell', { name: /revealed by hint/ });
        await expect(hinted).toHaveCount(1);
        await expect(hinted).toHaveAttribute('aria-selected', 'true');
        await expect(page.locator(`[data-cell="${advisedCell}"]`)).toHaveAccessibleName(/revealed by hint/);
      } },
      { spec: 'One hint/revealed fact records the exact cell and solution value', check: async () => {
        const events = await stream();
        expect(events).toHaveLength(2);
        const hint = events[1];
        expect(hint).toMatchObject({ type: 'hint/revealed' });
        expect(hint.payload.value).toBe(Number(events[0].payload.puzzle.solution[hint.payload.cell]));
      } }
    ]
  });

  steps.generateDocs();
});
