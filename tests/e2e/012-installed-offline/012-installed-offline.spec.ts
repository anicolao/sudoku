import { expect, test } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';

test('the installed application shell reopens offline', async ({ context, page }, testInfo) => {
  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata(
    'Installed offline shell',
    'After one online load, the static application shell can close and reopen without a network.'
  );

  await page.goto('/');
  await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
  await page.waitForFunction(() => document.documentElement.dataset.offlineReady === 'true');

  await context.setOffline(true);
  await page.reload();

  await steps.step('reopened', {
    description: 'The installed shell reopens with the network disabled',
    verifications: [
      {
        spec: 'The cached page keeps its stable Sudoku title',
        check: async () => expect(page).toHaveTitle('Sudoku — Local puzzle play')
      },
      {
        spec: 'The welcome screen remains available from the application cache',
        check: async () => expect(page.getByRole('heading', { level: 1 })).toHaveText('A quiet place to solve.')
      },
      {
        spec: 'Local persistence remains ready while offline',
        check: async () => expect(page.getByRole('status')).toHaveText('On this device')
      }
    ]
  });

  await context.setOffline(false);
  steps.generateDocs();
});
