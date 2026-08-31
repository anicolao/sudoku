import { expect, test, type Locator } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';

const peers = (origin: number): number[] => Array.from({ length: 81 }, (_, cell) => cell).filter((cell) =>
  cell !== origin && (
    Math.floor(cell / 9) === Math.floor(origin / 9) ||
    cell % 9 === origin % 9 ||
    (
      Math.floor(cell / 27) === Math.floor(origin / 27) &&
      Math.floor((cell % 9) / 3) === Math.floor((origin % 9) / 3)
    )
  )
);

test('Stripes alternates two peer overlays and reveals their intersections', async ({ page }, testInfo) => {
  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata(
    'Find shared peers with alternating Stripes',
    'Stripes keeps the latest even and odd peer sets on the board. Each set uses sparse parallel lines of alternating parity, so cells reached by both taps become densely striped without changing the saved puzzle.'
  );
  const cell = (index: number): Locator => page.locator(`[data-cell="${index}"]`);
  const striped = (kind: 'even' | 'odd'): Locator => page.locator(`[data-stripes~="${kind}"]`);
  const eventCount = async (): Promise<number> => page.evaluate(() =>
    JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '{"events":[]}').events.length
  );

  await page.goto('/');
  await page.getByRole('button', { name: 'Generate Foundations puzzle' }).click();
  await page.getByRole('button', { name: 'Stripes', exact: true }).click();
  await steps.step('stripes-ready', {
    description: 'The player opens the ephemeral Stripes input mode',
    verifications: [
      { spec: 'Stripes is pressed and the first tap will use even stripes', check: async () => {
        await expect(page.getByRole('button', { name: 'Stripes', exact: true })).toHaveAttribute('aria-pressed', 'true');
        await expect(page.getByText('Even stripes next', { exact: true })).toBeVisible();
      } },
      { spec: 'The number pad is replaced by stripe guidance', check: async () => await expect(page.locator('.number-pad')).toHaveCount(0) },
      { spec: 'Changing modes records no puzzle event', check: async () => expect(await eventCount()).toBe(1) }
    ]
  });

  const evenOrigin = 0;
  await cell(evenOrigin).click();
  await steps.step('even-peers-marked', {
    description: 'The first tap lays sparse even stripes across its row, column, and box peers',
    verifications: [
      { spec: 'Exactly the 20 peers of r1c1 carry even stripes', check: async () => {
        await expect(striped('even')).toHaveCount(20);
        expect(await striped('even').evaluateAll((cells) => cells.map((item) => Number(item.getAttribute('data-cell'))).sort((a, b) => a - b))).toEqual(peers(evenOrigin));
      } },
      { spec: 'The tapped cell is identified as the even source but is not its own peer', check: async () => {
        await expect(cell(evenOrigin)).toHaveAttribute('data-stripe-source', 'even');
        await expect(cell(evenOrigin)).not.toHaveAttribute('data-stripes', /even/);
      } },
      { spec: 'The next tap switches to odd stripes without saving an event', check: async () => {
        await expect(page.getByText('Odd stripes next', { exact: true })).toBeVisible();
        expect(await eventCount()).toBe(1);
      } }
    ]
  });

  const oddOrigin = 40;
  const sharedPeers = peers(evenOrigin).filter((candidate) => peers(oddOrigin).includes(candidate));
  await cell(oddOrigin).click();
  await steps.step('shared-peers-densely-striped', {
    description: 'The second tap interleaves odd stripes so shared peers become densely striped',
    verifications: [
      { spec: 'The latest odd source also marks exactly 20 peers', check: async () => await expect(striped('odd')).toHaveCount(20) },
      { spec: 'Only cells seen by both sources carry both stripe types', check: async () => {
        const overlap = page.locator('[data-stripes="even odd"]');
        await expect(overlap).toHaveCount(sharedPeers.length);
        expect(await overlap.evaluateAll((cells) => cells.map((item) => Number(item.getAttribute('data-cell'))).sort((a, b) => a - b))).toEqual(sharedPeers);
      } },
      { spec: 'Both source cells and stripe types are announced accessibly', check: async () => {
        await expect(cell(evenOrigin)).toHaveAccessibleName(/even stripe source/);
        await expect(cell(oddOrigin)).toHaveAccessibleName(/odd stripe source/);
        await expect(cell(sharedPeers[0])).toHaveAccessibleName(/even stripe, odd stripe/);
      } }
    ]
  });

  const replacementEvenOrigin = 8;
  await cell(replacementEvenOrigin).click();
  await steps.step('older-even-set-replaced', {
    description: 'A third tap replaces only the older even set and keeps the odd set',
    verifications: [
      { spec: 'Even stripes now match the third tap instead of the first', check: async () => {
        expect(await striped('even').evaluateAll((cells) => cells.map((item) => Number(item.getAttribute('data-cell'))).sort((a, b) => a - b))).toEqual(peers(replacementEvenOrigin));
        await expect(cell(evenOrigin)).not.toHaveAttribute('data-stripe-source', /even/);
        await expect(cell(replacementEvenOrigin)).toHaveAttribute('data-stripe-source', 'even');
      } },
      { spec: 'The previous odd stripes remain unchanged', check: async () => {
        expect(await striped('odd').evaluateAll((cells) => cells.map((item) => Number(item.getAttribute('data-cell'))).sort((a, b) => a - b))).toEqual(peers(oddOrigin));
      } },
      { spec: 'All three stripe taps remain ephemeral', check: async () => expect(await eventCount()).toBe(1) }
    ]
  });

  await page.getByRole('button', { name: 'Number', exact: true }).click();
  await expect(striped('even')).toHaveCount(20);
  await expect(striped('odd')).toHaveCount(20);
  await page.getByRole('button', { name: 'Stripes', exact: true }).click();
  await page.getByRole('button', { name: 'Clear stripes' }).click();
  await cell(replacementEvenOrigin).press('ArrowLeft');
  await cell(replacementEvenOrigin - 1).press('1');
  await steps.step('stripes-cleared', {
    description: 'The player clears both overlays and resets the alternation',
    verifications: [
      { spec: 'No stripe or source attributes remain on the board', check: async () => {
        await expect(page.locator('[data-stripes]')).toHaveCount(0);
        await expect(page.locator('[data-stripe-source]')).toHaveCount(0);
      } },
      { spec: 'Even stripes are ready for a fresh pair', check: async () => await expect(page.getByText('Even stripes next', { exact: true })).toBeVisible() },
      { spec: 'Arrow and digit keys move focus without drawing or entering a value in Stripes mode', check: async () => {
        await expect(cell(replacementEvenOrigin - 1)).toBeFocused();
        await expect(cell(replacementEvenOrigin - 1)).not.toHaveAccessibleName(/editable, 1/);
      } },
      { spec: 'Clearing and keyboard navigation do not alter the event stream', check: async () => expect(await eventCount()).toBe(1) }
    ]
  });

  steps.generateDocs();
});
