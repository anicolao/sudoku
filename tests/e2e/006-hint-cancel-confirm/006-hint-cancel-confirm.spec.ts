import { expect, test } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';

const ELIMINATION_ONLY_HINT_PAYLOAD =
  '8.......19.7.85.....3.7..8.....2.19.6.....5.8..95...6..84.62......719..........36' +
  '_438_532_668_743_781_878_929_931_948_955_964' +
  '_12+246+_13+56+_14+2469+_15+349+_16+36+_17+24679+_18+2457+' +
  '_22+1246+_24+1246+_27+2346+_28+24+_29+234+_31+1245+_32+12456+' +
  '_34+12469+_36+16+_37+2469+_39+2459+_41+345+_42+3457+_44+46+' +
  '_46+367+_49+347+_52+347+_54+149+_55+349+_56+137+_58+47+' +
  '_61+134+_62+1347+_65+34+_67+2347+_69+2347+_71+57+_77+79+' +
  '_79+579+_81+23+_82+236+_83+56+_88+245+_89+24+_91+27+_97+27+' +
  '_time=792871_mistakes=0_settings=01110111';

const VISUAL_ELIMINATION_PAYLOAD = '.623948.7.3....2...7....4.3...1...3.6.9....42.......8.2..6..974....5.6.8.967.83..' +
  '_342_11+15+_18+15+_21+14589+_23+1458+_24+58+_25+1678+_26+1567+_28+1569+_29+1569+' +
  '_31+1589+_33+158+_35+168+_36+156+_38+1569+_41+4578+_42+2458+_43+4578+_45+24678+' +
  '_46+25679+_47+57+_49+569+_52+158+_54+58+_55+378+_56+357+_57+157+_61+13457+' +
  '_62+1245+_63+13457+_64+49+_65+23467+_66+235679+_67+157+_69+1569+_72+58+_73+58+' +
  '_75+13+_76+13+_81+37+_82+14+_83+37+_84+49+_86+19+_88+12+_91+14+_95+124+' +
  '_98+125+_99+15+_time=753688_mistakes=0_settings=01110011';

