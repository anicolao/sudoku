import { expect, test } from '@playwright/test';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { TestStepHelper } from '../helpers/test-step-helper';

const START_PAYLOAD =
  '.........5....129...43.91....3..475...........216..3....78.36...857....2.........' +
  '_11+1236789+_12+13679+_13+2689+_14+245+_15+245678+_16+25678+_17+458+_18+34678+_19+345678+' +
  '_22+367+_23+68+_24+4+_25+4678+_29+34678+_31+2678+_32+67+_35+25678+_38+678+_39+5678+' +
  '_41+689+_42+69+_44+129+_45+1289+_49+1689+_51+46789+_52+45679+_53+689+_54+1259+' +
  '_55+1235789+_56+2578+_57+489+_58+12468+_59+14689+_61+4789+_65+5789+_66+578+_68+48+' +
  '_69+489+_71+1249+_72+149+_75+12459+_78+14+_79+1459+_81+13469+_85+1469+_86+6+' +
  '_87+49+_88+134+_91+123469+_92+13469+_93+269+_94+12459+_95+124569+_96+256+' +
  '_97+4589+_98+13478+_99+1345789+';

const [GIVENS, ...NOTE_ACTIONS] = START_PAYLOAD.split('_');
const STARTING_NOTES = Array.from({ length: 81 }, () => [] as number[]);
for (const action of NOTE_ACTIONS) {
  const match = action.match(/^([1-9])([1-9])\+([1-9]+)\+$/);
  if (!match) throw new Error(`Invalid candidate fixture action: ${action}`);
  const cell = (Number(match[1]) - 1) * 9 + Number(match[2]) - 1;
  STARTING_NOTES[cell] = [...match[3]].map(Number);
}

const startUrl = () => `/?p=${encodeURIComponent(START_PAYLOAD)}`;

async function renderedNotes(page: import('@playwright/test').Page): Promise<number[][]> {
  return page.locator('.sudoku-cell').evaluateAll((cells) => cells.map((cell) => {
    const match = cell.getAttribute('aria-label')?.match(/(?:^|, )notes ([1-9 ]+)/);
    return match ? match[1].split(' ').map(Number) : [];
  }));
}

async function decodeQrSource(image: import('@playwright/test').Locator): Promise<string> {
  const source = await image.getAttribute('href') ?? '';
  const encoded = source.slice(source.indexOf(',') + 1);
  const qr = PNG.sync.read(Buffer.from(encoded, 'base64'));
  return jsQR(new Uint8ClampedArray(qr.data), qr.width, qr.height)?.data ?? '';
}

