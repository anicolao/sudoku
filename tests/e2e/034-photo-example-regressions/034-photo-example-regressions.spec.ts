import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { photoExamplePassed, photoReviewReport } from '../../../scripts/photo-review-report.mjs';
import { masterDifferences, validateMaster, type PhotoMaster } from '../../../scripts/photo-master.mjs';
import type { PhotoPolicies } from '../../../scripts/photo-review-report.mjs';

// The portable image/layer report is the diagnostic artifact. Tracing 38 OCR
// sessions retains huge WASM/network resources and can exhaust CI disk space.
test.use({trace:'off'});

const directory = path.resolve('examples');
const goldens: PhotoMaster[] =
  JSON.parse(readFileSync(path.join(directory, 'goldens.json'), 'utf8'));
const policies: PhotoPolicies = JSON.parse(readFileSync(path.join(directory, 'recognition-policy.json'), 'utf8'));
interface ImportResult {
  filename: string;
  source: string;
  values?: string;
  givens?: string;
  placements?: string;
  notes?: Record<string, string>;
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
  for (const golden of goldens) validateMaster(golden);
  const results: ImportResult[] = [];
  try {
    for (const golden of goldens) {
      const policy = policies.overrides[golden.filename] ?? policies.default;
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
        const roles = await page.locator('[data-photo-cell]').evaluateAll(cells => cells.map(cell => cell.getAttribute('data-photo-role')));
        result.givens = [...result.values].map((value, cell) => roles[cell] === 'placement' ? '.' : value).join('');
        result.placements = [...result.values].map((value, cell) => roles[cell] === 'placement' ? value : '.').join('');
        result.notes = {}; // This version does not import candidate notes.
        result.preview = await page.locator('img[alt="Straightened grayscale Sudoku used for recognition"]').getAttribute('src') ?? undefined;
        result.ready = await page.getByRole('heading', { name: 'Puzzle ready', exact: true }).isVisible();
        if (policy.outcome === 'review') {
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
            const payload = store.events?.find((event: { type: string }) => event.type === 'game/imported')?.payload;
            const placements = Array(81).fill('.');
            for (const action of payload?.work ?? []) if (action.type === 'value') placements[action.cell] = String(action.value);
            return {givens:payload?.puzzle.givens,placements:placements.join('')};
          });
          result.started = masterDifferences(golden, {...imported,notes:{}}, policy).length === 0;
        }
      } catch (error) {
        result.error = String(error);
      } finally {
        await context.close();
      }
    }
  } finally {
    const reviewPath = testInfo.outputPath('photo-import-review.html');
    writeFileSync(reviewPath, photoReviewReport(goldens, results, policies));
    const resultsPath = testInfo.outputPath('photo-import-results.json');
    writeFileSync(resultsPath, JSON.stringify(results.map(({ source, preview, ...result }) => result), null, 2));
    await testInfo.attach('photo-import-review.html', {
      path: reviewPath, contentType: 'text/html'
    });
    await testInfo.attach('photo-import-results.json', {
      path: resultsPath,
      contentType: 'application/json'
    });
  }
  const failures = goldens.flatMap(golden => {
    const result = results.find(item => item.filename === golden.filename);
    return photoExamplePassed(golden, result, policies.overrides[golden.filename] ?? policies.default) ? [] : [golden.filename];
  });
  expect(failures, 'See photo-import-review.html for originals, golden masters, crops, and cell differences').toEqual([]);
});
