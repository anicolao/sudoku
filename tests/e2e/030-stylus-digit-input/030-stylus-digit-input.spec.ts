import { expect, test, type Locator, type Page } from '@playwright/test';

const GIVENS = '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79';

type Point = { x: number; y: number };

async function drawWithPen(page: Page, cell: Locator, strokes: Point[][]): Promise<void> {
  const box = await cell.boundingBox();
  if (!box) throw new Error('The target Sudoku cell is not visible');

  const board = page.getByTestId('sudoku-board');
  const position = ({ x, y }: Point) => ({
    clientX: box.x + box.width * x,
    clientY: box.y + box.height * y
  });

  for (const [strokeIndex, stroke] of strokes.entries()) {
    const pointerId = 40 + strokeIndex;
    await cell.dispatchEvent('pointerdown', {
      ...position(stroke[0]), pointerId, pointerType: 'pen', buttons: 1, pressure: .5
    });
    for (const point of stroke.slice(1)) {
      await board.dispatchEvent('pointermove', {
        ...position(point), pointerId, pointerType: 'pen', buttons: 1, pressure: .5
      });
    }
    await board.dispatchEvent('pointerup', {
      ...position(stroke.at(-1)!), pointerId, pointerType: 'pen', buttons: 0, pressure: 0
    });
  }
}

test('pen handwriting enters digits and notes without changing touch or mouse input', async ({ page }) => {
  await page.goto(`/?p=${GIVENS}`);
  await page.getByRole('button', { name: 'Start this puzzle' }).click();

  const numberCell = page.locator('[data-cell="8"]');
  const noteCell = page.locator('[data-cell="2"]');
  const untouchedCell = page.locator('[data-cell="3"]');

  const two = [[
    { x: .17, y: .27 }, { x: .28, y: .1 }, { x: .51, y: .05 },
    { x: .76, y: .12 }, { x: .83, y: .29 }, { x: .69, y: .48 },
    { x: .2, y: .89 }, { x: .86, y: .89 }
  ]];
  await drawWithPen(page, numberCell, two);
  await expect(page.getByTestId('stylus-overlay')).toBeVisible();
  await expect(page.locator('.sr-live[role="status"]')).toContainText('Handwritten 2 recognized');
  await expect(numberCell).toHaveAccessibleName(/editable, 2/);

  await page.getByRole('button', { name: 'Notes', exact: true }).click();
  const four = [
    [{ x: .7, y: .07 }, { x: .2, y: .63 }, { x: .88, y: .63 }],
    [{ x: .7, y: .07 }, { x: .69, y: .96 }]
  ];
  await drawWithPen(page, noteCell, four);
  await expect(page.locator('.sr-live[role="status"]')).toContainText('Handwritten 4 recognized');
  await expect(noteCell).toHaveAccessibleName(/empty, notes 4/);

  const box = await untouchedCell.boundingBox();
  if (!box) throw new Error('The untouched Sudoku cell is not visible');
  const mousePoint = { clientX: box.x + box.width * .5, clientY: box.y + box.height * .5 };
  await untouchedCell.dispatchEvent('pointerdown', {
    ...mousePoint, pointerId: 80, pointerType: 'mouse', buttons: 1
  });
  await page.getByTestId('sudoku-board').dispatchEvent('pointermove', {
    clientX: mousePoint.clientX, clientY: box.y + box.height * .9,
    pointerId: 80, pointerType: 'mouse', buttons: 1
  });
  await page.getByTestId('sudoku-board').dispatchEvent('pointerup', {
    clientX: mousePoint.clientX, clientY: box.y + box.height * .9,
    pointerId: 80, pointerType: 'mouse', buttons: 0
  });
  await page.waitForTimeout(400);
  await expect(untouchedCell).toHaveAccessibleName(/editable, empty/);
});
