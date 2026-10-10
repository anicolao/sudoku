import { expect, test } from '@playwright/test';
import { assertNoClippedDescendants } from '../helpers/test-step-helper';

test('capture guard rejects content clipped by a fixed-height ancestor', async ({ page }) => {
  await page.setContent(`
    <div style="position: relative; width: 200px; height: 40px; overflow: hidden">
      <div style="position: absolute; top: 30px; height: 20px">Clipped content</div>
    </div>
  `);

  await expect(page.evaluate(assertNoClippedDescendants)).rejects.toThrow(/div (?:clips|is clipped by div)/);
});

test('capture guard accepts content fully within its clipping ancestor', async ({ page }) => {
  await page.setContent(`
    <div style="position: relative; width: 200px; height: 40px; overflow: hidden">
      <div style="position: absolute; top: 10px; height: 20px">Visible content</div>
    </div>
  `);

  await expect(page.evaluate(assertNoClippedDescendants)).resolves.toBeUndefined();
});

test('capture guard rejects content outside the viewport', async ({ page }) => {
  await page.setContent('<button style="position: fixed; right: -12px; width: 80px; height: 44px">Clipped action</button>');

  await expect(page.evaluate(assertNoClippedDescendants)).rejects.toThrow(/button escapes or is clipped by the viewport/);
});

test('capture guard rejects a control covered by fixed navigation', async ({ page }) => {
  await page.setContent(`
    <button style="position: fixed; right: 10px; bottom: 10px; width: 120px; height: 44px">Clipped action</button>
    <nav style="position: fixed; z-index: 2; right: 0; bottom: 0; left: 0; height: 30px; background: white">Navigation</nav>
  `);

  await expect(page.evaluate(assertNoClippedDescendants)).rejects.toThrow(/button is covered by nav/);
});
