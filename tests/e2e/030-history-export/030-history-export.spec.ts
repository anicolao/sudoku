import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { TestStepHelper } from '../helpers/test-step-helper';

test('download the entire Classic and Killer history locally for analysis', async ({ page, context }, testInfo) => {
  test.setTimeout(60_000);
  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata('Export all history for analysis', 'As a tester, I can download all retained Classic and Killer attempts as a versioned JSON file, including solutions and complete recorded events, then send the file to a reviewer myself.');
  await page.goto('/');
  await page.getByRole('button', { name: 'Generate Foundations puzzle' }).click();
  await expect(page.getByRole('grid')).toBeVisible();
  await page.getByRole('button', { name: 'Puzzles', exact: true }).click();
  await page.getByRole('button', { name: 'Start Killer Sudoku' }).click();
  await page.getByRole('button', { name: 'Start Killer puzzle', exact: true }).click();
  await expect(page.getByRole('grid', { name: 'Killer Sudoku puzzle' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Hint', exact: true }).click();
  await page.getByRole('button', { name: /Reveal one cell/ }).click();
  await expect(page.locator('.sudoku-cell.hinted')).toHaveCount(1);
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await steps.step('export-from-history', {
    description: 'History offers a download covering every attempt, across all pages',
    verifications: [{ spec: 'The export control remains visible alongside paginated history', check: async () => {
      await expect(page.getByRole('button', { name: 'Export entire history', exact: true })).toBeVisible();
      await expect(page.getByText('Attempt 1 of 2')).toBeVisible();
    } }]
  });
  await page.getByRole('button', { name: 'Export entire history', exact: true }).click();
  await steps.step('review-export-contents', {
    description: 'Review the file contents before choosing Download JSON',
    verifications: [{ spec: 'The dialog discloses solutions and timestamps, keeps keyboard focus, and sends nothing automatically', check: async () => {
      await expect(page.getByRole('dialog')).toContainText('puzzle solutions');
      await expect(page.getByRole('dialog')).toContainText('Nothing is sent automatically');
      await expect(page.getByRole('button', { name: 'Download JSON' })).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(page.getByRole('button', { name: 'Back to History' })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('button', { name: 'Export entire history', exact: true })).toBeFocused();
      await page.keyboard.press('Enter');
    } }]
  });
  await page.waitForFunction(() => document.documentElement.dataset.eventStorePending !== 'true');
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('sudoku.event-store.v1')!));
  await context.setOffline(true);
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download JSON' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^sudoku-history-.*\.json$/);
  const file = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(file.formatVersion).toBe(1);
  expect(file.format).toBe('sudoku-history');
  expect(file.eventDocument).toEqual(before);
  expect(file.eventDocument.events.filter((event: { type: string }) => event.type === 'game/started')).toHaveLength(2);
  expect(file.eventDocument.events.some((event: { type: string }) => event.type === 'hint/revealed')).toBe(true);
  expect(file.eventDocument.events.some((event: { payload: { puzzle?: { variant?: string } } }) => event.payload.puzzle?.variant === 'killer')).toBe(true);
  expect(file.coverage.includesSolutions).toBe(true);
  await expect(page.getByRole('dialog').getByRole('status')).toContainText('Download requested');
  expect(requests).toEqual([]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sudoku.event-store.v1')!))).toEqual(before);
  await steps.step('history-file-downloaded', {
    description: 'Download the JSON offline without altering any recorded event',
    verifications: [{ spec: 'The downloaded document equals all stored events and can be sent manually', check: async () => {
      await expect(page.getByRole('dialog').getByRole('status')).toContainText('Send the JSON file');
    } }]
  });
  await page.getByRole('button', { name: 'Back to History' }).click();
  await expect(page.getByRole('button', { name: 'Export entire history', exact: true })).toBeFocused();
  steps.generateDocs();
});

test('empty memory-only history can be downloaded and a failed download can be retried', async ({ page }) => {
  await page.addInitScript(() => {
    IDBFactory.prototype.open = function (): never { throw new DOMException('blocked', 'SecurityError'); };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await page.getByRole('button', { name: 'Export entire history', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('memory-only session');
  await page.evaluate(() => {
    const original = URL.createObjectURL;
    URL.createObjectURL = () => { URL.createObjectURL = original; throw new Error('Simulated download failure'); };
  });
  await page.getByRole('button', { name: 'Download JSON' }).click();
  await expect(page.getByRole('alert')).toContainText('Could not export history');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download JSON' }).click();
  const download = await downloading;
  const file = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(file.storage).toBe('memory-only');
  expect(file.eventDocument.events).toEqual([]);
  await expect(page.getByRole('alert')).toHaveCount(0);
});