test('a candidate-ready book link prints and restarts from its supplied notes', async ({ page }, testInfo) => {
  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata(
    'Print and restart a candidate-ready puzzle',
    'A puzzle authored with a complete starting candidate grid keeps that fresh state separate from later work. It can be printed with candidates and a matching QR, printed as givens only, reloaded, restarted, or opened again from the original link.'
  );

  await page.goto(startUrl());
  await expect(page.getByRole('heading', { name: 'Shared puzzle ready' })).toBeVisible();
  await steps.step('candidate-link-checked', {
    description: 'The candidate-ready link is checked before it changes local history',
    verifications: [{ spec: 'The summary reports every supplied candidate cell and offers the shared work', check: async () => {
      await expect(page.locator('.incoming-facts')).toContainText(`Notes${NOTE_ACTIONS.length}`);
      await expect(page.getByRole('button', { name: 'Open shared work' })).toBeEnabled();
    } }]
  });

  await page.getByRole('button', { name: 'Open shared work' }).click();
  await steps.step('candidate-start-opened', {
    description: 'The fresh puzzle opens with its complete starting candidate grid',
    verifications: [{ spec: 'Every cell exactly matches the candidates authored for it', check: async () => {
      expect(await renderedNotes(page)).toEqual(STARTING_NOTES);
    } }]
  });

  await page.reload();
  await expect(page.getByRole('grid')).toBeVisible();
  expect(await renderedNotes(page)).toEqual(STARTING_NOTES);

  const editable = STARTING_NOTES.flatMap((notes, cell) => notes.length ? [cell] : []);
  const firstCell = editable[0];
  const secondCell = editable[1];
  await page.locator(`[data-cell="${firstCell}"]`).click();
  await page.getByRole('button', { name: 'Notes', exact: true }).click();
  await page.getByRole('button', { name: new RegExp(`^${STARTING_NOTES[firstCell][0]},`) }).click();
  await page.getByRole('button', { name: 'Number', exact: true }).click();
  const solution = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '').events[0].payload.puzzle.solution as string
  );
  await page.locator(`[data-cell="${secondCell}"]`).click();
  await page.getByRole('button', { name: new RegExp(`^${solution[secondCell]},`) }).click();
  expect(await renderedNotes(page)).not.toEqual(STARTING_NOTES);

  await page.getByRole('button', { name: 'Restart' }).click();
  await steps.step('candidate-start-restored', {
    description: 'Restart returns to the authored candidate-ready starting point',
    verifications: [
      { spec: 'The later placement and candidate elimination are removed', check: async () => {
        expect(await renderedNotes(page)).toEqual(STARTING_NOTES);
        await expect(page.locator(`[data-cell="${secondCell}"]`)).toHaveAccessibleName(/editable, empty/);
      } },
      { spec: 'Restart remains one reversible event in the same local attempt', check: async () => {
        const types = await page.evaluate(() =>
          JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '').events.map((event: { type: string }) => event.type)
        );
        expect(types).toEqual(['game/imported', 'cell/note-toggled', 'cell/value-entered', 'game/restarted']);
      } }
    ]
  });

  await page.getByRole('button', { name: 'Share' }).click();
  await steps.step('candidate-print-choices', {
    description: 'Printing clearly separates a fresh candidate copy from a givens-only copy',
    verifications: [{ spec: 'Neither print option claims to print the player’s later work', check: async () => {
      const dialog = page.getByRole('dialog', { name: 'Share this puzzle' });
      await expect(dialog.getByRole('button', { name: /Print with starting candidates/ })).toBeVisible();
      await expect(dialog.getByRole('button', { name: /Print givens only/ })).toBeVisible();
      await expect(dialog).toContainText('Later placements and candidate eliminations are not printed');
    } }]
  });

  await page.evaluate(() => {
    Object.defineProperty(window, 'print', {
      configurable: true,
      value: () => {
        const root = document.documentElement;
        root.dataset.printInvoked = String(Number(root.dataset.printInvoked ?? '0') + 1);
      }
    });
  });
  await page.getByRole('button', { name: /Print with starting candidates/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-print-invoked', '1');
  await expect(page.locator('.print-puzzle-page')).toHaveAttribute('data-print-kind', 'candidates');

  const printedNotes = Array.from({ length: 81 }, () => [] as number[]);
  for (const note of await page.locator('.print-puzzle-page .print-candidate').all()) {
    const cell = Number(await note.getAttribute('data-cell'));
    const candidate = Number(await note.getAttribute('data-candidate'));
    printedNotes[cell].push(candidate);
    const x = Number(await note.getAttribute('x'));
    const y = Number(await note.getAttribute('y'));
    const cellSize = 619.2 / 9;
    expect(x).toBeCloseTo(98.4 + (cell % 9) * cellSize + ((candidate - 1) % 3 + 0.5) * cellSize / 3, 5);
    expect(y).toBeCloseTo(160 + Math.floor(cell / 9) * cellSize + (Math.floor((candidate - 1) / 3) + 0.5) * cellSize / 3, 5);
  }
  expect(printedNotes).toEqual(STARTING_NOTES);

  await page.emulateMedia({ media: 'print' });
  const candidateLink = await decodeQrSource(page.locator('.print-puzzle-page .print-qr'));
  expect(new URL(candidateLink).searchParams.get('p')).toBe(START_PAYLOAD);
  expect(new URL(candidateLink).searchParams.has('view')).toBe(false);

  if (testInfo.project.name === 'desktop') {
    await expect(page.locator('.print-puzzle-page')).toHaveScreenshot('candidate-print-page-desktop-macos.png');
  }
  await page.emulateMedia({ media: 'screen' });

  await page.getByRole('button', { name: 'Share' }).click();
  await page.getByRole('button', { name: /Print givens only/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-print-invoked', '2');
  await expect(page.locator('.print-puzzle-page')).toHaveAttribute('data-print-kind', 'givens');
  await expect(page.locator('.print-puzzle-page .print-candidate')).toHaveCount(0);
  await page.emulateMedia({ media: 'print' });
  const cleanLink = await decodeQrSource(page.locator('.print-puzzle-page .print-qr'));
  expect(new URL(cleanLink).searchParams.get('p')).toBe(GIVENS);
  await page.emulateMedia({ media: 'screen' });

  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await expect(page.locator('.print-puzzle-page')).toHaveAttribute('data-print-kind', 'candidates');

  await page.goto(startUrl());
  await expect(page.getByRole('heading', { name: 'Shared puzzle ready' })).toBeVisible();
  await page.getByRole('button', { name: /Abandon current and open shared puzzle/ }).click();
  await expect(page.getByRole('grid')).toBeVisible();
  expect(await renderedNotes(page)).toEqual(STARTING_NOTES);

  steps.generateDocs();
});
