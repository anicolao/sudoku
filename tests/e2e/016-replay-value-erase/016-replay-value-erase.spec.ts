import { expect, test } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';

test('erasing a value replays without every effect of its placement', async ({ page }, testInfo) => {
  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata(
    'Erase a value by replaying without its placement',
    'The player adds notes to a cell and its peer, places a value that removes those notes, then erases the value. Replay restores every note affected by that exact placement; erasing a notes-only cell still clears only that cell.'
  );
  const cell = (index: number) => page.locator(`[data-cell="${index}"]`);
  const digit = (value: number) => page.getByRole('button', { name: new RegExp(`^${value},`) });
  const events = async () => page.evaluate(() =>
    JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '{"events":[]}').events
  );

  await page.goto('/');
  await page.getByRole('button', { name: 'Generate Foundations puzzle' }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('sudoku.event-store.v1'))).not.toBeNull();
  const values = await page.evaluate(() => {
    const puzzle = JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '').events[0].payload.puzzle;
    const placed = Number(puzzle.solution[34]);
    return { placed, retained: placed === 1 ? 2 : 1 };
  });
  await steps.step('puzzle-generated', {
    description: 'The player generates a puzzle for the replay correction',
    verifications: [{ spec: 'The target and its row peer are editable', check: async () => {
      await expect(cell(34)).toHaveAccessibleName(/editable, empty/);
      await expect(cell(27)).toHaveAccessibleName(/editable, empty/);
    } }]
  });

  await cell(34).click();
  await steps.step('target-selected', {
    description: 'The player selects the target cell',
    verifications: [{ spec: 'Row 4 column 8 is selected', check: async () => await expect(cell(34)).toHaveAttribute('aria-selected', 'true') }]
  });

  await page.getByRole('button', { name: 'Notes', exact: true }).click();
  await steps.step('notes-mode-selected', {
    description: 'The player switches to Notes mode',
    verifications: [{ spec: 'Notes mode is active', check: async () => await expect(page.getByRole('button', { name: 'Notes', exact: true })).toHaveAttribute('aria-pressed', 'true') }]
  });

  await digit(values.retained).click();
  await steps.step('target-note-added', {
    description: `The player adds note ${values.retained} to the target`,
    verifications: [{ spec: 'The target exposes its original note', check: async () => await expect(cell(34)).toHaveAccessibleName(new RegExp(`notes ${values.retained}`)) }]
  });

  await cell(27).click();
  await steps.step('peer-selected', {
    description: 'The player selects a peer in the same row',
    verifications: [{ spec: 'Row 4 column 1 is selected', check: async () => await expect(cell(27)).toHaveAttribute('aria-selected', 'true') }]
  });

  await digit(values.placed).click();
  await steps.step('peer-note-added', {
    description: `The player adds matching note ${values.placed} to the peer`,
    verifications: [{ spec: 'The peer exposes the matching note', check: async () => await expect(cell(27)).toHaveAccessibleName(new RegExp(`notes ${values.placed}`)) }]
  });

  await cell(34).click();
  await steps.step('target-reselected', {
    description: 'The player returns to the target cell',
    verifications: [{ spec: 'The target retains its note before placement', check: async () => await expect(cell(34)).toHaveAccessibleName(new RegExp(`notes ${values.retained}.*selected`)) }]
  });

  await page.getByRole('button', { name: 'Number', exact: true }).click();
  await steps.step('number-mode-selected', {
    description: 'The player switches to Number mode',
    verifications: [{ spec: 'Number mode is active', check: async () => await expect(page.getByRole('button', { name: 'Number', exact: true })).toHaveAttribute('aria-pressed', 'true') }]
  });

  await digit(values.placed).click();
  await steps.step('value-placed', {
    description: `The player places ${values.placed}, clearing every note it affects`,
    verifications: [
      { spec: 'The target value replaces its old notes', check: async () => await expect(cell(34)).toHaveAccessibleName(new RegExp(`editable, ${values.placed}, selected`)) },
      { spec: 'Automatic cleanup removes the matching peer note', check: async () => await expect(cell(27)).toHaveAccessibleName(/editable, empty(?!.*notes)/) }
    ]
  });
  const placement = (await events()).at(-1);

  await page.getByRole('button', { name: 'Erase' }).click();
  await steps.step('value-erased-by-replay', {
    description: 'The player erases the value and replay restores all affected notes',
    verifications: [
      { spec: 'The target original note returns', check: async () => await expect(cell(34)).toHaveAccessibleName(new RegExp(`notes ${values.retained}.*selected`)) },
      { spec: 'The peer matching note returns', check: async () => await expect(cell(27)).toHaveAccessibleName(new RegExp(`notes ${values.placed}`)) },
      { spec: 'The erase event targets the exact placement instead of storing derived cell snapshots', check: async () => {
        expect((await events()).at(-1)).toMatchObject({
          type: 'cell/value-erased',
          payload: { cell: 34, value: values.placed, targetEventId: placement.id }
        });
      } }
    ]
  });

  await page.reload();
  await steps.step('restored-notes-replayed', {
    description: 'A reload reconstructs the restored notes from the event stream',
    verifications: [
      { spec: 'The target note remains restored after reload', check: async () => await expect(cell(34)).toHaveAccessibleName(new RegExp(`notes ${values.retained}`)) },
      { spec: 'The peer note remains restored after reload', check: async () => await expect(cell(27)).toHaveAccessibleName(new RegExp(`notes ${values.placed}`)) }
    ]
  });

  await cell(34).click();
  await steps.step('notes-only-cell-selected', {
    description: 'The player selects the notes-only target',
    verifications: [{ spec: 'Erase is available for the restored marking', check: async () => await expect(page.getByRole('button', { name: 'Erase', exact: true })).toBeEnabled() }]
  });

  await page.getByRole('button', { name: 'Erase', exact: true }).click();
  await steps.step('markings-cleared-only', {
    description: 'The player erases markings without changing any peer',
    verifications: [
      { spec: 'The target markings are empty', check: async () => await expect(cell(34)).toHaveAccessibleName(/editable, empty, selected/) },
      { spec: 'The peer note is untouched', check: async () => await expect(cell(27)).toHaveAccessibleName(new RegExp(`notes ${values.placed}`)) },
      { spec: 'A notes-only erase remains a simple cell/cleared event', check: async () => expect((await events()).at(-1)).toMatchObject({ type: 'cell/cleared', payload: { cell: 34 } }) }
    ]
  });

  steps.generateDocs();
});
