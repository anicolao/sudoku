import { expect, test } from '@playwright/test';
import { waitForStoredEvent } from '../helpers/event-store';
import { TestStepHelper } from '../helpers/test-step-helper';

test.use({ hasTouch: true });

test('number highlighting can include matching notes and expand to every peer set', async ({ page }, testInfo) => {
  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata(
    'Highlight solved digits, their exclusions, and matching notes',
    'Matching candidate notes are emphasized by default when a filled digit is selected. The selected digit can still expand from its local peers to every matching digit’s peer set, and the note emphasis can be disabled in Settings.'
  );
  const cell = (index: number) => page.locator(`[data-cell="${index}"]`);

  await page.goto('/');
  await page.getByRole('button', { name: 'Generate Foundations puzzle' }).click();
  const { puzzle } = (await waitForStoredEvent(page, 'game/started')).payload;
  const choice = await page.evaluate((puzzle) => {
    for (let digit = 1; digit <= 9; digit += 1) {
      const cells = [...puzzle.givens].flatMap((value, cell) => Number(value) === digit ? [cell] : []);
      const noteCells = [...puzzle.givens].flatMap((value, cell) => value === '.' ? [cell] : []).slice(0, 2);
      if (cells.length >= 2 && noteCells.length === 2) return { digit, cell: cells[0], matches: cells, noteCells };
    }
    throw new Error('Generated puzzle has no repeated given digit');
  }, puzzle);
  const expectedPeerCount = await page.evaluate((matches) => {
    const peers = new Set<number>();
    for (const cell of matches) {
      const row = Math.floor(cell / 9), column = cell % 9;
      for (let offset = 0; offset < 9; offset += 1) {
        peers.add(row * 9 + offset);
        peers.add(offset * 9 + column);
        peers.add((Math.floor(row / 3) * 3 + Math.floor(offset / 3)) * 9 + Math.floor(column / 3) * 3 + offset % 3);
      }
      peers.delete(cell);
    }
    return peers.size;
  }, choice.matches);
  await steps.step('puzzle-generated', {
    description: 'The player generates a board with repeated instances of a digit',
    verifications: [{ spec: `Digit ${choice.digit} appears in at least two fixed cells`, check: async () => expect(choice.matches.length).toBeGreaterThanOrEqual(2) }]
  });

  await cell(choice.noteCells[0]).tap();
  await page.getByRole('button', { name: 'Notes', exact: true }).click();
  await page.getByRole('button', { name: new RegExp(`^${choice.digit},`) }).click();
  await cell(choice.noteCells[1]).tap();
  await page.getByRole('button', { name: new RegExp(`^${choice.digit},`) }).click();
  await page.getByRole('button', { name: 'Number', exact: true }).click();
  const initialScale = await page.evaluate(() => window.visualViewport?.scale ?? 1);
  await cell(choice.cell).tap();
  await steps.step('single-peer-highlight', {
    description: `The first tap selects one ${choice.digit}, shows its peers, and emphasizes matching notes`,
    verifications: [
      { spec: 'Exactly the selected cell’s 20 peers use the local peer treatment', check: async () => await expect(page.locator('[data-highlight="peer"]')).toHaveCount(20) },
      { spec: 'Every matching digit uses the ordinary blue matching treatment', check: async () => await expect(page.locator('[data-highlight="matching"]')).toHaveCount(choice.matches.length) },
      { spec: 'Every matching candidate note is highlighted by default', check: async () => {
        await expect(page.locator('[data-highlight="matching-note"]')).toHaveCount(2);
        await expect(page.locator('[data-highlight="matching-note"]').first()).toHaveCSS('background-color', 'rgb(207, 212, 243)');
      } },
      { spec: 'The board handles taps without enabling double-tap zoom', check: async () => {
        await expect(cell(choice.cell)).toHaveCSS('touch-action', 'manipulation');
      } }
    ]
  });

  await cell(choice.cell).tap();
  await steps.step('number-wide-highlight', {
    description: `The second tap expands ${choice.digit} highlighting across the puzzle in pink`,
    verifications: [
      { spec: 'Every instance of the digit has the number-wide treatment', check: async () => await expect(page.locator('[data-highlight="number-match"]')).toHaveCount(choice.matches.length) },
      { spec: 'The union of every matching digit’s peer set has the pink treatment', check: async () => await expect(page.locator('[data-highlight="number-peer"]')).toHaveCount(expectedPeerCount) },
      { spec: 'Both matching candidate notes remain emphasized', check: async () => await expect(page.locator('[data-highlight="matching-note"]')).toHaveCount(2) },
      { spec: 'The pink peer colour is visually distinct from the blue local peer colour', check: async () => {
        expect(await page.locator('[data-highlight="number-peer"]').first().evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(253, 232, 239)');
      } },
      { spec: 'The second tap leaves the browser zoom unchanged', check: async () => {
        expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(initialScale);
      } }
    ]
  });

  await cell(choice.cell).tap();
  await steps.step('local-highlight-restored', {
    description: 'The third tap returns to the selected cell’s local blue peers',
    verifications: [
      { spec: 'The 20 local peers are blue again', check: async () => await expect(page.locator('[data-highlight="peer"]')).toHaveCount(20) },
      { spec: 'No number-wide pink highlight remains', check: async () => await expect(page.locator('[data-highlight^="number-"]')).toHaveCount(0) }
    ]
  });

  const bounds = await cell(choice.cell).boundingBox();
  if (!bounds) throw new Error('Selected cell has no touch target');
  const tapPoint = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  await page.touchscreen.tap(tapPoint.x, tapPoint.y);
  await page.touchscreen.tap(tapPoint.x, tapPoint.y);
  await steps.step('rapid-double-tap-no-zoom', {
    description: 'A rapid double tap remains an app gesture instead of zooming the browser',
    verifications: [
      { spec: 'The visual viewport remains at its original scale', check: async () => {
        expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(initialScale);
      } },
      { spec: 'Both taps reach the puzzle and return the highlight to its local state', check: async () => {
        await expect(page.locator('[data-highlight="peer"]')).toHaveCount(20);
        await expect(page.locator('[data-highlight^="number-"]')).toHaveCount(0);
      } }
    ]
  });

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('switch', { name: /Highlight matching notes/ }).click();
  await steps.step('matching-note-highlighting-disabled', {
    description: 'The player disables candidate-note highlighting for more deliberate practice',
    verifications: [
      { spec: 'The preference switch is off', check: async () => await expect(page.getByRole('switch', { name: /Highlight matching notes/ })).toHaveAttribute('aria-checked', 'false') },
      { spec: 'The preference change is stored as a settings event', check: async () => {
        const events = await page.evaluate(() => JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '').events);
        expect(events.at(-1)).toMatchObject({ type: 'settings/changed', payload: { highlightMatchingNotes: false } });
      } }
    ]
  });

  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await steps.step('matching-note-highlighting-removed', {
    description: 'The selected digit keeps its normal highlights without emphasizing its notes',
    verifications: [
      { spec: 'No candidate note has the matching-note treatment', check: async () => await expect(page.locator('[data-highlight="matching-note"]')).toHaveCount(0) },
      { spec: 'Both candidate notes remain on the board', check: async () => {
        for (const noteCell of choice.noteCells) await expect(cell(noteCell)).toHaveAccessibleName(new RegExp(`notes ${choice.digit}`));
      } }
    ]
  });

  steps.generateDocs();
});
