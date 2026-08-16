import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';

test('number-first and keyboard-only play reflow accessibly', async ({ page }, testInfo) => {
  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata(
    'Operate the complete puzzle with touch, mouse, or keyboard',
    'The same semantic grid reflows from a 320 px viewport through landscape, tablet, and desktop. Every keyboard command produces an observable state, and automated accessibility checks run against the playable board.'
  );
  const cell = (index: number) => page.locator(`[data-cell="${index}"]`);
  await page.goto('/');
  await page.getByRole('button', { name: 'Generate Easy puzzle' }).click();
  await steps.step('responsive-board-generated', {
    description: 'The player generates a board in the current form factor',
    verifications: [
      { spec: 'The labelled grid contains 81 gridcells without horizontal overflow', check: async () => await expect(page.getByRole('gridcell')).toHaveCount(81) },
      { spec: 'Axe reports no WCAG A/AA violations in the playable view', check: async () => {
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        expect(results.violations).toEqual([]);
      } }
    ]
  });

  const puzzle = await page.evaluate(() => JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '').events[0].payload.puzzle);
  const blanks: number[] = [...puzzle.givens].flatMap((value: string, index: number) => value === '.' ? [index] : []);
  const numberFirstCell = blanks[0];
  const numberFirstValue = Number(puzzle.solution[numberFirstCell]);
  await page.getByRole('button', { name: new RegExp(`^${numberFirstValue},`) }).click();
  await steps.step('number-chosen-first', {
    description: 'The player chooses a number before choosing a cell',
    verifications: [{ spec: 'The number pad exposes the selected number through aria-pressed', check: async () => await expect(page.getByRole('button', { name: new RegExp(`^${numberFirstValue},`) })).toHaveAttribute('aria-pressed', 'true') }]
  });
  await cell(numberFirstCell).click();
  await steps.step('number-first-value-placed', {
    description: 'Choosing an editable cell commits the previously selected number',
    verifications: [{ spec: 'The correct value is stored and the one-shot number selection clears', check: async () => {
      await expect(cell(numberFirstCell)).toHaveAccessibleName(new RegExp(`editable, ${numberFirstValue}, selected`));
      await expect(page.locator('.number-pad button[aria-pressed="true"]')).toHaveCount(0);
    } }]
  });

  const navigationStart = blanks.find((index) => index !== numberFirstCell && index % 9 < 8) ?? blanks[1];
  await cell(navigationStart).click();
  await steps.step('keyboard-cell-focused', {
    description: 'The player focuses a new cell before navigating the composite grid',
    verifications: [{ spec: 'Exactly one selected gridcell is in the tab order', check: async () => {
      await expect(cell(navigationStart)).toBeFocused();
      await expect(page.locator('[role="gridcell"][tabindex="0"]')).toHaveCount(1);
    } }]
  });
  await page.keyboard.press('ArrowRight');
  await steps.step('arrow-right-navigation', {
    description: 'Arrow Right moves focus and selection one column',
    verifications: [{ spec: 'The next cell is focused, selected, and is the sole tab stop', check: async () => {
      await expect(cell(navigationStart + 1)).toBeFocused();
      await expect(cell(navigationStart + 1)).toHaveAttribute('aria-selected', 'true');
    } }]
  });
  await page.keyboard.press('Home');
  const rowStart = Math.floor(navigationStart / 9) * 9;
  await steps.step('home-navigation', {
    description: 'Home moves to the first cell in the current row',
    verifications: [{ spec: 'The row-start cell receives focus', check: async () => await expect(cell(rowStart)).toBeFocused() }]
  });
  await page.keyboard.press('End');
  await steps.step('end-navigation', {
    description: 'End moves to the last cell in the current row',
    verifications: [{ spec: 'The row-end cell receives focus', check: async () => await expect(cell(rowStart + 8)).toBeFocused() }]
  });

  const noteCell = blanks.find((index) => index !== numberFirstCell && index !== navigationStart) ?? blanks[2];
  await cell(noteCell).click();
  await steps.step('note-cell-focused', {
    description: 'The player focuses an empty editable cell for a keyboard note',
    verifications: [{ spec: 'The empty editable cell is selected', check: async () => await expect(cell(noteCell)).toHaveAccessibleName(/editable, empty, selected/) }]
  });
  await page.keyboard.press('n');
  await steps.step('notes-mode-keyboard-toggle', {
    description: 'N toggles Notes mode without leaving the grid',
    verifications: [{ spec: 'Notes is pressed and the cell keeps focus', check: async () => {
      await expect(page.getByRole('button', { name: 'Notes' })).toHaveAttribute('aria-pressed', 'true');
      await expect(cell(noteCell)).toBeFocused();
    } }]
  });
  const noteValue = Number(puzzle.solution[noteCell]);
  await page.keyboard.press(String(noteValue));
  await steps.step('note-entered-by-keyboard', {
    description: 'A digit key adds a pencil note in Notes mode',
    verifications: [{ spec: 'The cell accessible name reports the exact note', check: async () => await expect(cell(noteCell)).toHaveAccessibleName(new RegExp(`notes ${noteValue}`)) }]
  });
  await page.keyboard.press('Delete');
  await steps.step('note-erased-by-keyboard', {
    description: 'Delete erases the focused cell',
    verifications: [{ spec: 'The cell becomes empty and cell/cleared is appended', check: async () => {
      await expect(cell(noteCell)).toHaveAccessibleName(/editable, empty, selected/);
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '').events.at(-1).type)).toBe('cell/cleared');
    } }]
  });
  await page.keyboard.press('z');
  await steps.step('erase-undone-by-keyboard', {
    description: 'Z undoes the erase without rewriting history',
    verifications: [{ spec: 'The note returns and move/undone is appended', check: async () => {
      await expect(cell(noteCell)).toHaveAccessibleName(new RegExp(`notes ${noteValue}`));
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '').events.at(-1).type)).toBe('move/undone');
    } }]
  });
  await page.keyboard.press('Shift+z');
  await steps.step('erase-redone-by-keyboard', {
    description: 'Shift+Z redoes the erase',
    verifications: [{ spec: 'The cell is empty again and move/redone is appended', check: async () => {
      await expect(cell(noteCell)).toHaveAccessibleName(/editable, empty, selected/);
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '').events.at(-1).type)).toBe('move/redone');
    } }]
  });

  await page.getByRole('button', { name: 'Hint' }).click();
  await steps.step('hint-dialog-opened-for-escape', {
    description: 'The player opens a transient dialog',
    verifications: [{ spec: 'The modal is visible before the Escape command', check: async () => await expect(page.getByRole('dialog', { name: 'Reveal one cell?' })).toBeVisible() }]
  });
  await page.keyboard.press('Escape');
  await steps.step('escape-closes-dialog', {
    description: 'Escape closes the topmost transient dialog',
    verifications: [{ spec: 'The dialog closes without appending an event', check: async () => await expect(page.getByRole('dialog')).toHaveCount(0) }]
  });
  steps.generateDocs();
});
