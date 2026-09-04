import { expect, test } from '@playwright/test';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { TestStepHelper } from '../helpers/test-step-helper';

test('a readable puzzle link carries work and optional progress metadata', async ({ browser, page }, testInfo) => {
  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata(
    'Share a puzzle with its current work',
    'The player can make a readable puzzle link containing placements, grouped candidates, time, stats, and settings. The recipient checks it locally, sees a progress summary, and opens the reconstructed board from one import event.'
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Generate Foundations puzzle' }).click();
  await expect(page.getByRole('grid', { name: 'Foundations Sudoku puzzle' })).toBeVisible();

  const puzzle = await page.evaluate(() => JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '').events[0].payload.puzzle as { givens: string; solution: string });
  const editables = [...puzzle.givens].flatMap((given, cell) => given === '.' ? [cell] : []);
  const [valueCell, hintCell, noteCell] = editables;
  const coordinates = (cell: number) => `${Math.floor(cell / 9) + 1}${(cell % 9) + 1}`;
  const cell = (targetPage: typeof page, index: number) => targetPage.locator(`[data-cell="${index}"]`);
  const digit = (targetPage: typeof page, value: number) => targetPage.getByRole('button', { name: new RegExp(`^${value},`) });

  await cell(page, valueCell).click();
  const valueDigit = Number(puzzle.solution[valueCell]);
  await digit(page, valueDigit).click();
  await cell(page, noteCell).click();
  await page.getByRole('button', { name: 'Notes', exact: true }).click();
  for (const candidate of [2, 4, 9]) await digit(page, candidate).click();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('sudoku:e2e-clock', { detail: 75_432 })));
  await page.getByRole('button', { name: 'Hint' }).click();
  await page.getByRole('button', { name: 'Reveal one cell' }).click();

  await steps.step('work-entered', {
    description: 'The player adds a placement, three candidates, and one hint',
    verifications: [{ spec: 'The board shows the placement, notes, and marked hint before sharing', check: async () => {
      await expect(cell(page, valueCell)).toHaveAccessibleName(new RegExp(`editable, ${valueDigit}`));
      await expect(cell(page, noteCell)).toHaveAccessibleName(/notes 2 4 9/);
      await expect(cell(page, hintCell)).toHaveAccessibleName(/revealed by hint/);
    } }]
  });

  await page.getByRole('button', { name: 'Share' }).click();
  await steps.step('sharing-choices', {
    description: 'The player chooses how much state to share',
    verifications: [{ spec: 'Clean and readable-work choices remain distinct', check: async () => {
      const dialog = page.getByRole('dialog', { name: 'Share this puzzle' });
      await expect(dialog.getByRole('button', { name: /Share puzzle only/ })).toBeVisible();
      await expect(dialog.getByRole('button', { name: /Share puzzle with work/ })).toBeVisible();
    } }]
  });

  await page.getByRole('button', { name: /Share puzzle with work/ }).click();
  const shareLink = await page.getByTestId('share-link').getAttribute('data-link') ?? '';
  await steps.step('work-link-prepared', {
    description: 'The app prepares a readable puzzle-work and progress link without pausing',
    verifications: [
      { spec: 'The decoded payload has grouped work followed by readable optional metadata', check: async () => {
        const payload = new URL(shareLink).searchParams.get('p');
        expect(payload).toBe(
          `${puzzle.givens}_${coordinates(valueCell)}${valueDigit}` +
          `_${coordinates(hintCell)}${puzzle.solution[hintCell]}_${coordinates(noteCell)}+249+` +
          `_time=75432_hints=${coordinates(hintCell)}_mistakes=0_settings=01110111`
        );
        expect(shareLink).toContain('%2B249%2B');
        expect(shareLink).toContain('time%3D75432');
      } },
      { spec: 'The local QR exactly matches the link and sharing adds no event', check: async () => {
        const qr = PNG.sync.read(await page.getByTestId('share-qr').screenshot());
        expect(jsQR(new Uint8ClampedArray(qr.data), qr.width, qr.height)?.data).toBe(shareLink);
        expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '').events)).toHaveLength(6);
        await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
      } }
    ]
  });

  const recipientContext = await browser.newContext({
    viewport: page.viewportSize() ?? { width: 393, height: 852 },
    timezoneId: 'America/Toronto', locale: 'en-CA', reducedMotion: 'reduce', serviceWorkers: 'block'
  });
  await recipientContext.addInitScript(() => { delete (window as Window & { BroadcastChannel?: unknown }).BroadcastChannel; });
  const recipient = await recipientContext.newPage();
  steps.usePage(recipient);
  await recipient.goto(shareLink);

  await steps.step('shared-work-checked', {
    description: 'The recipient sees the checked puzzle and progress summary before consent',
    verifications: [
      { spec: 'The summary reports work, time, hints, and mistakes', check: async () => {
        await expect(recipient.getByRole('heading', { name: 'Shared puzzle ready' })).toBeVisible();
        const facts = recipient.locator('.incoming-facts');
        await expect(facts).toContainText('Filled2');
        await expect(facts).toContainText('Notes1');
        await expect(facts).toContainText('Time01:15');
        await expect(facts).toContainText('Hints1');
        await expect(facts).toContainText('Mistakes0');
      } },
      { spec: 'Validation remains ephemeral and offers to open shared work', check: async () => {
        expect(await recipient.evaluate(() => localStorage.getItem('sudoku.event-store.v1'))).toBeNull();
        await expect(recipient.getByRole('button', { name: 'Open shared work' })).toBeEnabled();
      } }
    ]
  });

  await recipient.getByRole('button', { name: 'Open shared work' }).click();
  await steps.step('shared-work-opened', {
    description: 'Consent reconstructs the work as one local import origin',
    verifications: [
      { spec: 'The imported event separates givens, compact work, and optional metadata', check: async () => {
        await expect.poll(() => recipient.evaluate(() => {
          const stored = localStorage.getItem('sudoku.event-store.v1');
          return stored ? JSON.parse(stored).events.length : -1;
        })).toBe(1);
        const events = await recipient.evaluate(() => JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '').events);
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
          type: 'game/imported',
          payload: {
            importKind: 'puzzle-link',
            checkpoint: null,
            puzzle: { givens: puzzle.givens, provenance: { kind: 'puzzle-link', formatVersion: 3 } },
            work: [
              { type: 'value', cell: valueCell, value: valueDigit },
              { type: 'value', cell: hintCell, value: Number(puzzle.solution[hintCell]) },
              { type: 'notes', cell: noteCell, values: [2, 4, 9], enabled: true }
            ],
            sharedMetadata: {
              elapsedMs: 75_432,
              hintedCells: [hintCell],
              mistakes: 0,
              settings: {
                checkMistakes: false,
                autoRemoveNotes: true,
                showTimer: true,
                numberFirst: true,
                notesFirst: false,
                notesBold: true,
                notesLarge: true,
                highlightMatchingNotes: true
              }
            }
          }
        });
      } },
      { spec: 'The address is clean and the reconstructed board is immediately playable', check: async () => {
        expect(new URL(recipient.url()).searchParams.has('p')).toBe(false);
        await expect(cell(recipient, valueCell)).toHaveAccessibleName(new RegExp(`editable, ${valueDigit}`));
        await expect(cell(recipient, hintCell)).toHaveAccessibleName(/revealed by hint/);
        await expect(cell(recipient, noteCell)).toHaveAccessibleName(/notes 2 4 9/);
        await expect(recipient.getByRole('button', { name: 'Pause' })).toBeVisible();
      } }
    ]
  });

  steps.generateDocs();
  await recipientContext.close();
});
