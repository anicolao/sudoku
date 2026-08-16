import { expect, test } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';

test('storage failure remains playable in memory', async ({ page }, testInfo) => {
  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata('Continue when browser storage is unavailable', 'A failed storage probe is visible, specific, and non-fatal: the player can still generate and play for the current tab session.');
  await page.addInitScript(() => {
    Storage.prototype.setItem = function (): never { throw new DOMException('blocked', 'QuotaExceededError'); };
  });
  await page.goto('/');
  await steps.step('memory-only-explained', {
    description: 'Startup explains that progress cannot be saved', persistenceStatus: 'memory-only',
    verifications: [{ spec: 'Memory only and the exact persistence warning are visible', check: async () => {
      await expect(page.getByText('Memory only')).toBeVisible();
      await expect(page.getByText('This browser cannot save progress. This session will continue in memory.')).toBeVisible();
    } }]
  });
  await page.getByRole('button', { name: 'Generate Easy puzzle' }).click();
  await steps.step('memory-only-puzzle-started', {
    description: 'The player generates a usable puzzle for this session', persistenceStatus: 'memory-only',
    verifications: [{ spec: 'The validated board is interactive despite unavailable persistence', check: async () => {
      await expect(page.getByRole('gridcell')).toHaveCount(81);
      await expect(page.getByRole('button', { name: /^1,/ })).toBeEnabled();
    } }]
  });
  steps.generateDocs();
});
