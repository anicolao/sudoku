import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { photoExamplePassed, photoReviewReport } from '../../../scripts/photo-review-report.mjs';

const directory = path.resolve('examples');
const goldens: Array<{filename: string; givens: string; description?: string; requiresReview?: boolean}> =
  JSON.parse(readFileSync(path.join(directory, 'goldens.json'), 'utf8'));
interface ImportResult {
  filename: string;
  source: string;
  values?: string;
  preview?: string;
  ready?: boolean;
  started?: boolean;
  reviewRequired?: boolean;
  error?: string;
}

test('every example recognizes its golden master and reaches its expected outcome', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'Recognition is viewport-independent.');
  test.setTimeout(20 * 60_000);
  const files = readdirSync(directory).filter(name => /\.(jpe?g|png|webp)$/i.test(name)).sort();
  expect(goldens.map(item => item.filename).sort(), 'Every example needs an explicit golden master').toEqual(files);
  for (const golden of goldens) expect(golden.givens, golden.filename).toMatch(/^[.1-9]{81}$/);
  const results: ImportResult[] = [];
  try {
    for (const golden of goldens) {
      const context = await browser.newContext({ viewport: { width: 393, height: 852 }, serviceWorkers: 'block' });
      const page = await context.newPage();
      const extension = path.extname(golden.filename).slice(1).replace('jpg', 'jpeg');
      const result: ImportResult = {
        filename: golden.filename,
        source: `data:image/${extension};base64,${readFileSync(path.join(directory, golden.filename)).toString('base64')}`
      };
      results.push(result);
      try {
        await page.goto(testInfo.project.use.baseURL!);
        await page.getByRole('button', { name: 'Puzzles', exact: true }).click();
        await page.getByRole('button', { name: 'Import from photo' }).click();
        await page.getByLabel('Choose Sudoku photo').setInputFiles(path.join(directory, golden.filename));
        await page.locator('[data-photo-cell="0"]').or(page.getByRole('alert')).waitFor({ timeout: 150_000 });
        if (await page.getByRole('alert').isVisible()) throw new Error(await page.getByRole('alert').innerText());
        result.values = (await page.locator('[data-photo-cell]').allTextContents()).map(value => value || '.').join('');
        result.preview = await page.locator('img[alt="Straightened grayscale Sudoku used for recognition"]').getAttribute('src') ?? undefined;
        result.ready = await page.getByRole('heading', { name: 'Puzzle ready', exact: true }).isVisible();
        if (golden.requiresReview) {
          await expect(page.getByRole('heading', { name: 'Correct any digit', exact: true })).toBeVisible();
          await expect(page.getByRole('button', { name: 'Start photographed puzzle' })).toHaveCount(0);
          await page.getByRole('button', { name: 'Check puzzle', exact: true }).click();
          await expect(page.getByRole('alert')).toContainText('does not have one unique solution', { timeout: 30_000 });
          await expect(page.getByRole('button', { name: 'Start photographed puzzle' })).toHaveCount(0);
          expect(await page.evaluate(() => localStorage.getItem('sudoku.event-store.v1'))).toBeNull();
          result.reviewRequired = true;
          result.started = false;
        } else if (result.ready) {
          await page.getByRole('button', { name: 'Start photographed puzzle' }).click();
          await expect(page.getByRole('grid', { name: /Sudoku puzzle/ })).toBeVisible();
          const imported = await page.evaluate(() => {
            const store = JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '{}');
            return store.events?.find((event: { type: string }) => event.type === 'game/imported')?.payload.puzzle.givens;
          });
          result.started = imported === golden.givens;
        }
      } catch (error) {
        result.error = String(error);
      } finally {
        await context.close();
      }
    }
  } finally {
    const reviewPath = testInfo.outputPath('photo-import-review.html');
    writeFileSync(reviewPath, photoReviewReport(goldens, results));
    await testInfo.attach('photo-import-review.html', {
      path: reviewPath, contentType: 'text/html'
    });
    await testInfo.attach('photo-import-results.json', {
      body: Buffer.from(JSON.stringify(results.map(({ source, preview, ...result }) => result), null, 2)),
      contentType: 'application/json'
    });
  }
  const failures = goldens.flatMap(golden => {
    const result = results.find(item => item.filename === golden.filename);
    return photoExamplePassed(golden, result) ? [] : [golden.filename];
  });
  expect(failures, 'See photo-import-review.html for originals, golden masters, crops, and cell differences').toEqual([]);
});
