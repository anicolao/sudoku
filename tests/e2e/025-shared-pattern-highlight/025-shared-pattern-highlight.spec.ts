import { expect, test } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';

const GIVENS = '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79';
const PATTERN_CELLS = [2, 3, 5, 6];

test('an authored puzzle URL keeps its pattern cells highlighted', async ({ page }, testInfo) => {
  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata(
    'Open a puzzle with a persistent pattern hint',
    'An authored URL can mark cells with the walkthrough rule-pattern treatment without revealing their values. The checked import discloses the hint, and the marks survive solving, reload, and re-sharing.'
  );
  const payload = `${GIVENS}_pattern=13,14,16,17`;
  await page.goto(`/?${new URLSearchParams({ p: payload })}`);

  await steps.step('pattern-link-checked', {
    description: 'The pattern hint is disclosed before the puzzle is accepted',
    verifications: [
      { spec: 'The checked summary reports four persistent pattern cells', check: async () => {
        await expect(page.getByRole('heading', { name: 'Shared puzzle ready' })).toBeVisible();
        await expect(page.getByText('The indicated pattern cells will stay highlighted while you solve.')).toBeVisible();
        await expect(page.locator('.incoming-facts')).toContainText('Pattern4 cells');
        await expect(page.getByRole('button', { name: 'Start with pattern hint' })).toBeEnabled();
      } },
      { spec: 'Validation remains ephemeral until consent', check: async () => {
        expect(await page.evaluate(() => localStorage.getItem('sudoku.event-store.v1'))).toBeNull();
      } }
    ]
  });

  await page.getByRole('button', { name: 'Start with pattern hint' }).click();
  await steps.step('pattern-puzzle-opened', {
    description: 'The authored cells use the existing rule-pattern highlight',
    verifications: [
      { spec: 'Exactly the four URL cells are marked as rule-pattern context', check: async () => {
        await expect(page.locator('.sudoku-cell.walkthrough-context')).toHaveCount(4);
        for (const cell of PATTERN_CELLS) {
          await expect(page.locator(`[data-cell="${cell}"]`)).toHaveClass(/walkthrough-context/);
          await expect(page.locator(`[data-cell="${cell}"]`)).toHaveAttribute('aria-label', /rule pattern/);
        }
      } },
      { spec: 'One format 4 import stores the pattern without a revealed value', check: async () => {
        const events = await page.evaluate(() =>
          JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '').events
        );
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
          type: 'game/imported',
          payload: {
            puzzle: { provenance: { kind: 'puzzle-link', formatVersion: 4 } },
            sharedMetadata: { patternCells: PATTERN_CELLS }
          }
        });
        expect(events[0].payload.work).toBeUndefined();
      } }
    ]
  });

  await page.locator('[data-cell="2"]').click();
  await page.locator('.number-pad').getByRole('button', { name: /^4,/ }).click();
  await expect(page.locator('[data-cell="2"]')).toContainText('4');
  await page.waitForFunction(() => document.documentElement.dataset.eventStorePending !== 'true');
  await page.reload();
  await steps.step('pattern-survives-progress', {
    description: 'Pattern marks remain after a placement and reload',
    verifications: [
      { spec: 'The solved pattern cell and all other pattern cells remain highlighted', check: async () => {
        await expect(page.locator('[data-cell="2"]')).toContainText('4');
        await expect(page.locator('.sudoku-cell.walkthrough-context')).toHaveCount(4);
      } },
      { spec: 'The user placement is ordinary work, not a revealed hint', check: async () => {
        const events = await page.evaluate(() =>
          JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '').events
        );
        expect(events.at(-1)).toMatchObject({ type: 'cell/value-entered', payload: { cell: 2, value: 4 } });
        expect(events.some((event: { type: string }) => event.type === 'hint/revealed')).toBe(false);
      } }
    ]
  });

  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await page.getByRole('button', { name: 'Share puzzle only' }).click();
  await steps.step('pattern-reshared', {
    description: 'A clean re-share retains the authored pattern hint',
    verifications: [
      { spec: 'The clean puzzle link contains pattern coordinates but omits player work', check: async () => {
        const link = await page.getByTestId('share-link').getAttribute('data-link') ?? '';
        expect(new URL(link).searchParams.get('p')).toBe(`${GIVENS}_pattern=13,14,16,17`);
      } }
    ]
  });

  steps.generateDocs();
});
