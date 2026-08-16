import { expect, test } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';

test('a hint is explicit, cancellable, deterministic, and recorded', async ({ page }, testInfo) => {
  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata(
    'Cancel and confirm a hint',
    'A hint never changes the board silently: the player sees a confirmation, cancellation is inert, and confirmation records the exact revealed cell and value.'
  );
  const stream = async () => page.evaluate(() =>
    JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '{"events":[]}').events
  );
  await page.goto('/');

  await page.getByRole('button', { name: 'Generate Easy puzzle' }).click();
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
  await steps.step('hint-confirmation-opened', {
    description: 'The player opens a clear confirmation before revealing anything',
    verifications: [
      { spec: 'The modal explains that the reveal is recorded in the summary', check: async () => {
        const dialog = page.getByRole('dialog', { name: 'Reveal one cell?' });
        await expect(dialog).toBeVisible();
        await expect(dialog).toContainText('This will be recorded in your game summary.');
      } },
      { spec: 'Opening the confirmation appends no event', check: async () => expect(await stream()).toHaveLength(1) }
    ]
  });

  await page.getByRole('button', { name: 'Cancel' }).click();
  await steps.step('hint-cancelled', {
    description: 'The player cancels and returns to the unchanged puzzle',
    verifications: [
      { spec: 'The dialog closes and the board still has only its fixed givens', check: async () => {
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await expect(page.getByRole('gridcell', { name: /revealed by hint/ })).toHaveCount(0);
      } },
      { spec: 'Cancellation leaves the event stream unchanged', check: async () => expect(await stream()).toHaveLength(1) }
    ]
  });

  await page.getByRole('button', { name: 'Hint' }).click();
  await steps.step('hint-confirmation-reopened', {
    description: 'The player deliberately opens the confirmation again',
    verifications: [
      { spec: 'Reveal one cell is now the explicit confirm action', check: async () => await expect(page.getByRole('button', { name: 'Reveal one cell' })).toBeEnabled() }
    ]
  });

  await page.getByRole('button', { name: 'Reveal one cell' }).click();
  await steps.step('one-cell-revealed', {
    description: 'Confirmation reveals the deterministic lowest-index eligible cell',
    verifications: [
      { spec: 'Exactly one cell is labelled as revealed by hint and selected', check: async () => {
        const hinted = page.getByRole('gridcell', { name: /revealed by hint/ });
        await expect(hinted).toHaveCount(1);
        await expect(hinted).toHaveAttribute('aria-selected', 'true');
      } },
      { spec: 'One hint/revealed fact records the exact cell and solution value', check: async () => {
        const events = await stream();
        expect(events).toHaveLength(2);
        const hint = events[1];
        expect(hint).toMatchObject({ type: 'hint/revealed' });
        expect(hint.payload.value).toBe(Number(events[0].payload.puzzle.solution[hint.payload.cell]));
      } },
      { spec: 'The visible game log describes the same reveal', check: async () => {
        await expect(page.locator('[data-event-type="hint/revealed"]')).toHaveCount(1);
        await expect(page.locator('[data-event-type]').first()).toContainText('Revealed');
      } }
    ]
  });

  steps.generateDocs();
});
