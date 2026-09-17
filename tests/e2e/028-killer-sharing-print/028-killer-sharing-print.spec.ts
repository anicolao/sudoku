import { expect, test } from '@playwright/test';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { TestStepHelper } from '../helpers/test-step-helper';

test('share a Killer with work and print both cage-preserving handoffs', async ({ page, browser }, testInfo) => {
  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata('Take a Killer puzzle with you', 'As a solver, I can share my Killer and its work, validate it on another device, and print both the puzzle and a complete explained walkthrough with their cages.');
  await page.goto('/');
  await page.getByRole('button', { name: 'Start Killer Sudoku' }).click();
  await page.getByRole('button', { name: 'Start Killer puzzle', exact: true }).click();
  await expect(page.getByRole('grid', { name: 'Killer Sudoku puzzle' })).toBeVisible();
  const puzzle = await page.evaluate(() => JSON.parse(localStorage.getItem('sudoku.event-store.v1')!).events[0].payload.puzzle);
  await page.locator('[data-cell="0"]').focus();
  await page.keyboard.press(puzzle.solution[0]);
  await expect(page.locator('[data-cell="0"] .cell-value')).toHaveText(puzzle.solution[0]);
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await page.getByRole('button', { name: /Share puzzle with work/ }).click();
  let link = '';
  await steps.step('killer-work-link', {
    description: 'Share a readable Killer work link with all cage rules',
    verifications: [{ spec: 'The work link identifies the Killer format and excludes the stored solution', check: async () => {
      link = (await page.getByTestId('share-link').getAttribute('data-link'))!;
      expect(new URL(link).searchParams.get('p')).toMatch(/^K1!/);
      expect(link).not.toContain(puzzle.solution);
    } }]
  });
  const recipient = await browser.newPage({ viewport: page.viewportSize(), serviceWorkers: 'block', locale: 'en-CA', timezoneId: 'America/Toronto', reducedMotion: 'reduce' });
  await recipient.goto(link);
  await expect(recipient.getByRole('heading', { name: 'Shared puzzle ready' })).toBeVisible();
  await expect(recipient.getByText('Killer · unrated')).toBeVisible();
  await recipient.getByRole('button', { name: 'Open shared work' }).click();
  await expect(recipient.getByRole('grid', { name: 'Killer Sudoku puzzle' })).toBeVisible();
  await expect(recipient.locator('[data-cell="0"] .cell-value')).toHaveText(puzzle.solution[0]);
  await expect(recipient.locator('.cage-overlay .cage')).toHaveCount(puzzle.cages.length);
  steps.usePage(recipient);
  await steps.step('killer-work-opened', {
    description: 'The checked import restores cage geometry and progress',
    verifications: [{ spec: 'A new local event stream carries the cage rules and the shared placement', check: async () => {
      const events = await recipient.evaluate(() => JSON.parse(localStorage.getItem('sudoku.event-store.v1')!).events);
      const origin = events.findLast((e: {type:string}) => e.type === 'game/imported');
      expect(origin.payload.puzzle.cages).toEqual(puzzle.cages);
      expect(origin.payload.puzzle.provenance.formatVersion).toBe(5);
    } }]
  });
  steps.generateDocs();

  if (testInfo.project.name !== 'desktop') { await recipient.close(); return; }
  await recipient.evaluate(() => Object.defineProperty(window, 'print', { configurable:true, value:()=>{} }));
  await recipient.getByRole('button', { name:'Share', exact:true }).click();
  await recipient.getByRole('button', { name:/Print puzzle pair/ }).click();
  await expect(recipient.locator('.print-page')).toHaveCount(2);
  await recipient.emulateMedia({ media:'print' });
  await expect(recipient.locator('.print-cages .cage')).toHaveCount(puzzle.cages.length*2);
  const links:string[]=[];
  for(const qr of await recipient.locator('.print-qr').all()) {
    const png=PNG.sync.read(await qr.screenshot());
    const decoded=jsQR(new Uint8ClampedArray(png.data),png.width,png.height)?.data;
    expect(decoded).toBeTruthy(); links.push(decoded!);
  }
  await expect(recipient.locator('.print-puzzle-page')).toHaveScreenshot('killer-print-puzzle-desktop-macos.png');
  await expect(recipient.locator('.print-solution-page')).toHaveScreenshot('killer-print-solution-desktop-macos.png');
  const pdf = await recipient.pdf({ format:'Letter', printBackground:true, preferCSSPageSize:true });
  expect(pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)).toHaveLength(2);
  const walkthrough = await browser.newPage();
  await walkthrough.goto(links[1]);
  await expect(walkthrough.getByRole('heading',{name:'Shared puzzle ready'})).toBeVisible();
  await walkthrough.getByRole('button',{name:'Open walkthrough'}).click();
  await expect(walkthrough.locator('.walkthrough-explanation')).not.toContainText('not explain');
  await expect(walkthrough.locator('.walkthrough-explanation')).toBeVisible();
  await expect(walkthrough.locator('.cage-overlay .cage')).toHaveCount(puzzle.cages.length);
  await walkthrough.close();
  await recipient.close();
});
