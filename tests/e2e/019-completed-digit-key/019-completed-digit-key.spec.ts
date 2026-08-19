import { expect, test } from '@playwright/test';
import { waitForStoredEvent } from '../helpers/event-store';
import { TestStepHelper } from '../helpers/test-step-helper';

test('a digit key greys out when all nine correct copies are placed', async ({ page }, testInfo) => {
  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata(
    'Grey a completed digit until one copy is erased',
    'A near-complete event stream leaves two different values open. Placing the ninth correct copy greys and disables that digit key; erasing the placement restores the key immediately.'
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
    const other = blanks.find((cell) => Number(start.payload.puzzle.solution[cell]) !== targetDigit);
    if (other === undefined) throw new Error('Puzzle has no second blank with a different solution digit');
    for (const cell of blanks) {
      if (cell === target || cell === other) continue;
      const sequence = document.nextSequence++;
      document.events.push({
        id: `fixture-${sequence}`, sequence, gameId: start.gameId,
        type: 'cell/value-entered', payload: { cell, value: Number(start.payload.puzzle.solution[cell]) },
        occurredAt: '2026-08-16T12:00:00.000Z', elapsedMs: 0,
        schemaVersion: 1, reducerVersion: 1
      });
    }
    await (window as unknown as { __sudokuReplaceEventDocument: (value: unknown) => Promise<unknown> })
      .__sudokuReplaceEventDocument(document);
    return { target, targetDigit, other };
  });
  await page.reload();
  await steps.step('one-copy-remains', {
    description: `One correct ${finalCells.targetDigit} remains to be placed`,
    verifications: [
      { spec: 'Exactly two cells remain so the puzzle stays active after the target move', check: async () => await expect(page.getByRole('gridcell', { name: /editable, empty/ })).toHaveCount(2) },
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
      { spec: 'The unrelated final cell keeps the puzzle active', check: async () => await expect(cell(finalCells.other)).toHaveAccessibleName(/editable, empty/) }
    ]
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
