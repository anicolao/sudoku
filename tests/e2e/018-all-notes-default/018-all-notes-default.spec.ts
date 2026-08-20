import { expect, test } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';

test('Notes can be the default, filled at once, and shown in four styles', async ({ page }, testInfo) => {
  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata(
    'Start in Notes mode, fill every pencil mark, and try four styles',
    'The player enables the local Notes default, fills notes 1–9 with one reversible event, and independently tries large and bold notes in all four combinations before continuing to toggle and undo notes.'
  );
  const cell = (index: number) => page.locator(`[data-cell="${index}"]`);
  const events = async () => page.evaluate(() =>
    JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '{"events":[]}').events
  );
  const expectNoteStyle = async (bold: boolean, large: boolean) => {
    const style = await cell(34).locator('.cell-notes').evaluate((notes) => {
      const slot = notes.querySelector('i')?.getBoundingClientRect();
      const computed = getComputedStyle(notes);
      const board = notes.closest('.sudoku-board');
      return {
        boardBold: board?.getAttribute('data-notes-bold'),
        boardLarge: board?.getAttribute('data-notes-large'),
        fontWeight: Number.parseInt(computed.fontWeight, 10),
        fontSize: Number.parseFloat(computed.fontSize),
        slotSize: slot ? Math.min(slot.width, slot.height) : 0
      };
    });
    expect(style.boardBold).toBe(String(bold));
    expect(style.boardLarge).toBe(String(large));
    expect(style.fontWeight).toBe(bold ? 700 : 400);
    const sizeRatio = style.fontSize / style.slotSize;
    if (large) {
      expect(sizeRatio).toBeGreaterThanOrEqual(.88);
      expect(sizeRatio).toBeLessThanOrEqual(1);
    } else {
      expect(sizeRatio).toBeGreaterThanOrEqual(.64);
      expect(sizeRatio).toBeLessThanOrEqual(.7);
    }
  };

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
      { spec: 'Every visible note fills and stays inside its own 3×3 slot', check: async () => {
        const violations = await cell(34).locator('.cell-notes i').evaluateAll((notes) => notes.flatMap((note, index) => {
          const slot = note.getBoundingClientRect();
          const style = getComputedStyle(note);
          const fontSize = Number.parseFloat(style.fontSize);
          const context = document.createElement('canvas').getContext('2d');
          if (!context) return [index + 1];
          context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
          const glyph = context.measureText(note.textContent ?? '');
          const glyphWidth = glyph.actualBoundingBoxLeft + glyph.actualBoundingBoxRight;
          const glyphHeight = glyph.actualBoundingBoxAscent + glyph.actualBoundingBoxDescent;
          const slotSize = Math.min(slot.width, slot.height);
          return fontSize < slotSize * .88 || fontSize > slotSize ||
            glyphWidth > slot.width || glyphHeight > slot.height ? [index + 1] : [];
        }));
        expect(violations).toEqual([]);
      } },
      { spec: 'Bold and Large notes are both on by default', check: async () => await expectNoteStyle(true, true) },
      { spec: 'One cell/notes-filled fact represents the action', check: async () => expect((await events()).at(-1)).toMatchObject({ type: 'cell/notes-filled', payload: { cell: 34 } }) },
      { spec: 'All is disabled while every note is already present', check: async () => await expect(page.getByRole('button', { name: 'All notes', exact: true })).toBeDisabled() }
    ]
  });

  await page.getByRole('button', { name: 'Settings' }).click();
  await steps.step('note-style-settings-opened', {
    description: 'The player opens note appearance settings',
    verifications: [{ spec: 'Bold and Large are independent switches and both begin on', check: async () => {
      await expect(page.getByRole('switch', { name: /Bold notes/ })).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByRole('switch', { name: /Large notes/ })).toHaveAttribute('aria-checked', 'true');
    } }]
  });

  await page.getByRole('switch', { name: /Bold notes/ }).click();
  await steps.step('bold-notes-disabled', {
    description: 'The player turns Bold notes off while leaving Large notes on',
    verifications: [
      { spec: 'The two switches show regular plus large', check: async () => {
        await expect(page.getByRole('switch', { name: /Bold notes/ })).toHaveAttribute('aria-checked', 'false');
        await expect(page.getByRole('switch', { name: /Large notes/ })).toHaveAttribute('aria-checked', 'true');
      } },
      { spec: 'One app-level event records the Bold change', check: async () => expect((await events()).at(-1)).toMatchObject({ type: 'settings/changed', gameId: null, payload: { notesBold: false } }) }
    ]
  });

  await page.getByRole('button', { name: 'Play' }).click();
  await steps.step('large-regular-notes', {
    description: 'The puzzle immediately shows large notes at regular weight',
    verifications: [{ spec: 'The first alternative combines not bold plus large', check: async () => await expectNoteStyle(false, true) }]
  });

  await page.getByRole('button', { name: 'Settings' }).click();
  await steps.step('style-settings-reopened-for-small-notes', {
    description: 'The player returns to Settings to try smaller notes',
    verifications: [{ spec: 'The previous Bold choice remains off', check: async () => await expect(page.getByRole('switch', { name: /Bold notes/ })).toHaveAttribute('aria-checked', 'false') }]
  });

  await page.getByRole('switch', { name: /Bold notes/ }).click();
  await steps.step('bold-notes-enabled', {
    description: 'The player restores Bold notes',
    verifications: [{ spec: 'Bold is on again and its event is stored', check: async () => {
      await expect(page.getByRole('switch', { name: /Bold notes/ })).toHaveAttribute('aria-checked', 'true');
      expect((await events()).at(-1)).toMatchObject({ type: 'settings/changed', gameId: null, payload: { notesBold: true } });
    } }]
  });

  await page.getByRole('switch', { name: /Large notes/ }).click();
  await steps.step('large-notes-disabled', {
    description: 'The player turns Large notes off while keeping Bold notes on',
    verifications: [{ spec: 'The switches show bold plus not large and the event is stored', check: async () => {
      await expect(page.getByRole('switch', { name: /Bold notes/ })).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByRole('switch', { name: /Large notes/ })).toHaveAttribute('aria-checked', 'false');
      expect((await events()).at(-1)).toMatchObject({ type: 'settings/changed', gameId: null, payload: { notesLarge: false } });
    } }]
  });

  await page.getByRole('button', { name: 'Play' }).click();
  await steps.step('small-bold-notes', {
    description: 'The puzzle immediately shows smaller bold notes',
    verifications: [{ spec: 'The second alternative combines bold plus not large', check: async () => await expectNoteStyle(true, false) }]
  });

  await page.getByRole('button', { name: 'Settings' }).click();
  await steps.step('style-settings-reopened-for-regular-notes', {
    description: 'The player returns to Settings for the final combination',
    verifications: [{ spec: 'Large remains off while Bold remains on', check: async () => {
      await expect(page.getByRole('switch', { name: /Bold notes/ })).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByRole('switch', { name: /Large notes/ })).toHaveAttribute('aria-checked', 'false');
    } }]
  });

  await page.getByRole('switch', { name: /Bold notes/ }).click();
  await steps.step('bold-notes-disabled-with-small-notes', {
    description: 'The player turns Bold notes off while Large notes stays off',
    verifications: [{ spec: 'Both appearance switches are off and the event is stored', check: async () => {
      await expect(page.getByRole('switch', { name: /Bold notes/ })).toHaveAttribute('aria-checked', 'false');
      await expect(page.getByRole('switch', { name: /Large notes/ })).toHaveAttribute('aria-checked', 'false');
      expect((await events()).at(-1)).toMatchObject({ type: 'settings/changed', gameId: null, payload: { notesBold: false } });
    } }]
  });

  await page.getByRole('button', { name: 'Play' }).click();
  await steps.step('small-regular-notes', {
    description: 'The puzzle immediately shows smaller notes at regular weight',
    verifications: [{ spec: 'The third alternative combines not bold plus not large', check: async () => await expectNoteStyle(false, false) }]
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
