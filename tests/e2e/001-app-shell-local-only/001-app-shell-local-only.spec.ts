import { expect, test } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';

test('the local-only application shell renders deterministically', async ({ page }, testInfo) => {
  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata(
    'Application shell and local-only boundary',
    'The static Sudoku client is ready to generate a validated puzzle without an account or remote service.'
  );

  const requests: Array<{ method: string; url: string }> = [];
  page.on('request', (request) => requests.push({ method: request.method(), url: request.url() }));

  await page.goto('/');
  await steps.step('local-shell-ready', {
    description: 'The calm local-only shell is ready on this device',
    verifications: [
      {
        spec: 'The page exposes the stable Sudoku title and welcome heading',
        check: async () => {
          await expect(page).toHaveTitle('Sudoku — Local puzzle play');
          await expect(page.getByRole('heading', { level: 1 })).toHaveText('A quiet place to solve.');
        }
      },
      {
        spec: 'Local storage readiness is visible without an account or cloud claim',
        check: async () => {
          await expect(page.getByRole('status')).toHaveText('On this device');
          await expect(page.getByRole('button', { name: /sign in|log in/i })).toHaveCount(0);
          await expect(page.locator('input[type="email"], input[type="password"]')).toHaveCount(0);
        }
      },
      {
        spec: 'The local five-level puzzle generator is available',
        check: async () => {
          await expect(page.getByRole('button', { name: 'Generate Foundations puzzle' })).toBeEnabled();
          await expect(page.getByText('The puzzle and its solution never leave this browser.')).toBeVisible();
        }
      },
      {
        spec: 'The shell states the unique, no-guess, and offline product promises',
        check: async () => {
          const promises = page.getByRole('list', { name: 'Puzzle promises' }).getByRole('listitem');
          await expect(promises).toHaveCount(3);
          await expect(promises).toContainText([
            'Unique solution',
            'No guessing required',
            'Ready for offline play'
          ]);
        }
      },
      {
        spec: 'Every browser request is a same-origin GET for the static shell',
        check: async () => {
          expect(requests.length).toBeGreaterThan(0);
          for (const request of requests) {
            expect(request.method).toBe('GET');
            expect(new URL(request.url).origin).toBe('http://127.0.0.1:4177');
          }
        }
      }
    ]
  });

  steps.generateDocs();
});
