import { expect, test } from '@playwright/test';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { TestStepHelper } from '../helpers/test-step-helper';

test('a QR code carries a paused checkpoint to an independent device exactly once', async ({ browser, page }, testInfo) => {
  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata(
    'Move a puzzle to another device',
    'Every player action is shown below. The source pauses, renders its QR locally, and the recipient validates one compact checkpoint before storing it as a new event stream.'
  );
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:4177' });
  await page.goto('/');

  await page.getByRole('button', { name: 'Generate Foundations puzzle' }).click();
  await steps.step('puzzle-generated', {
    description: 'The player generates a fresh local puzzle',
    verifications: [{ spec: 'The board and Share action are ready', check: async () => {
      await expect(page.getByRole('grid', { name: 'Foundations Sudoku puzzle' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Share' })).toBeEnabled();
    } }]
  });

  const puzzle = await page.evaluate(() => JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '').events[0].payload.puzzle as { givens: string; solution: string });
  const editables = [...puzzle.givens].flatMap((given, cell) => given === '.' ? [cell] : []);
  const [valueCell, noteCell, recipientCell] = editables;
  const cell = (targetPage: typeof page, index: number) => targetPage.locator(`[data-cell="${index}"]`);
  const digit = (targetPage: typeof page, value: number) => targetPage.getByRole('button', { name: new RegExp(`^${value},`) });

  await cell(page, valueCell).click();
  await steps.step('value-cell-selected', {
    description: 'The player selects an empty cell',
    verifications: [{ spec: 'The selected cell is visible but selection creates no event', check: async () => {
      await expect(cell(page, valueCell)).toHaveAttribute('aria-selected', 'true');
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '').events)).toHaveLength(1);
    } }]
  });

  const valueDigit = Number(puzzle.solution[valueCell]);
  await digit(page, valueDigit).click();
  await steps.step('value-entered', {
    description: `The player enters ${valueDigit} in the selected cell`,
    verifications: [{ spec: 'The value is stored as one canonical move', check: async () => {
      await expect(cell(page, valueCell)).toHaveAccessibleName(new RegExp(`editable, ${valueDigit}`));
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '').events.at(-1).type)).toBe('cell/value-entered');
    } }]
  });

  await cell(page, noteCell).click();
  await steps.step('note-cell-selected', {
    description: 'The player selects a second empty cell for a pencil note',
    verifications: [{ spec: 'The second cell is selected without changing history', check: async () => {
      await expect(cell(page, noteCell)).toHaveAttribute('aria-selected', 'true');
    } }]
  });

  await page.getByRole('button', { name: 'Notes', exact: true }).click();
  await steps.step('notes-mode-selected', {
    description: 'The player switches to Notes mode',
    verifications: [{ spec: 'Notes mode is pressed and remains ephemeral', check: async () => {
      await expect(page.getByRole('button', { name: 'Notes', exact: true })).toHaveAttribute('aria-pressed', 'true');
    } }]
  });

  const noteDigit = Number(puzzle.solution[noteCell]) === 2 ? 3 : 2;
  await digit(page, noteDigit).click();
  await steps.step('note-entered', {
    description: `The player adds pencil note ${noteDigit}`,
    verifications: [{ spec: 'The note is stored in one note event', check: async () => {
      await expect(cell(page, noteCell)).toHaveAccessibleName(new RegExp(`notes ${noteDigit}`));
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '').events.at(-1).type)).toBe('cell/note-toggled');
    } }]
  });

  await page.getByRole('button', { name: 'Share' }).click();
  await steps.step('share-opened', {
    description: 'The player opens the local sharing choices',
    verifications: [{ spec: 'Clean puzzle, readable work, and exact progress are distinct choices', check: async () => {
      const dialog = page.getByRole('dialog', { name: 'Share this puzzle' });
      await expect(dialog.getByRole('button', { name: /Share puzzle only/ })).toBeVisible();
      await expect(dialog.getByRole('button', { name: /Share puzzle with work/ })).toBeVisible();
      await expect(dialog.getByRole('button', { name: /Prepare progress transfer/ })).toBeVisible();
    } }]
  });

  await page.getByRole('button', { name: /Share puzzle only/ }).click();
  await steps.step('puzzle-only-link-prepared', {
    description: 'The player first prepares a clean puzzle link',
    verifications: [
      { spec: 'Its locally rendered QR carries only the literal givens query', check: async () => {
        const link = await page.getByTestId('share-link').getAttribute('data-link') ?? '';
        const qr = PNG.sync.read(await page.getByTestId('share-qr').screenshot());
        expect(jsQR(new Uint8ClampedArray(qr.data), qr.width, qr.height)?.data).toBe(link);
        const url = new URL(link);
        expect(url.searchParams.get('p')).toBe(puzzle.givens);
        expect(url.hash).toBe('');
      } },
      { spec: 'Sharing only the puzzle neither pauses nor appends an event', check: async () => {
        await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
        expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '').events.length)).toBe(3);
      } }
    ]
  });

  await page.getByRole('button', { name: 'Done' }).click();
  await steps.step('puzzle-only-link-closed', {
    description: 'The player closes the clean-link dialog and keeps playing',
    verifications: [{ spec: 'The dialog closes with the source puzzle still active', check: async () => {
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
    } }]
  });

  await page.getByRole('button', { name: 'Share' }).click();
  await steps.step('share-reopened', {
    description: 'The player opens Share again to carry current progress',
    verifications: [{ spec: 'Prepare progress transfer is available from the unchanged game', check: async () => {
      await expect(page.getByRole('button', { name: /Prepare progress transfer/ })).toBeEnabled();
    } }]
  });

  await page.getByRole('button', { name: /Prepare progress transfer/ }).click();
  await steps.step('transfer-prepared', {
    description: 'The player freezes the checkpoint and gets a locally rendered QR code',
    verifications: [
      { spec: 'The dialog explains that the source remains paused', check: async () => {
        await expect(page.getByText('This creates a copy on the other device. Your game stays paused here until you resume or abandon it.')).toBeVisible();
        await expect(page.getByTestId('share-qr')).toBeVisible();
      } },
      { spec: 'Only the ordinary pause event was added while preparing the transfer', check: async () => {
        const types = await page.evaluate(() => JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '').events.map((event: { type: string }) => event.type));
        expect(types).toEqual(['game/started', 'cell/value-entered', 'cell/note-toggled', 'game/paused']);
      } }
    ]
  });

  const transferLink = await page.getByTestId('share-link').getAttribute('data-link') ?? '';
  const qrPng = PNG.sync.read(await page.getByTestId('share-qr').screenshot());
  const decodedQr = jsQR(new Uint8ClampedArray(qrPng.data), qrPng.width, qrPng.height);
  expect(decodedQr?.data).toBe(transferLink);
  expect(new URL(transferLink).hash).toMatch(/^#t=/);
  expect(new URL(transferLink).search).toBe('');
  expect(transferLink).not.toContain(puzzle.solution);

  await page.getByRole('button', { name: 'Copy link' }).click();
  await steps.step('transfer-link-copied', {
    description: 'The player copies the same transfer link as an accessible QR alternative',
    verifications: [{ spec: 'Clipboard feedback is visible and the copied URL exactly matches the independently decoded QR', check: async () => {
      await expect(page.getByRole('button', { name: 'Link copied' })).toBeVisible();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(transferLink);
    } }]
  });

  const recipientContext = await browser.newContext({
    viewport: page.viewportSize() ?? { width: 393, height: 852 },
    timezoneId: 'America/Toronto', locale: 'en-CA', reducedMotion: 'reduce', serviceWorkers: 'block'
  });
  await recipientContext.addInitScript(() => { delete (window as Window & { BroadcastChannel?: unknown }).BroadcastChannel; });
  const recipient = await recipientContext.newPage();
  const requests: string[] = [];
  recipient.on('request', (request) => requests.push(request.url()));
  steps.usePage(recipient);
  await recipient.goto(transferLink);

  await steps.step('recipient-checked', {
    description: 'The other device checks the scanned checkpoint before storing it',
    verifications: [
      { spec: 'The consent summary preserves one value, one noted cell, and paused active time', check: async () => {
        await expect(recipient.getByRole('heading', { name: 'Transferred puzzle ready' })).toBeVisible();
        const facts = recipient.locator('.incoming-facts');
        await expect(facts).toContainText('Filled1');
        await expect(facts).toContainText('Notes1');
      } },
      { spec: 'Fragment data was not sent in any network request and no event exists yet', check: async () => {
        expect(requests.every((url) => !url.includes('#t='))).toBe(true);
        expect(await recipient.evaluate(() => localStorage.getItem('sudoku.event-store.v1'))).toBeNull();
      } }
    ]
  });

  await recipient.getByRole('button', { name: 'Continue on this device' }).click();
  await steps.step('recipient-imported', {
    description: 'The recipient consents and imports one paused checkpoint event',
    verifications: [
      { spec: 'One import event contains the transferred settings and checkpoint', check: async () => {
        const events = await recipient.evaluate(() => JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '').events);
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({ type: 'game/imported', payload: { importKind: 'progress-transfer', transferId: '00112233445566778899aabb', checkpoint: { paused: true } } });
        expect(events[0].payload.checkpoint.values[valueCell]).toBe(valueDigit);
        expect(events[0].payload.checkpoint.notes[noteCell]).toEqual([noteDigit]);
      } },
      { spec: 'The consumed fragment is removed and the board starts paused', check: async () => {
        expect(new URL(recipient.url()).hash).toBe('');
        await expect(recipient.getByRole('button', { name: 'Resume' })).toBeVisible();
      } }
    ]
  });

  await recipient.getByRole('button', { name: 'Resume' }).click();
  await steps.step('recipient-resumed', {
    description: 'The recipient resumes the copied game',
    verifications: [{ spec: 'The transferred value and note reappear on the playable board', check: async () => {
      await expect(cell(recipient, valueCell)).toHaveAccessibleName(new RegExp(`editable, ${valueDigit}`));
      await expect(cell(recipient, noteCell)).toHaveAccessibleName(new RegExp(`notes ${noteDigit}`));
    } }]
  });

  await cell(recipient, recipientCell).click();
  await steps.step('recipient-cell-selected', {
    description: 'The recipient selects another empty cell',
    verifications: [{ spec: 'New play begins from the imported checkpoint', check: async () => {
      await expect(cell(recipient, recipientCell)).toHaveAttribute('aria-selected', 'true');
    } }]
  });

  const recipientDigit = Number(puzzle.solution[recipientCell]);
  await digit(recipient, recipientDigit).click();
  await steps.step('recipient-value-entered', {
    description: `The recipient enters ${recipientDigit} after the transfer`,
    verifications: [{ spec: 'The new move is appended after import and resume', check: async () => {
      await expect(cell(recipient, recipientCell)).toHaveAccessibleName(new RegExp(`editable, ${recipientDigit}`));
      const types = await recipient.evaluate(() => JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '').events.map((event: { type: string }) => event.type));
      expect(types).toEqual(['game/imported', 'game/resumed', 'cell/value-entered']);
    } }]
  });

  await recipient.getByRole('button', { name: /Undo/ }).click();
  await steps.step('recipient-move-undone', {
    description: 'Undo affects only the move made after import',
    verifications: [{ spec: 'The recipient move is empty again while transferred progress remains', check: async () => {
      await expect(cell(recipient, recipientCell)).toHaveAccessibleName(/editable, empty/);
      await expect(cell(recipient, valueCell)).toHaveAccessibleName(new RegExp(`editable, ${valueDigit}`));
    } }]
  });

  const beforeDuplicate = await recipient.evaluate(() => JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '').events.length);
  await recipient.goto(transferLink);
  await expect.poll(() => new URL(recipient.url()).hash).toBe('');
  await expect(recipient.locator('.incoming-card')).toHaveCount(0);
  await steps.step('duplicate-scan-idempotent', {
    description: 'Scanning the same QR again opens the existing local game',
    verifications: [{ spec: 'The transfer fragment clears without appending a duplicate import', check: async () => {
      await expect(recipient.getByRole('heading', { name: 'Ready when you are.' })).toBeVisible();
      expect(new URL(recipient.url()).hash).toBe('');
      expect(await recipient.evaluate(() => JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '').events.length)).toBe(beforeDuplicate);
    } }]
  });

  steps.generateDocs();
  await recipientContext.close();
});
