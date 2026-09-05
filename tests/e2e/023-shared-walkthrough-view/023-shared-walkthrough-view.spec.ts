import { expect, test } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';

const SOLUTION = '549371628826945371173628945654719283917283456382456719738562194491837562265194837';
const GIVENS = `..${SOLUTION.slice(2)}`;

test('view=walkthrough opens shared progress at its first ordered placement', async ({ page }, testInfo) => {
  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata(
    'Open a book link directly as a solve walkthrough',
    'A validated progress link can request walkthrough presentation. Consent imports one origin, analyzes the ordered shared placements with visible progress, and opens at placement 1 without visiting the play board.'
  );
  const payload = `${GIVENS}_115_124_time=5000`;
  const query = new URLSearchParams({ p: payload, view: 'walkthrough' });
  await page.goto(`/?${query}`);

  await steps.step('walkthrough-link-checked', {
    description: 'The book link is validated before its progress is accepted',
    verifications: [
      { spec: 'The preview identifies two placements and the requested walkthrough', check: async () => {
        await expect(page.getByRole('heading', { name: 'Shared puzzle ready' })).toBeVisible();
        await expect(page.locator('.incoming-facts')).toContainText('Filled2');
        await expect(page.getByText('begin at placement 1')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Open walkthrough' })).toBeEnabled();
      } },
      { spec: 'Validation is still ephemeral and both query parameters remain until consent', check: async () => {
        expect(await page.evaluate(() => localStorage.getItem('sudoku.event-store.v1'))).toBeNull();
        expect(new URL(page.url()).searchParams.get('view')).toBe('walkthrough');
        expect(new URL(page.url()).searchParams.has('p')).toBe(true);
      } }
    ]
  });

  await page.getByRole('button', { name: 'Open walkthrough' }).click();
  await expect(page.getByRole('progressbar', { name: 'Walkthrough analysis progress' })).toBeVisible();
  await steps.step('first-shared-placement', {
    description: 'The imported solve opens directly on its first shared placement',
    verifications: [
      { spec: 'The walkthrough starts at placement 1 of 2 with the first shared value highlighted', check: async () => {
        await expect(page.getByRole('heading', { name: 'Learn from this solve' })).toBeVisible();
        await expect(page.getByText('Placement 1 of 2 · 00:05')).toBeVisible();
        await expect(page.locator('[data-cell="0"]')).toHaveClass(/walkthrough-target/);
        await expect(page.getByRole('gridcell', { name: /editable, empty/ })).toHaveCount(1);
      } },
      { spec: 'One import records the requested initial view and the consumed URL is clean', check: async () => {
        const events = await page.evaluate(() =>
          JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '').events
        );
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
          type: 'game/imported',
          payload: {
            initialView: 'walkthrough',
            puzzle: { provenance: { kind: 'puzzle-link', formatVersion: 3 } },
            work: [
              { type: 'value', cell: 0, value: 5 },
              { type: 'value', cell: 1, value: 4 }
            ]
          }
        });
        expect(new URL(page.url()).searchParams.has('p')).toBe(false);
        expect(new URL(page.url()).searchParams.has('view')).toBe(false);
      } }
    ]
  });

  await page.getByRole('button', { name: 'Next placement' }).click();
  await steps.step('final-shared-placement', {
    description: 'The next action advances to the second shared placement',
    verifications: [
      { spec: 'Placement 2 is a Full House and completes the replayed board', check: async () => {
        await expect(page.getByText('Placement 2 of 2 · 00:05')).toBeVisible();
        await expect(page.getByText('Full House', { exact: true })).toBeVisible();
        await expect(page.locator('[data-cell="1"]')).toHaveClass(/walkthrough-target/);
        await expect(page.getByRole('gridcell', { name: /editable, empty/ })).toHaveCount(0);
      } }
    ]
  });

  steps.generateDocs();
});
