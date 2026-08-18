import { expect, test } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';

test('an installed game resumes, completes, and reloads offline', async ({ context, page }, testInfo) => {
  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata(
    'Install once, then finish a puzzle offline',
    'After one online installation, the player starts and pauses a real event-sourced puzzle, closes the page, reopens with the network disabled, resumes, solves, reviews History, and reloads. Application caches contain only bundled same-origin GET assets—not puzzle events.'
  );
  const eventDocument = async () => page.evaluate(() => JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? ''));
  await page.goto('/');
  await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
  await page.waitForFunction(() => document.documentElement.dataset.offlineReady === 'true');

  await page.getByRole('button', { name: 'Generate Foundations puzzle' }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('sudoku.event-store.v1'))).not.toBeNull();
  await steps.step('online-puzzle-installed', {
    description: 'Online once, the player generates a validated puzzle and installs the application shell',
    verifications: [
      { spec: 'game/started is persisted before the network is disabled', check: async () => expect((await eventDocument()).events.at(-1).type).toBe('game/started') },
      { spec: 'The service worker reports its precache ready', check: async () => expect(await page.evaluate(() => document.documentElement.dataset.offlineReady)).toBe('true') }
    ]
  });
  const start = (await eventDocument()).events[0];
  const blanks: number[] = [...start.payload.puzzle.givens].flatMap((value: string, cell: number) => value === '.' ? [cell] : []);
  const first = blanks[0];
  const firstValue = Number(start.payload.puzzle.solution[first]);
  await page.locator(`[data-cell="${first}"]`).click();
  await steps.step('online-cell-selected', {
    description: 'The player selects an editable cell while online',
    verifications: [{ spec: 'Selection is visible and still ephemeral', check: async () => await expect(page.locator(`[data-cell="${first}"]`)).toHaveAccessibleName(/editable, empty, selected/) }]
  });
  await page.getByRole('button', { name: new RegExp(`^${firstValue},`) }).click();
  await steps.step('online-value-persisted', {
    description: 'The player commits one value before leaving the network',
    verifications: [{ spec: 'The value and cell/value-entered event are exact', check: async () => {
      await expect(page.locator(`[data-cell="${first}"]`)).toHaveAccessibleName(new RegExp(`editable, ${firstValue}, selected`));
      expect((await eventDocument()).events.at(-1).type).toBe('cell/value-entered');
    } }]
  });

  const finalCells = blanks.slice(-2);
  await page.evaluate(async ({ finalCells, first }) => {
    const document = JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '');
    const start = document.events[0];
    const blanks = [...start.payload.puzzle.givens].flatMap((value, cell) => value === '.' ? [cell] : []);
    for (const cell of blanks) {
      if (cell === first || finalCells.includes(cell)) continue;
      const sequence = document.nextSequence++;
      document.events.push({
        id: `fixture-${sequence}`, sequence, gameId: start.gameId, type: 'cell/value-entered',
        payload: { cell, value: Number(start.payload.puzzle.solution[cell]) },
        occurredAt: new Date(Date.UTC(2026, 7, 16, 12, 0, sequence)).toISOString(), elapsedMs: sequence * 1000,
        schemaVersion: 1, reducerVersion: 1
      });
    }
    await (window as unknown as { __sudokuReplaceEventDocument: (value: unknown) => Promise<unknown> })
      .__sudokuReplaceEventDocument(document);
  }, { finalCells, first });
  await page.reload();
  await page.getByRole('button', { name: 'Pause' }).click();
  await steps.step('online-game-paused', {
    description: 'The player pauses the nearly completed game before closing the page',
    verifications: [{ spec: 'game/paused freezes the exact local board and timer', check: async () => {
      await expect(page.getByRole('status', { name: 'Puzzle paused' })).toBeVisible();
      expect((await eventDocument()).events.at(-1).type).toBe('game/paused');
    } }]
  });

  await page.close();
  await context.setOffline(true);
  page = await context.newPage();
  steps.usePage(page);
  await page.goto('/');
  await steps.step('paused-game-reopened-offline', {
    description: 'With the network disabled, the player reopens the installed app',
    verifications: [
      { spec: 'The cached application reconstructs the paused board from local events', check: async () => await expect(page.getByRole('status', { name: 'Puzzle paused' })).toBeVisible() },
      { spec: 'Local persistence remains ready while offline', check: async () => await expect(page.locator('[data-persistence-status="local"]')).toBeVisible() }
    ]
  });
  await page.getByRole('button', { name: 'Resume' }).click();
  await steps.step('game-resumed-offline', {
    description: 'The player resumes entirely offline',
    verifications: [{ spec: 'game/resumed appends locally and restores the exact two blanks', check: async () => {
      await expect.poll(async () => (await eventDocument()).events.at(-1).type).toBe('game/resumed');
      await expect(page.getByRole('gridcell', { name: /editable, empty/ })).toHaveCount(2);
    } }]
  });
  const penultimate = finalCells[0];
  const penultimateValue = Number(start.payload.puzzle.solution[penultimate]);
  await page.locator(`[data-cell="${penultimate}"]`).click();
  await steps.step('penultimate-cell-selected-offline', {
    description: 'The player selects the penultimate blank offline',
    verifications: [{ spec: 'The exact blank is selected', check: async () => await expect(page.locator(`[data-cell="${penultimate}"]`)).toHaveAccessibleName(/editable, empty, selected/) }]
  });
  await page.getByRole('button', { name: new RegExp(`^${penultimateValue},`) }).click();
  await steps.step('penultimate-value-entered-offline', {
    description: 'The player enters the penultimate solution value offline',
    verifications: [{ spec: 'One blank remains and the event is local', check: async () => {
      await expect(page.getByRole('gridcell', { name: /editable, empty/ })).toHaveCount(1);
      expect((await eventDocument()).events.at(-1).type).toBe('cell/value-entered');
    } }]
  });
  const final = finalCells[1];
  const finalValue = Number(start.payload.puzzle.solution[final]);
  await page.locator(`[data-cell="${final}"]`).click();
  await steps.step('final-cell-selected-offline', {
    description: 'The player selects the final blank offline',
    verifications: [{ spec: 'The final empty cell is selected', check: async () => await expect(page.locator(`[data-cell="${final}"]`)).toHaveAccessibleName(/editable, empty, selected/) }]
  });
  await page.getByRole('button', { name: new RegExp(`^${finalValue},`) }).click();
  await steps.step('puzzle-completed-offline', {
    description: 'The final value derives completion without a completion event or network',
    verifications: [
      { spec: 'The completion panel and solved board are visible', check: async () => {
        await expect(page.getByRole('heading', { name: 'Puzzle complete' })).toHaveCount(2);
        await expect(page.getByRole('gridcell', { name: /empty/ })).toHaveCount(0);
      } },
      { spec: 'No redundant game/completed event exists', check: async () => expect((await eventDocument()).events.some((event: { type: string }) => event.type === 'game/completed')).toBe(false) }
    ]
  });
  await page.getByRole('button', { name: 'View history' }).click();
  await steps.step('completion-history-offline', {
    description: 'The player opens the locally reconstructed solved History',
    verifications: [{ spec: 'The solved card retains its summary offline', check: async () => {
      await expect(page.locator('.history-card')).toContainText('Solved');
      await expect(page.locator('.history-card')).toContainText('Hints0');
    } }]
  });
  await page.reload();
  await steps.step('solved-board-reloaded-offline', {
    description: 'A second offline reload reconstructs the solved board',
    verifications: [
      { spec: 'The solved event projection and completion summary remain available after reload', check: async () => {
        await expect(page.getByRole('heading', { name: 'Puzzle complete' })).toHaveCount(2);
        await expect(page.getByRole('gridcell', { name: /empty/ })).toHaveCount(0);
      } }
    ]
  });
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await steps.step('solved-history-reopened-offline', {
    description: 'The player reopens solved History after the offline reload',
    verifications: [
      { spec: 'The solved history card is reconstructed again', check: async () => await expect(page.locator('.history-card')).toContainText('Solved') },
      { spec: 'Application caches contain only same-origin GET asset requests and no event-store data', check: async () => {
        const cached = await page.evaluate(async () => {
          const names = await caches.keys();
          const requests = (await Promise.all(names.map(async (name) => (await caches.open(name)).keys()))).flat();
          return { names, requests: requests.map((request) => ({ method: request.method, url: request.url })) };
        });
        expect(cached.names.every((name: string) => name.startsWith('sudoku-app-'))).toBe(true);
        expect(cached.requests.every((request: { method: string; url: string }) => request.method === 'GET' && new URL(request.url).origin === 'http://127.0.0.1:4177')).toBe(true);
        expect(cached.requests.some((request: { url: string }) => request.url.includes('event-store'))).toBe(false);
      } }
    ]
  });
  await context.setOffline(false);
  steps.generateDocs();
});
