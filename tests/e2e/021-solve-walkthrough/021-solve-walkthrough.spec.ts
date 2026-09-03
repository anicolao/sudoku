import { expect, test } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';

test('History turns a recorded solve into an instructional walkthrough', async ({ page }, testInfo) => {
  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata(
    'Replay each placement with the simplest matching book rule',
    'History analyzes a solve with visible progress, then jumps only between recorded placements. Each move names the first rule in the book order that proves it, or explicitly says Unknown rule.'
  );

  await page.goto('/');
  await page.getByRole('button', { name: 'Generate Foundations puzzle' }).click();
  await expect(page.getByRole('grid')).toBeVisible();
  const finalCells = await page.evaluate(async () => {
    const document = JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '');
    const generated = document.events[0];
    const puzzle = {
      ...generated.payload.puzzle,
      provenance: { kind: 'progress-transfer', formatVersion: 1, fingerprint: 'walkthrough-fixture' }
    };
    const blanks = [...puzzle.givens].flatMap((value, cell) => value === '.' ? [cell] : []);
    const final = blanks.slice(-2);
    const values = Array.from({ length: 81 }, (_, cell) =>
      puzzle.givens[cell] === '.' && !final.includes(cell) ? Number(puzzle.solution[cell]) : null
    );
    const gameId = 'game-walkthrough-fixture';
    const base = {
      gameId,
      schemaVersion: 1,
      reducerVersion: 1
    };
    const events = [
      {
        ...base, id: 'walkthrough-1', sequence: 1, type: 'game/imported',
        payload: {
          gameId,
          importKind: 'progress-transfer',
          transferId: '0123456789abcdef01234567',
          puzzle,
          settings: generated.payload.settings,
          checkpoint: {
            values,
            notes: Array.from({ length: 81 }, () => []),
            hintedCells: [], elapsedMs: 120_000, hints: 0, mistakes: 0, paused: true
          }
        },
        occurredAt: '2026-08-16T12:00:00.000Z', elapsedMs: 120_000
      },
      {
        ...base, id: 'walkthrough-2', sequence: 2, type: 'game/resumed', payload: {},
        occurredAt: '2026-08-16T12:00:01.000Z', elapsedMs: 120_000
      },
      ...final.map((cell, index) => ({
        ...base,
        id: `walkthrough-${index + 3}`,
        sequence: index + 3,
        type: 'cell/value-entered',
        payload: { cell, value: Number(puzzle.solution[cell]) },
        occurredAt: `2026-08-16T12:00:0${index + 2}.000Z`,
        elapsedMs: 121_000 + index * 1_000
      }))
    ];
    await (window as unknown as { __sudokuReplaceEventDocument: (value: unknown) => Promise<unknown> })
      .__sudokuReplaceEventDocument({ storageVersion: 1, nextSequence: 5, events });
    return final;
  });
  await page.reload();
  await page.getByRole('button', { name: 'History', exact: true }).click();

  const eventCount = async (): Promise<number> => page.evaluate(() =>
    JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '{"events":[]}').events.length
  );
  const originalEventCount = await eventCount();
  await steps.step('walkthrough-offered-after-share', {
    description: 'The solved History card offers Walkthrough directly after Share',
    verifications: [
      { spec: 'The solved attempt has the four expected actions in order', check: async () => {
        await expect(page.locator('.history-card .card-actions button')).toHaveText([
          'Review board', 'Start over', 'Share', 'Walkthrough'
        ]);
      } },
      { spec: 'Opening History and the walkthrough affordance append no events', check: async () => expect(await eventCount()).toBe(originalEventCount) }
    ]
  });

  await page.getByRole('button', { name: 'Walkthrough' }).click();
  const analysisProgress = page.getByRole('progressbar', { name: 'Walkthrough analysis progress' });
  await expect(analysisProgress).toBeVisible();
  await expect(analysisProgress).toHaveAttribute('aria-valuemax', '2');
  await steps.step('first-recorded-placement', {
    description: 'After visible analysis, the walkthrough opens directly on the first recorded placement',
    verifications: [
      { spec: 'The instructional screen starts at placement 1 of 2', check: async () => {
        await expect(page.getByRole('heading', { name: 'Learn from this solve' })).toBeVisible();
        await expect(page.getByText('Placement 1 of 2 · 02:01')).toBeVisible();
        await expect(page.locator('.walkthrough-rule')).toHaveText(/^(Full House|Naked Single|Hidden Single)$/);
      } },
      { spec: 'The first entered value is already present and only the final cell remains empty', check: async () => {
        await expect(page.getByRole('gridcell', { name: /editable, empty/ })).toHaveCount(1);
        await expect(page.getByRole('gridcell')).toHaveCount(81);
      } },
      { spec: 'The replay board is read-only and the event stream is unchanged', check: async () => {
        await expect(page.getByRole('gridcell').first()).toBeDisabled();
        expect(await eventCount()).toBe(originalEventCount);
      } }
    ]
  });

  await page.getByRole('button', { name: 'Next placement' }).click();
  await steps.step('final-rule-explained', {
    description: 'The final placement is explained from the pre-move board and highlighted in context',
    verifications: [
      { spec: 'The final move is identified as a provable Full House', check: async () => {
        await expect(page.getByText('Placement 2 of 2 · 02:02')).toBeVisible();
        await expect(page.getByText('Full House', { exact: true })).toBeVisible();
        await expect(page.locator('.walkthrough-explanation')).toContainText('only empty cell');
        await expect(page.locator('.walkthrough-explanation')).toContainText('completed the puzzle');
      } },
      { spec: 'One move cell and the other eight cells in its unit carry distinct highlights', check: async () => {
        await expect(page.locator('.walkthrough-target')).toHaveCount(1);
        await expect(page.locator('.walkthrough-context')).toHaveCount(8);
        await expect(page.locator(`[data-cell="${finalCells[1]}"]`)).toHaveClass(/walkthrough-target/);
      } },
      { spec: 'The completed replay contains no empty editable cells and cannot advance past its last event', check: async () => {
        await expect(page.getByRole('gridcell', { name: /editable, empty/ })).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Next placement' })).toBeDisabled();
      } }
    ]
  });

  await page.getByRole('button', { name: 'Previous placement' }).click();
  await expect(page.getByText('Placement 1 of 2 · 02:01')).toBeVisible();
  await expect(page.getByRole('gridcell', { name: /editable, empty/ })).toHaveCount(1);
  await page.getByRole('button', { name: 'Back to History' }).click();
  await steps.step('immutable-history-returned', {
    description: 'The viewer steps backward and returns to the unchanged solved attempt',
    verifications: [
      { spec: 'History returns to the same solved card', check: async () => {
        await expect(page.locator('.history-state')).toHaveText('Solved');
        await expect(page.getByRole('button', { name: 'Walkthrough' })).toBeVisible();
      } },
      { spec: 'Walking forward and backward created no gameplay events', check: async () => expect(await eventCount()).toBe(originalEventCount) }
    ]
  });

  steps.generateDocs();
});
