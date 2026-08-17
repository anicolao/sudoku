import { expect, test } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';

const GIVENS = '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79';
const SOLUTION = '534678912672195348198342567859761423426853791713924856961537284287419635345286179';

test('a validated puzzle URL becomes an event-sourced local game', async ({ page }, testInfo) => {
  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata(
    'Open a checked puzzle URL',
    'The URL supplies only givens. The app proves uniqueness, derives the solution locally, asks before storing anything, and then starts one imported event stream.'
  );

  await page.clock.install({ time: new Date('2026-08-17T12:00:00.000Z') });
  await page.goto(`/?p=${GIVENS}`);

  await steps.step('shared-puzzle-checked', {
    description: 'The shared givens have been checked and are ready for consent',
    verifications: [
      {
        spec: 'The checked summary reports one unique solution and 30 givens',
        check: async () => {
          await expect(page.getByRole('heading', { name: 'Shared puzzle ready' })).toBeVisible();
          await expect(page.getByText('The puzzle has one unique solution and was checked entirely on this device.')).toBeVisible();
          await expect(page.locator('.incoming-facts')).toContainText('Givens30');
        }
      },
      {
        spec: 'Validation alone writes no event and leaves the puzzle parameter visible',
        check: async () => {
          expect(await page.evaluate(() => localStorage.getItem('sudoku.event-store.v1'))).toBeNull();
          expect(new URL(page.url()).searchParams.get('p')).toBe(GIVENS);
          await expect(page.getByRole('button', { name: 'Start this puzzle' })).toBeEnabled();
        }
      }
    ]
  });

  await page.getByRole('button', { name: 'Start this puzzle' }).click();

  await steps.step('shared-puzzle-started', {
    description: 'Consent starts the exact checked puzzle as a new local event stream',
    verifications: [
      {
        spec: 'The playable board has 81 cells and the exact 30 URL givens',
        check: async () => {
          const board = page.getByRole('grid', { name: /Sudoku puzzle/ });
          await expect(board).toBeVisible();
          await expect(board.getByRole('gridcell')).toHaveCount(81);
          await expect(board.getByRole('gridcell', { name: /fixed/ })).toHaveCount(30);
        }
      },
      {
        spec: 'One game/imported event stores the locally derived solution and explicit provenance',
        check: async () => {
          const document = await page.evaluate(() => JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? 'null'));
          expect(document.events).toHaveLength(1);
          expect(document.events[0]).toMatchObject({
            id: 'event-1',
            sequence: 1,
            type: 'game/imported',
            occurredAt: '2026-08-16T12:00:00.000Z',
            payload: {
              importKind: 'puzzle-link',
              transferId: null,
              checkpoint: null,
              puzzle: {
                givens: GIVENS,
                solution: SOLUTION,
                validatorVersion: 3,
                provenance: { kind: 'puzzle-link', formatVersion: 1 }
              }
            }
          });
          expect(document.events[0].payload.puzzle).not.toHaveProperty('seed');
          expect(document.events[0].payload.puzzle).not.toHaveProperty('generatorVersion');
        }
      },
      {
        spec: 'The consumed puzzle parameter is removed and the game log names the shared origin',
        check: async () => {
          expect(new URL(page.url()).searchParams.has('p')).toBe(false);
          await expect(page.locator('[data-event-type="game/imported"]')).toHaveText(/Opened shared .* puzzle/);
        }
      }
    ]
  });

  steps.generateDocs();
});
