import { expect, test } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';

const GIVENS = '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79';

test('a photographed printed grid is recognized, reviewed, validated, and imported', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata(
    'Import a printed Sudoku with the camera',
    'A player can select or photograph a conventional grid, recognize its printed givens entirely on-device, correct the result, prove that it has one unique solution, and start it as a normal local puzzle.'
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Puzzles' }).click();

  await steps.step('photo-import-offered', {
    description: 'The puzzle library offers private photo import beside generation',
    verifications: [{ spec: 'The photo option explains that the image is not sent anywhere', check: async () => {
      await expect(page.getByRole('heading', { name: 'Have a puzzle in front of you?' })).toBeVisible();
      await expect(page.getByText('without sending the image anywhere')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Import from photo' })).toBeEnabled();
    } }]
  });

  await page.getByRole('button', { name: 'Import from photo' }).click();
  const photo = await page.evaluate(async (givens) => {
    await document.fonts.ready;
    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 1000;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#fff';
    context.fillRect(0, 0, 1000, 1000);
    context.translate(500, 500);
    context.rotate(0.045);
    context.translate(-500, -500);
    context.strokeStyle = '#111';
    for (let line = 0; line <= 9; line += 1) {
      context.lineWidth = line % 3 === 0 ? 7 : 2;
      const position = 50 + line * 100;
      context.beginPath();
      context.moveTo(50, position);
      context.lineTo(950, position);
      context.stroke();
      context.beginPath();
      context.moveTo(position, 50);
      context.lineTo(position, 950);
      context.stroke();
    }
    context.fillStyle = '#111';
    context.font = '700 62px "Atkinson Hyperlegible"';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    [...givens].forEach((given, cell) => {
      if (given === '.') return;
      context.fillText(given, 100 + (cell % 9) * 100, 102 + Math.floor(cell / 9) * 100);
    });
    return canvas.toDataURL('image/png').split(',')[1];
  }, GIVENS);
  await page.getByLabel('Choose Sudoku photo').setInputFiles({
    name: 'printed-sudoku.png',
    mimeType: 'image/png',
    buffer: Buffer.from(photo, 'base64')
  });

  await expect(page.getByRole('progressbar', { name: 'Photo recognition progress' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Puzzle ready' })).toBeVisible({ timeout: 120_000 });
  await steps.step('recognized-givens-reviewed', {
    description: 'The confident givens are checked and presented for acceptance',
    verifications: [
      { spec: 'Every printed clue lands in its source cell and blank cells stay empty', check: async () => {
        const recognized = await page.locator('[data-photo-cell]').allTextContents();
        expect(recognized.map((value) => value || '.').join('')).toBe(GIVENS);
      } },
      { spec: 'The clean review is already proven and remains unsaved', check: async () => {
        await expect(page.getByText('30 givens', { exact: true })).toBeVisible();
        await expect(page.getByText(/needs? a closer look/)).toHaveCount(0);
        await expect(page.getByText(/One unique solution/)).toBeVisible();
        expect(await page.evaluate(() => localStorage.getItem('sudoku.event-store.v1'))).toBeNull();
      } }
    ]
  });

  await page.locator('[data-photo-cell="0"]').click();
  await page.getByRole('button', { name: '6', exact: true }).click();
  await page.getByRole('button', { name: 'Check puzzle' }).click();
  await expect(page.getByRole('alert')).toContainText('duplicate');
  await page.getByRole('button', { name: '5', exact: true }).click();
  await page.getByRole('button', { name: 'Check puzzle' }).click();
  await steps.step('photo-puzzle-validated', {
    description: 'The corrected grid is proven before import',
    verifications: [{ spec: 'The review confirms one unique solution and its logical rating', check: async () => {
      await expect(page.getByRole('heading', { name: 'Puzzle ready' })).toBeVisible();
      await expect(page.getByText(/One unique solution/)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Start photographed puzzle' })).toBeEnabled();
    } }]
  });

  await page.getByRole('button', { name: 'Start photographed puzzle' }).click();
  await expect(page.getByRole('grid', { name: /Sudoku puzzle/ })).toBeVisible();
  await steps.step('photo-puzzle-started', {
    description: 'The photographed puzzle starts as a private local attempt',
    verifications: [
      { spec: 'The playable board preserves the photographed givens', check: async () => {
        await expect(page.getByRole('grid', { name: /Sudoku puzzle/ })).toBeVisible();
        await expect(page.getByText('Recognized and validated here')).toBeVisible();
      } },
      { spec: 'One camera-photo origin records the validated puzzle but never the image', check: async () => {
        const events = await page.evaluate(() => JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '').events);
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
          type: 'game/imported',
          payload: {
            importKind: 'camera-photo',
            puzzle: { givens: GIVENS, provenance: { kind: 'camera-photo', recognizerVersion: 1 } }
          }
        });
        expect(JSON.stringify(events)).not.toContain('data:image');
      } }
    ]
  });

  steps.generateDocs();
});
