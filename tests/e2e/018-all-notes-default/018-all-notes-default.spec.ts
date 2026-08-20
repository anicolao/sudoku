import { expect, test } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';

test('Notes can be the default and All fills every pencil mark at once', async ({ page }, testInfo) => {
  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata(
    'Start in Notes mode and fill every pencil mark',
    'The player enables the local Notes default, generates a puzzle, selects a cell, and uses the All key after 9. One reversible event fills notes 1–9; individual notes still toggle normally.'
  );
  const cell = (index: number) => page.locator(`[data-cell="${index}"]`);
  const events = async () => page.evaluate(() =>
    JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '{"events":[]}').events
  );

  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  await steps.step('settings-opened', {
    description: 'The player opens device-local Settings',
    verifications: [{ spec: 'Start in Notes mode is available and initially off', check: async () => await expect(page.getByRole('switch', { name: /Start in Notes mode/ })).toHaveAttribute('aria-checked', 'false') }]
  });

  await page.getByRole('switch', { name: /Start in Notes mode/ }).click();
  await steps.step('notes-default-enabled', {
    description: 'The player makes Notes the default for new puzzles',
    verifications: [
      { spec: 'The preference is visibly on', check: async () => await expect(page.getByRole('switch', { name: /Start in Notes mode/ })).toHaveAttribute('aria-checked', 'true') },
      { spec: 'One app-level settings event records notesFirst', check: async () => expect((await events()).at(-1)).toMatchObject({ type: 'settings/changed', gameId: null, payload: { notesFirst: true } }) }
    ]
  });

  await page.getByRole('button', { name: 'Play' }).click();
  await steps.step('play-returned', {
    description: 'The player returns to Play',
    verifications: [{ spec: 'The local puzzle generator is ready', check: async () => await expect(page.getByRole('button', { name: 'Generate Foundations puzzle' })).toBeEnabled() }]
  });

  await page.getByRole('button', { name: 'Generate Foundations puzzle' }).click();
  await steps.step('puzzle-started-in-notes', {
    description: 'The new puzzle opens directly in Notes mode',
    verifications: [
      { spec: 'The game snapshots notesFirst and Notes is pressed', check: async () => {
        await expect(page.getByRole('button', { name: 'Notes', exact: true })).toHaveAttribute('aria-pressed', 'true');
        expect((await events()).at(-1).payload.settings.notesFirst).toBe(true);
      } },
      { spec: 'All notes appears immediately after digit 9 and waits for a cell', check: async () => {
        const labels = await page.locator('.number-pad button').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')));
        expect(labels.slice(-2)).toEqual([expect.stringMatching(/^9,/), 'All notes']);
        await expect(page.getByRole('button', { name: 'All notes', exact: true })).toBeDisabled();
      } }
    ]
  });

  await cell(34).click();
  await steps.step('empty-cell-selected', {
    description: 'The player selects an empty editable cell',
    verifications: [{ spec: 'All notes becomes available for the selected cell', check: async () => await expect(page.getByRole('button', { name: 'All notes', exact: true })).toBeEnabled() }]
  });

  await page.getByRole('button', { name: 'All notes', exact: true }).click();
  await steps.step('all-notes-filled', {
    description: 'The player fills notes 1–9 with one All action',
    verifications: [
      { spec: 'The cell exposes every note in order', check: async () => await expect(cell(34)).toHaveAccessibleName(/notes 1 2 3 4 5 6 7 8 9/) },
      { spec: 'Every visible note stays inside the selected cell at 200% zoom', check: async () => {
        const overflowing = await cell(34).locator('.cell-notes i').evaluateAll((notes) => notes.flatMap((note, index) => {
          const cellRect = note.closest<HTMLElement>('.sudoku-cell')?.getBoundingClientRect();
          if (!cellRect) return [index + 1];
          const range = document.createRange();
          range.selectNodeContents(note);
          const glyph = range.getBoundingClientRect();
          return glyph.left < cellRect.left || glyph.right > cellRect.right ||
            glyph.top < cellRect.top || glyph.bottom > cellRect.bottom
            ? [index + 1]
            : [];
        }));
        expect(overflowing).toEqual([]);
      } },
      { spec: 'One cell/notes-filled fact represents the action', check: async () => expect((await events()).at(-1)).toMatchObject({ type: 'cell/notes-filled', payload: { cell: 34 } }) },
      { spec: 'All is disabled while every note is already present', check: async () => await expect(page.getByRole('button', { name: 'All notes', exact: true })).toBeDisabled() }
    ]
  });

  await page.getByRole('button', { name: /^4,/ }).click();
  await steps.step('one-note-removed', {
    description: 'The player removes note 4 normally',
    verifications: [
      { spec: 'Only note 4 is absent', check: async () => await expect(cell(34)).toHaveAccessibleName(/notes 1 2 3 5 6 7 8 9/) },
      { spec: 'The ordinary note toggle remains a separate event', check: async () => expect((await events()).at(-1)).toMatchObject({ type: 'cell/note-toggled', payload: { cell: 34, value: 4, enabled: false } }) }
    ]
  });

  await page.getByRole('button', { name: 'All notes', exact: true }).click();
  await steps.step('all-notes-refilled', {
    description: 'The player uses All again to restore the missing note',
    verifications: [{ spec: 'Notes 1–9 are complete again with one new fill event', check: async () => {
      await expect(cell(34)).toHaveAccessibleName(/notes 1 2 3 4 5 6 7 8 9/);
      expect((await events()).at(-1).type).toBe('cell/notes-filled');
    } }]
  });

  await page.getByRole('button', { name: 'Undo Filled all notes in r4c8' }).click();
  await steps.step('all-notes-undone', {
    description: 'Undo reverses the one All action',
    verifications: [{ spec: 'Replay returns to the exact prior notes with 4 absent', check: async () => {
      await expect(cell(34)).toHaveAccessibleName(/notes 1 2 3 5 6 7 8 9/);
      expect((await events()).at(-1).type).toBe('move/undone');
    } }]
  });

  steps.generateDocs();
});
