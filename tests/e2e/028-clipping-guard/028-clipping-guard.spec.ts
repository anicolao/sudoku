import { expect, test } from '@playwright/test';
import { assertNoClippedDescendants } from '../helpers/test-step-helper';

test('capture guard rejects content clipped by a fixed-height ancestor', async ({ page }) => {
  await page.setContent(`
    <div style="position: relative; width: 200px; height: 40px; overflow: hidden">
      <div style="position: absolute; top: 30px; height: 20px">Clipped content</div>
    </div>
  `);

  await expect(page.evaluate(assertNoClippedDescendants)).rejects.toThrow(/div is clipped by div/);
});

test('capture guard accepts content fully within its clipping ancestor', async ({ page }) => {
  await page.setContent(`
    <div style="position: relative; width: 200px; height: 40px; overflow: hidden">
      <div style="position: absolute; top: 10px; height: 20px">Visible content</div>
    </div>
  `);

  await expect(page.evaluate(assertNoClippedDescendants)).resolves.toBeUndefined();
});
