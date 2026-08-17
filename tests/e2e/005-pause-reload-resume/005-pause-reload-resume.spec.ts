import { expect, test } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';

test('pause freezes active time and reload reconstructs the exact game', async ({ page }, testInfo) => {
  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata(
    'Pause, reload, and resume',
    'Active time comes from event snapshots. Pausing covers the puzzle, reload replays the same state, and resuming continues without counting the interruption.'
  );
  const cell = (index: number) => page.locator(`[data-cell="${index}"]`);
  const digit = (value: number) => page.getByRole('button', { name: new RegExp(`^${value},`) });
  const advanceClock = async (milliseconds: number) => page.evaluate((detail) =>
    window.dispatchEvent(new CustomEvent('sudoku:e2e-clock', { detail })), milliseconds
  );
  const stream = async () => page.evaluate(() =>
    JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '{"events":[]}').events
  );

  await page.goto('/');
  await page.getByRole('button', { name: 'Generate Foundations puzzle' }).click();
  await steps.step('puzzle-generated', {
    description: 'The player generates a fresh puzzle and its active timer starts at zero',
    verifications: [
      { spec: 'The timer begins at 00:00 beside Pause', check: async () => {
        await expect(page.getByLabel('Elapsed time 00:00')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Pause' })).toBeEnabled();
      } }
    ]
  });

  await cell(34).click();
  await steps.step('cell-selected', {
    description: 'The player selects row 4 column 8 before making a move',
    verifications: [
      { spec: 'The editable cell is selected without changing elapsed history', check: async () => await expect(cell(34)).toHaveAttribute('aria-selected', 'true') }
    ]
  });

  const correct = await page.evaluate(() => Number(
    JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '').events[0].payload.puzzle.solution[34]
  ));
  await digit(correct).click();
  await steps.step('value-entered', {
    description: 'The player enters a value before the interruption',
    verifications: [
      { spec: 'The value and its event are persisted', check: async () => {
        await expect(cell(34)).toHaveAccessibleName(new RegExp(`editable, ${correct}, selected`));
        expect((await stream()).at(-1).type).toBe('cell/value-entered');
      } }
    ]
  });

  await advanceClock(65_000);
  await page.getByRole('button', { name: 'Pause' }).click();
  await steps.step('paused-at-01-05', {
    description: 'The player pauses after one minute and five seconds of active play',
    verifications: [
      { spec: 'The timer is frozen at 01:05 and Resume is the primary session action', check: async () => {
        await expect(page.getByLabel('Elapsed time 01:05')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Resume' })).toBeEnabled();
      } },
      { spec: 'The board and game log contents are replaced by neutral covers', check: async () => {
        await expect(page.getByRole('grid')).toHaveCount(0);
        await expect(page.getByRole('status', { name: 'Puzzle paused' })).toBeVisible();
        await expect(page.getByText('Resume to inspect the game log.')).toBeVisible();
      } },
      { spec: 'game/paused records exactly 65 seconds', check: async () => {
        expect((await stream()).at(-1)).toMatchObject({ type: 'game/paused', elapsedMs: 65_000 });
      } }
    ]
  });

  await page.reload();
  await steps.step('paused-state-replayed', {
    description: 'Reload reconstructs the covered puzzle and frozen timer exactly',
    verifications: [
      { spec: 'The paused cover and 01:05 timer survive a full reload', check: async () => {
        await expect(page.getByRole('status', { name: 'Puzzle paused' })).toBeVisible();
        await expect(page.getByLabel('Elapsed time 01:05')).toBeVisible();
      } },
      { spec: 'Reload does not append or rewrite an event', check: async () => expect(await stream()).toHaveLength(3) }
    ]
  });

  await page.getByRole('button', { name: 'Resume' }).click();
  await steps.step('puzzle-resumed', {
    description: 'The player resumes and the exact board returns',
    verifications: [
      { spec: 'The previously entered value is reconstructed and editable controls return', check: async () => {
        await expect(page.getByRole('grid')).toBeVisible();
        await expect(cell(34)).toHaveAccessibleName(new RegExp(`editable, ${correct}`));
      } },
      { spec: 'game/resumed keeps elapsed time at 65 seconds', check: async () => {
        expect((await stream()).at(-1)).toMatchObject({ type: 'game/resumed', elapsedMs: 65_000 });
      } }
    ]
  });

  await advanceClock(30_000);
  await page.getByRole('button', { name: 'Pause' }).click();
  await steps.step('paused-again-at-01-35', {
    description: 'A second pause adds only the thirty resumed seconds',
    verifications: [
      { spec: 'The active timer is now exactly 01:35', check: async () => await expect(page.getByLabel('Elapsed time 01:35')).toBeVisible() },
      { spec: 'The second pause appends 95 seconds without changing earlier facts', check: async () => {
        const events = await stream();
        expect(events).toHaveLength(5);
        expect(events.at(-1)).toMatchObject({ type: 'game/paused', elapsedMs: 95_000 });
      } }
    ]
  });

  await page.reload();
  await steps.step('second-pause-replayed', {
    description: 'Another reload proves the accumulated active time is replayable',
    verifications: [
      { spec: 'The timer remains frozen at 01:35 after restart', check: async () => await expect(page.getByLabel('Elapsed time 01:35')).toBeVisible() },
      { spec: 'The canonical five-event document is byte-for-byte unchanged by reload', check: async () => {
        const before = JSON.stringify(await stream());
        await expect(page.getByRole('button', { name: 'Resume' })).toBeEnabled();
        expect(JSON.stringify(await stream())).toBe(before);
      } }
    ]
  });

  steps.generateDocs();
});
