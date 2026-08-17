import { expect, test } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';

test('the player chooses a chapter level and starts a rated puzzle', async ({ page }, testInfo) => {
  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata(
    'Choose a chapter level, then generate and start its puzzle',
    'Each chapter choice is visible before a Master puzzle crosses the worker, independent validators, canonical event store, replay, and responsive board.'
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
        spec: 'Generate Foundations puzzle is enabled and promises local validation',
        check: async () => {
          await expect(page.getByRole('button', { name: 'Generate Foundations puzzle' })).toBeEnabled();
          await expect(page.getByRole('list', { name: 'Puzzle promises' })).toContainText('Unique solution');
        }
      }
    ]
  });

  for (const level of [
    { label: 'Intermediate', chapter: 2, summary: 'Pairs and intersections' },
    { label: 'Advanced', chapter: 3, summary: 'Triples, fish, and Y-Wings' },
    { label: 'Expert', chapter: 4, summary: 'Colors, chains, and uniqueness' },
    { label: 'Master', chapter: 5, summary: 'Multi-technique synthesis' }
  ]) {
    await page.getByRole('button', { name: `${level.label} Chapter ${level.chapter}` }).click();
    await steps.step(`${level.chapter}-${level.label.toLowerCase()}-selected`, {
      description: `${level.label} is selected as Chapter ${level.chapter}`,
      verifications: [
        {
          spec: `${level.label} exposes its chapter-matched technique family before generation`,
          check: async () => {
            await expect(page.getByRole('button', { name: `${level.label} Chapter ${level.chapter}` })).toHaveAttribute('aria-pressed', 'true');
            await expect(page.getByText(new RegExp(`${level.label}.*${level.summary}`))).toBeVisible();
            await expect(page.getByRole('button', { name: `Generate ${level.label} puzzle` })).toBeEnabled();
          }
        }
      ]
    });
  }

  await page.getByRole('button', { name: 'Generate Master puzzle' }).click();

  await steps.step('validated-puzzle-started', {
    description: 'The generated Master puzzle is validated, rated, persisted, and ready to play',
    verifications: [
      {
        spec: 'The real board has 81 cells with exactly 23 fixed givens',
        check: async () => {
          const board = page.getByRole('grid', { name: 'Master Sudoku puzzle' });
          await expect(board).toBeVisible();
          await expect(board.getByRole('gridcell')).toHaveCount(81);
          await expect(board.getByRole('gridcell', { name: /fixed/ })).toHaveCount(23);
        }
      },
      {
        spec: 'The UI reports a unique Master puzzle and its stable generated identity',
        check: async () => {
          await expect(page.getByText('Unique solution', { exact: true })).toBeVisible();
          await expect(page.getByText(/Generated and rated here · #[0-9a-f]{8}/)).toBeVisible();
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
                    difficulty: 'master',
                    seed: 'walkthrough-seed',
                    generatorVersion: 2,
                    validatorVersion: 2
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