test('a hint can fill candidates, visualize or name a technique, identify a cell, or reveal it', async ({ page }, testInfo) => {
  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata(
    'Choose how much help a hint provides',
    'The hint menu can fill every basic candidate in one undoable action. Technique and visual guidance identify the simplest available placement or elimination; visual guidance can apply that deduction and advance, while cell guidance and reveal use the simplest book-rule placement.'
  );
  const stream = async () => page.evaluate(() =>
    JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '{"events":[]}').events
  );
  await page.goto('/');

  await page.getByRole('button', { name: 'Generate Foundations puzzle' }).click();
  await steps.step('puzzle-generated', {
    description: 'The generated puzzle offers an enabled Hint action',
    verifications: [
      { spec: 'Hint is available and the summary has no hint event', check: async () => {
        await expect(page.getByRole('button', { name: 'Hint' })).toBeEnabled();
        expect(await stream()).toHaveLength(1);
      } }
    ]
  });

  await page.getByRole('button', { name: 'Hint' }).click();
  await steps.step('hint-choices-opened', {
    description: 'The player opens five distinct kinds of help',
    verifications: [
      { spec: 'The modal offers candidate, technique, visual, cell, and reveal choices', check: async () => {
        const dialog = page.getByRole('dialog', { name: 'Choose a hint' });
        await expect(dialog).toBeVisible();
        await expect(dialog.getByRole('button', { name: /Fill basic candidates/ })).toBeEnabled();
        await expect(dialog.getByRole('button', { name: /Technique only/ })).toBeEnabled();
        await expect(dialog.getByRole('button', { name: /Visual hint/ })).toBeEnabled();
        await expect(dialog.getByRole('button', { name: /Cell only/ })).toBeEnabled();
        await expect(dialog.getByRole('button', { name: /Reveal one cell/ })).toBeEnabled();
      } },
      { spec: 'Opening the choices appends no event', check: async () => expect(await stream()).toHaveLength(1) }
    ]
  });

  await page.getByRole('button', { name: /Fill basic candidates/ }).click();
  await steps.step('basic-candidates-filled', {
    description: 'The player asks the app to fill candidates allowed by each current unit',
    verifications: [
      { spec: 'Every editable empty cell receives fixed-position notes', check: async () => {
        const editableCount = await page.getByRole('gridcell', { name: /editable/ }).count();
        await expect(page.locator('.cell-notes')).toHaveCount(editableCount);
        await expect(page.getByRole('gridcell', { name: /editable, empty, notes [1-9]/ })).toHaveCount(editableCount);
      } },
      { spec: 'One undoable candidate-fill fact is recorded without incrementing hints', check: async () => {
        const events = await stream();
        expect(events).toHaveLength(2);
        expect(events[1]).toMatchObject({ type: 'notes/basic-filled' });
        await expect(page.getByRole('button', { name: 'Undo Filled basic candidates' })).toBeEnabled();
      } }
    ]
  });

  await page.getByRole('button', { name: 'Undo Filled basic candidates' }).click();
  await page.getByRole('button', { name: 'Hint' }).click();
  await page.getByRole('button', { name: /Technique only/ }).click();
  await steps.step('technique-hint-shown', {
    description: 'The player asks only which technique to try',
    verifications: [
      { spec: 'The result names one supported book rule without naming a cell or value', check: async () => {
        const dialog = page.getByRole('dialog', { name: /Try / });
        await expect(dialog.getByRole('heading')).toHaveText(/Try (Full House|Naked Single|Hidden Single|Naked Pairs|Hidden Pairs|Pointing Pairs|Y-Wing|X-Wing|Swordfish|Naked Triples|Simple Colors|XY-Chains|Unique Rectangles|3D Medusa)/);
        await expect(dialog).toContainText('simplest book rule');
        await expect(dialog).not.toContainText(/r\d+c\d+/);
      } },
      { spec: 'Technique advice changes no cell and appends no event', check: async () => {
        await expect(page.getByRole('gridcell', { selected: true })).toHaveCount(0);
        expect(await stream()).toHaveLength(3);
      } }
    ]
  });

  await page.getByRole('button', { name: 'Back to puzzle' }).click();
  await page.getByRole('button', { name: 'Hint' }).click();
  await page.getByRole('button', { name: /Visual hint/ }).click();
  let firstVisualCell = -1;
  await steps.step('visual-hint-shown', {
    description: 'The player sees the rule on the board without receiving its answer',
    verifications: [
      { spec: 'The board marks one destination and its transparent red exclusions', check: async () => {
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await expect(page.getByRole('status', { name: /Visual hint for/ })).toBeVisible();
        await expect(page.locator('[data-visual-hint-target="true"]')).toHaveCount(1);
        expect(await page.locator('[data-hint-exclusion]').count()).toBeGreaterThan(0);
      } },
      { spec: 'The destination omits its solved digit and visual guidance appends no event', check: async () => {
        const target = page.locator('[data-visual-hint-target="true"]');
        const targetCell = Number(await target.getAttribute('data-cell'));
        firstVisualCell = targetCell;
        const events = await stream();
        const solvedValue = events[0].payload.puzzle.solution[targetCell];
        await expect(target).not.toContainText(solvedValue);
        expect(events).toHaveLength(3);
      } }
    ]
  });

  await page.getByRole('button', { name: 'Next hint' }).click();
  await expect(page.locator(`[data-cell="${firstVisualCell}"]`)).toHaveAccessibleName(/revealed by hint/);
  const nextTarget = page.locator('[data-visual-hint-target="true"]');
  await expect(nextTarget).toHaveCount(1);
  expect(Number(await nextTarget.getAttribute('data-cell'))).not.toBe(firstVisualCell);
  const eventsAfterNextHint = await stream();
  expect(eventsAfterNextHint).toHaveLength(4);
  expect(eventsAfterNextHint[3]).toMatchObject({ type: 'hint/revealed', payload: { cell: firstVisualCell } });

  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('.mode-switch')).toBeVisible();
  await page.getByRole('button', { name: 'Hint' }).click();
  await page.getByRole('button', { name: /Cell only/ }).click();
  let advisedCell = -1;
  await steps.step('cell-hint-shown', {
    description: 'The player asks which cell to solve without seeing its contents',
    verifications: [
      { spec: 'The result names one coordinate and selects that still-empty cell', check: async () => {
        const selected = page.getByRole('gridcell', { selected: true });
        await expect(selected).toHaveCount(1);
        await expect(selected).toHaveAccessibleName(/editable, empty, selected/);
        advisedCell = Number(await selected.getAttribute('data-cell'));
        const coordinate = `r${Math.floor(advisedCell / 9) + 1}c${(advisedCell % 9) + 1}`;
        await expect(page.getByRole('dialog', { name: `Try ${coordinate}` })).toContainText('number is still yours to find');
      } },
      { spec: 'Cell advice reveals no additional number and appends no event', check: async () => {
        await expect(page.getByRole('gridcell', { name: /revealed by hint/ })).toHaveCount(1);
        expect(await stream()).toHaveLength(4);
      } }
    ]
  });

  await page.getByRole('button', { name: 'Back to puzzle' }).click();
  await page.getByRole('button', { name: 'Hint' }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await steps.step('hint-cancelled', {
    description: 'The player can still cancel from the choice menu',
    verifications: [
      { spec: 'The dialog closes without revealing another cell', check: async () => {
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await expect(page.getByRole('gridcell', { name: /revealed by hint/ })).toHaveCount(1);
      } },
      { spec: 'Cancellation leaves the event stream unchanged', check: async () => expect(await stream()).toHaveLength(4) }
    ]
  });

  await page.getByRole('button', { name: 'Hint' }).click();
  await steps.step('hint-choices-reopened', {
    description: 'The player returns and chooses the full reveal',
    verifications: [
      { spec: 'Reveal one cell is now the explicit confirm action', check: async () => await expect(page.getByRole('button', { name: 'Reveal one cell' })).toBeEnabled() }
    ]
  });

  await page.getByRole('button', { name: 'Reveal one cell' }).click();
  await steps.step('one-cell-revealed', {
    description: 'Reveal places the same simplest target identified by Cell only',
    verifications: [
      { spec: 'Both applied hints are labelled and the newly revealed cell is selected', check: async () => {
        const hinted = page.getByRole('gridcell', { name: /revealed by hint/ });
        await expect(hinted).toHaveCount(2);
        await expect(page.locator(`[data-cell="${advisedCell}"]`)).toHaveAccessibleName(/revealed by hint/);
        await expect(page.locator(`[data-cell="${advisedCell}"]`)).toHaveAttribute('aria-selected', 'true');
      } },
      { spec: 'The second hint/revealed fact records the exact cell and solution value', check: async () => {
        const events = await stream();
        expect(events).toHaveLength(5);
        const hint = events[4];
        expect(hint).toMatchObject({ type: 'hint/revealed' });
        expect(hint.payload.value).toBe(Number(events[0].payload.puzzle.solution[hint.payload.cell]));
      } }
    ]
  });

  steps.generateDocs();
});

