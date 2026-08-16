import { expect, test } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';

test('the player generates, validates, and starts an Easy puzzle', async ({ page }, testInfo) => {
  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata(
    'Generate, validate, and start an Easy puzzle',
    'One deliberate action crosses the worker, independent validators, canonical event store, replay, and responsive board.'
  );

  await page.clock.install({ time: new Date('2026-08-16T12:00:00.000Z') });
  await page.goto('/');

  await steps.step('ready-to-generate', {
    description: 'A new player sees one clear local generation action',
    verifications: [
      {
        spec: 'No game exists before the player asks for one',
        check: async () => {
          await expect(page.getByRole('heading', { name: 'A quiet place to solve.' })).toBeVisible();
          expect(await page.evaluate(() => localStorage.getItem('sudoku.event-store.v1'))).toBeNull();
        }
      },
      {
        spec: 'Generate Easy puzzle is enabled and promises local validation',
        check: async () => {
          await expect(page.getByRole('button', { name: 'Generate Easy puzzle' })).toBeEnabled();
          await expect(page.getByRole('list', { name: 'Puzzle promises' })).toContainText('Unique solution');
        }
      }
    ]
  });

  await page.getByRole('button', { name: 'Generate Easy puzzle' }).click();

  await steps.step('validated-puzzle-started', {
    description: 'The generated Easy puzzle is validated, persisted, and ready to play',
    verifications: [
      {
        spec: 'The real board has 81 cells with exactly 40 fixed givens',
        check: async () => {
          const board = page.getByRole('grid', { name: 'Easy Sudoku puzzle' });
          await expect(board).toBeVisible();
          await expect(board.getByRole('gridcell')).toHaveCount(81);
          await expect(board.getByRole('gridcell', { name: /fixed/ })).toHaveCount(40);
        }
      },
      {
        spec: 'The UI reports a unique Easy puzzle and its stable generated identity',
        check: async () => {
          await expect(page.getByText('Unique solution', { exact: true })).toBeVisible();
          await expect(page.getByText(/Generated and validated here · #[0-9a-f]{8}/)).toBeVisible();
        }
      },
      {
        spec: 'Exactly one game/started event commits the complete reproducible puzzle',
        check: async () => {
          const document = await page.evaluate(() =>
            JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? 'null')
          );
          expect(document).toMatchObject({
            storageVersion: 1,
            nextSequence: 2,
            events: [
              {
                id: 'event-1',
                sequence: 1,
                type: 'game/started',
                occurredAt: '2026-08-16T12:00:00.000Z',
                elapsedMs: 0,
                schemaVersion: 1,
                reducerVersion: 1,
                payload: {
                  puzzle: {
                    difficulty: 'easy',
                    seed: 'walkthrough-seed',
                    generatorVersion: 1,
                    validatorVersion: 1
                  }
                }
              }
            ]
          });
          expect(document.events[0].payload.puzzle.givens).toMatch(/^[1-9.]{81}$/);
          expect(document.events[0].payload.puzzle.solution).toMatch(/^[1-9]{81}$/);
        }
      }
    ]
  });

  steps.generateDocs();
});
