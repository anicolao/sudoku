import { expect, test } from '@playwright/test';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';

test('native and in-app printing create a puzzle sheet and a solved walkthrough sheet', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'The printable Letter pages need only one desktop rendering.');

  await page.goto('/');
  await page.getByRole('button', { name: 'Generate Foundations puzzle' }).click();
  await expect(page.getByRole('grid', { name: 'Foundations Sudoku puzzle' })).toBeVisible();
  const puzzle = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '').events[0].payload.puzzle as {
      givens: string;
      solution: string;
    }
  );

  // The print surface is ready before the in-app print action, so Cmd/Ctrl-P and
  // the browser menu produce the same pair of pages.
  await expect(page.locator('.print-page')).toHaveCount(2);
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await expect(page.locator('.print-solution-page')).toContainText('Open the walkthrough');

  await page.evaluate(() => {
    Object.defineProperty(window, 'print', {
      configurable: true,
      value: () => { document.documentElement.dataset.printInvoked = 'true'; }
    });
  });

  await page.getByRole('button', { name: 'Share' }).click();
  await page.getByRole('button', { name: /Print puzzle pair/ }).click();
  await expect.poll(() => page.locator('html').getAttribute('data-print-invoked')).toBe('true');
  await expect(page.locator('.print-page')).toHaveCount(2);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.app-shell')).toBeHidden();
  await expect(page.locator('.print-page')).toHaveCount(2);

  const qrLinks: string[] = [];
  for (const image of await page.locator('.print-qr').all()) {
    const qr = PNG.sync.read(await image.screenshot());
    const decoded = jsQR(new Uint8ClampedArray(qr.data), qr.width, qr.height)?.data;
    expect(decoded).toBeTruthy();
    qrLinks.push(decoded ?? '');
  }
  const puzzleLink = new URL(qrLinks[0]);
  const walkthroughLink = new URL(qrLinks[1]);
  expect(puzzleLink.searchParams.get('p')).toBe(puzzle.givens);
  expect(puzzleLink.searchParams.has('view')).toBe(false);
  expect(walkthroughLink.searchParams.get('view')).toBe('walkthrough');

  const [walkthroughGivens, ...placements] = (walkthroughLink.searchParams.get('p') ?? '').split('_');
  const solved = [...walkthroughGivens];
  for (const placement of placements) {
    expect(placement).toMatch(/^[1-9]{3}$/);
    const cell = (Number(placement[0]) - 1) * 9 + Number(placement[1]) - 1;
    expect(solved[cell]).toBe('.');
    solved[cell] = placement[2];
  }
  expect(placements).toHaveLength([...puzzle.givens].filter((value) => value === '.').length);
  expect(solved.join('')).toBe(puzzle.solution);

  await expect(page.locator('.print-puzzle-page')).toHaveScreenshot('print-puzzle-page-desktop-macos.png');
  await expect(page.locator('.print-solution-page')).toHaveScreenshot('print-solution-page-desktop-macos.png');

  const pdf = await page.pdf({
    path: testInfo.outputPath('printable-puzzle-pair.pdf'),
    format: 'Letter',
    printBackground: true,
    preferCSSPageSize: true
  });
  expect(pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)).toHaveLength(2);
});