test('Technique only names the simplest elimination when no technique immediately places a digit', async ({ page }) => {
  await page.goto(`/?p=${encodeURIComponent(ELIMINATION_ONLY_HINT_PAYLOAD)}`);
  await page.getByRole('button', { name: 'Open shared work' }).click();
  await page.getByRole('button', { name: 'Hint' }).click();
  await page.getByRole('button', { name: /Technique only/ }).click({ timeout: 15_000 });

  const dialog = page.getByRole('dialog', { name: 'Try Hidden Pairs' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('simplest book rule');
  await expect(page.getByRole('heading', { name: 'No listed technique found' })).toHaveCount(0);
});

test('applying a visual elimination places a value when only one candidate remains', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto(`/?p=${encodeURIComponent(VISUAL_ELIMINATION_PAYLOAD)}`);
  const start = page.getByRole('button', { name: 'Open shared work' });
  await expect(start).toBeEnabled({ timeout: 15_000 });
  await start.click();

  await page.getByRole('button', { name: 'Hint' }).click({ timeout: 20_000 });
  await page.getByRole('button', { name: /Visual hint/ }).click({ timeout: 20_000 });
  await expect(page.getByRole('status', { name: /Visual hint for Naked Pairs/ })).toBeVisible();
  await expect(page.locator('[data-visual-hint-target="true"]')).toHaveAttribute('data-cell', '68');

  await page.getByRole('button', { name: 'Next hint' }).click({ timeout: 20_000 });

  await expect(page.locator('[data-cell="68"]')).toHaveAccessibleName(/9, revealed by hint/);
  const events = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '{"events":[]}').events
  );
  expect(events).toContainEqual(expect.objectContaining({
    type: 'hint/revealed',
    payload: expect.objectContaining({ cell: 68, value: 9 })
  }));
});
