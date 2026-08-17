import { expect, test } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';

test('the player selects cells, records notes, enters values, and sees conflicts', async ({ page }, testInfo) => {
  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata(
    'Values, notes, conflicts, and the game log',
    'Every click below appends either no event or exactly one canonical fact, then replay updates the board and its plain-language log.'
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Generate Foundations puzzle' }).click();
  await expect(page.getByRole('grid', { name: 'Foundations Sudoku puzzle' })).toBeVisible();

  const cell = (index: number) => page.locator(`[data-cell="${index}"]`);
  const digit = (value: number) => page.getByRole('button', { name: new RegExp(`^${value},`) });
  const eventTypes = async () => page.evaluate(() =>
    JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '{"events":[]}').events.map(
      (event: { type: string }) => event.type
    )
  );

  await steps.step('puzzle-ready', {
    description: 'The player has generated a fresh puzzle with an inspectable start event',
    verifications: [
      { spec: 'The board is ready and no editable cell is selected', check: async () => {
        await expect(page.getByRole('gridcell', { selected: true })).toHaveCount(0);
      } },
      { spec: 'The game log begins with exactly one start entry', check: async () => {
        await expect(page.locator('[data-event-type]')).toHaveCount(1);
        await expect(page.locator('[data-event-type="game/started"]')).toHaveText('Started Foundations puzzle');
      } }
    ]
  });

  await cell(34).click();
  await steps.step('cell-selected', {
    description: 'A click selects row 4 column 8 and highlights its peers',
    verifications: [
      { spec: 'Row 4 column 8 is the selected editable empty cell', check: async () => {
        await expect(cell(34)).toHaveAttribute('aria-selected', 'true');
        await expect(cell(34)).toHaveAccessibleName(/Row 4, column 8, editable, empty, selected/);
      } },
      { spec: 'Selection is ephemeral and appends no event', check: async () => expect(await eventTypes()).toEqual(['game/started']) }
    ]
  });

  await page.getByRole('button', { name: 'Notes', exact: true }).click();
  await steps.step('notes-mode', {
    description: 'The player switches explicitly from Number mode to Notes mode',
    verifications: [
      { spec: 'Notes is visibly and programmatically pressed', check: async () => {
        await expect(page.getByRole('button', { name: 'Notes', exact: true })).toHaveAttribute('aria-pressed', 'true');
      } },
      { spec: 'Changing input mode appends no event', check: async () => expect(await eventTypes()).toHaveLength(1) }
    ]
  });

  for (const value of [2, 3, 8]) {
    await digit(value).click();
    await steps.step(`note-${value}-added`, {
      description: `The player adds pencil note ${value}`,
      verifications: [
        { spec: `The selected cell exposes note ${value} in its accessible name`, check: async () => {
          await expect(cell(34)).toHaveAccessibleName(new RegExp(`notes .*${value}`));
        } },
        { spec: `One cell/note-toggled event records note ${value}`, check: async () => {
          const types = await eventTypes();
          expect(types.at(-1)).toBe('cell/note-toggled');
          expect(types).toHaveLength(value === 2 ? 2 : value === 3 ? 3 : 4);
        } },
        { spec: `The newest game-log row says Added note ${value} to r4c8`, check: async () => {
          await expect(page.locator('[data-event-type]').first()).toHaveText(`Added note ${value} to r4c8`);
        } }
      ]
    });
  }

  await digit(2).click();
  await steps.step('note-2-removed', {
    description: 'Clicking an existing pencil note removes that note only',
    verifications: [
      { spec: 'The cell retains notes 3 and 8 but no longer announces note 2', check: async () => {
        await expect(cell(34)).toHaveAccessibleName(/notes 3 8/);
      } },
      { spec: 'The newest log row says Removed note 2 from r4c8', check: async () => {
        await expect(page.locator('[data-event-type]').first()).toHaveText('Removed note 2 from r4c8');
      } }
    ]
  });

  await page.getByRole('button', { name: 'Number', exact: true }).click();
  await steps.step('number-mode', {
    description: 'The player returns to Number mode before committing a value',
    verifications: [
      { spec: 'Number is visibly and programmatically pressed', check: async () => {
        await expect(page.getByRole('button', { name: 'Number', exact: true })).toHaveAttribute('aria-pressed', 'true');
      } },
      { spec: 'The mode-only click leaves the five-event stream unchanged', check: async () => expect(await eventTypes()).toHaveLength(5) }
    ]
  });

  const correctValue = await page.evaluate(() => {
    const event = JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '').events[0];
    return Number(event.payload.puzzle.solution[34]);
  });
  await digit(correctValue).click();
  await steps.step('correct-value-entered', {
    description: 'The player commits the correct value and its old notes disappear',
    verifications: [
      { spec: 'Row 4 column 8 contains the committed user value with no notes', check: async () => {
        await expect(cell(34)).toHaveAccessibleName(new RegExp(`editable, ${correctValue}, selected`));
      } },
      { spec: 'One cell/value-entered event and matching log row record the placement', check: async () => {
        expect((await eventTypes()).at(-1)).toBe('cell/value-entered');
        await expect(page.locator('[data-event-type]').first()).toHaveText(`Placed ${correctValue} in r4c8`);
      } }
    ]
  });

  await cell(27).click();
  await steps.step('conflict-cell-selected', {
    description: 'The player selects another editable cell in the same row',
    verifications: [
      { spec: 'Row 4 column 1 is selected without changing history', check: async () => {
        await expect(cell(27)).toHaveAttribute('aria-selected', 'true');
        expect(await eventTypes()).toHaveLength(6);
      } }
    ]
  });

  const conflictChoice = await page.evaluate(() => {
    const puzzle = JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '').events[0].payload.puzzle;
    for (let peerCell = 28; peerCell <= 35; peerCell += 1) {
      if (puzzle.givens[peerCell] !== '.') return { value: Number(puzzle.givens[peerCell]), peerCell };
    }
    throw new Error('Row 4 has no fixed value for the conflict journey');
  });
  await digit(conflictChoice.value).click();
  await steps.step('row-conflict-visible', {
    description: 'Entering a duplicate keeps the value visible and clearly marks the row conflict',
    verifications: [
      { spec: 'The entered value and the existing row 4 given both expose conflict state', check: async () => {
        await expect(cell(27)).toHaveAccessibleName(new RegExp(`editable, ${conflictChoice.value}, conflict, selected`));
        await expect(cell(conflictChoice.peerCell)).toHaveAccessibleName(new RegExp(`fixed, ${conflictChoice.value}, conflict`));
      } },
      { spec: 'The conflict remains a derived projection of one value event', check: async () => {
        const types = await eventTypes();
        expect(types).toHaveLength(7);
        expect(types.at(-1)).toBe('cell/value-entered');
      } },
      { spec: 'The visible log preserves the exact newest placement', check: async () => {
        await expect(page.locator('[data-event-type]').first()).toHaveText(`Placed ${conflictChoice.value} in r4c1`);
      } }
    ]
  });

  steps.generateDocs();
});
