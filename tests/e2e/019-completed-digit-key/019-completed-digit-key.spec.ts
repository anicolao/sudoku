import { expect, test } from '@playwright/test';
import { waitForStoredEvent } from '../helpers/event-store';
import { TestStepHelper } from '../helpers/test-step-helper';

test('a completed digit skips All but remains available to erase its note', async ({ page }, testInfo) => {
  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata(
    'Skip completed notes and keep their cleanup action available',
    'A near-complete event stream includes one stale pencil mark. After the ninth correct copy is placed, All skips that digit, selecting its stale note enables the otherwise grey key, and tapping it erases the note.'
  );
  const cell = (index: number) => page.locator(`[data-cell="${index}"]`);
  const digit = (value: number, remaining: number) => page.getByRole('button', { name: `${value}, ${remaining} remaining` });

  await page.goto('/');
  await page.getByRole('button', { name: 'Generate Foundations puzzle' }).click();
  const started = await waitForStoredEvent(page, 'game/started');
  await steps.step('puzzle-generated', {
    description: 'The player generates an event-sourced puzzle',
    verifications: [{ spec: 'The canonical stream contains game/started', check: async () => expect(started.type).toBe('game/started') }]
  });

  const finalCells = await page.evaluate(async () => {
    const document = JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '');
    const start = document.events.find((event: { type: string }) => event.type === 'game/started');
    const blanks: number[] = [...start.payload.puzzle.givens].flatMap((value: string, cell: number) => value === '.' ? [cell] : []);
    const target = blanks[0];
    const targetDigit = Number(start.payload.puzzle.solution[target]);
    const isPeer = (left: number, right: number) => Math.floor(left / 9) === Math.floor(right / 9) ||
      left % 9 === right % 9 ||
      (Math.floor(left / 27) === Math.floor(right / 27) && Math.floor((left % 9) / 3) === Math.floor((right % 9) / 3));
    const noteCell = blanks.find((cell) => cell !== target && Number(start.payload.puzzle.solution[cell]) !== targetDigit && !isPeer(cell, target));
    const allCell = blanks.find((cell) => cell !== target && cell !== noteCell &&
      Number(start.payload.puzzle.solution[cell]) !== targetDigit &&
      Number(start.payload.puzzle.solution[cell]) !== Number(start.payload.puzzle.solution[noteCell ?? -1]));
    if (noteCell === undefined || allCell === undefined) throw new Error('Puzzle has no suitable independent note cells');
    for (const cell of blanks) {
      if (cell === target || cell === noteCell || cell === allCell) continue;
      const sequence = document.nextSequence++;
      document.events.push({
        id: `fixture-${sequence}`, sequence, gameId: start.gameId,
        type: 'cell/value-entered', payload: { cell, value: Number(start.payload.puzzle.solution[cell]) },
        occurredAt: '2026-08-16T12:00:00.000Z', elapsedMs: 0,
        schemaVersion: 1, reducerVersion: 1
      });
    }
    const noteSequence = document.nextSequence++;
    document.events.push({
      id: `fixture-${noteSequence}`, sequence: noteSequence, gameId: start.gameId,
      type: 'cell/note-toggled', payload: { cell: noteCell, value: targetDigit, enabled: true },
      occurredAt: '2026-08-16T12:00:00.000Z', elapsedMs: 0,
      schemaVersion: 1, reducerVersion: 1
    });
    await (window as unknown as { __sudokuReplaceEventDocument: (value: unknown) => Promise<unknown> })
      .__sudokuReplaceEventDocument(document);
    return {
      target, targetDigit, noteCell, allCell,
      availableNotes: [Number(start.payload.puzzle.solution[noteCell]), Number(start.payload.puzzle.solution[allCell])].sort()
    };
  });
  await page.reload();
  await steps.step('one-copy-remains', {
    description: `One correct ${finalCells.targetDigit} remains to be placed`,
    verifications: [
      { spec: 'Exactly three cells remain so the puzzle stays active through note cleanup', check: async () => await expect(page.getByRole('gridcell', { name: /editable, empty/ })).toHaveCount(3) },
      { spec: `A non-peer cell retains an old ${finalCells.targetDigit} note`, check: async () => await expect(cell(finalCells.noteCell)).toHaveAccessibleName(new RegExp(`notes ${finalCells.targetDigit}`)) },
      { spec: `The ${finalCells.targetDigit} key reports one remaining and is available`, check: async () => await expect(digit(finalCells.targetDigit, 1)).toBeEnabled() }
    ]
  });

  await cell(finalCells.target).click();
  await steps.step('last-copy-cell-selected', {
    description: `The player selects the last ${finalCells.targetDigit} cell`,
    verifications: [{ spec: 'The target cell is selected and empty', check: async () => await expect(cell(finalCells.target)).toHaveAccessibleName(/editable, empty, selected/) }]
  });

  await digit(finalCells.targetDigit, 1).click();
  await steps.step('completed-digit-disabled', {
    description: `The player places the ninth ${finalCells.targetDigit} and its key turns grey`,
    verifications: [
      { spec: `The ${finalCells.targetDigit} key reports zero remaining and is disabled`, check: async () => await expect(digit(finalCells.targetDigit, 0)).toBeDisabled() },
      { spec: 'The completed key uses the explicit grey treatment', check: async () => {
        await expect(digit(finalCells.targetDigit, 0)).toHaveCSS('color', 'rgb(119, 122, 128)');
        await expect(digit(finalCells.targetDigit, 0)).toHaveCSS('background-color', 'rgb(239, 238, 233)');
      } },
      { spec: 'The two unrelated cells keep the puzzle active', check: async () => {
        await expect(cell(finalCells.noteCell)).toHaveAccessibleName(/editable, empty/);
        await expect(cell(finalCells.allCell)).toHaveAccessibleName(/editable, empty/);
      } }
    ]
  });

  await cell(finalCells.allCell).click();
  await steps.step('plain-empty-cell-selected', {
    description: 'The player selects an empty cell without the completed-digit note',
    verifications: [{ spec: `The completed ${finalCells.targetDigit} key stays grey and disabled here`, check: async () => await expect(digit(finalCells.targetDigit, 0)).toBeDisabled() }]
  });

  await page.getByRole('button', { name: 'Notes', exact: true }).click();
  await steps.step('notes-mode-enabled', {
    description: 'The player enters Notes mode',
    verifications: [{ spec: 'All notes becomes available for the empty cell', check: async () => await expect(page.getByRole('button', { name: 'All notes', exact: true })).toBeEnabled() }]
  });

  await page.getByRole('button', { name: 'All notes', exact: true }).click();
  await steps.step('all-skips-completed-digit', {
    description: `The player chooses All and it skips the completed ${finalCells.targetDigit}`,
    verifications: [
      { spec: `The new notes contain only digits with copies still missing`, check: async () => {
        const noteValues = await cell(finalCells.allCell).locator('.cell-notes i').evaluateAll((notes) =>
          notes.flatMap((note) => note.textContent ? [Number(note.textContent)] : [])
        );
        expect(noteValues).toEqual(finalCells.availableNotes);
        expect(noteValues).not.toContain(finalCells.targetDigit);
      } },
      { spec: 'The event records exactly which available notes All added', check: async () => {
        const event = await page.evaluate(() => JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '').events.at(-1));
        expect(event).toMatchObject({ type: 'cell/notes-filled', payload: { cell: finalCells.allCell, values: finalCells.availableNotes } });
      } }
    ]
  });

  await cell(finalCells.noteCell).click();
  await steps.step('stale-note-selected', {
    description: `The player selects the cell with the stale ${finalCells.targetDigit} note`,
    verifications: [
      { spec: `The ${finalCells.targetDigit} key is enabled even though zero copies remain`, check: async () => await expect(digit(finalCells.targetDigit, 0)).toBeEnabled() },
      { spec: 'The actionable key no longer uses the grey treatment', check: async () => {
        await expect(digit(finalCells.targetDigit, 0)).toHaveCSS('color', 'rgb(70, 84, 163)');
        await expect(digit(finalCells.targetDigit, 0)).toHaveCSS('background-color', 'rgb(255, 253, 248)');
      } }
    ]
  });

  await digit(finalCells.targetDigit, 0).click();
  await steps.step('stale-note-erased', {
    description: `The player taps ${finalCells.targetDigit} to erase its stale note`,
    verifications: [
      { spec: 'The completed note is gone', check: async () => await expect(cell(finalCells.noteCell)).not.toHaveAccessibleName(new RegExp(`notes ${finalCells.targetDigit}`)) },
      { spec: `With no ${finalCells.targetDigit} note to erase, the key is grey and disabled again`, check: async () => await expect(digit(finalCells.targetDigit, 0)).toBeDisabled() },
      { spec: 'One ordinary note-toggle event records the erasure', check: async () => {
        const event = await page.evaluate(() => JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '').events.at(-1));
        expect(event).toMatchObject({ type: 'cell/note-toggled', payload: { cell: finalCells.noteCell, value: finalCells.targetDigit, enabled: false } });
      } }
    ]
  });

  await cell(finalCells.target).click();
  await steps.step('completed-value-selected', {
    description: `The player returns to the placed ${finalCells.targetDigit}`,
    verifications: [{ spec: 'Erase is available for that editable value', check: async () => await expect(page.getByRole('button', { name: 'Erase' })).toBeEnabled() }]
  });

  await page.getByRole('button', { name: 'Erase' }).click();
  await steps.step('completed-digit-restored', {
    description: `The player erases that placement and the ${finalCells.targetDigit} key returns`,
    verifications: [
      { spec: `The ${finalCells.targetDigit} key reports one remaining and is enabled again`, check: async () => await expect(digit(finalCells.targetDigit, 1)).toBeEnabled() },
      { spec: 'Replay restores the selected cell to empty', check: async () => await expect(cell(finalCells.target)).toHaveAccessibleName(/editable, empty, selected/) }
    ]
  });

  steps.generateDocs();
});
