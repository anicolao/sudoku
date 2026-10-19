import { expect, test } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';

test.describe.configure({ mode: 'serial', timeout: 180_000 });
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'Photo recognition is viewport-independent and expensive to run concurrently.');
});

const GIVENS = '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79';

for (const dark of [false, true]) {
  test(`preserves colored progress and inverted selected cells on a ${dark ? 'dark' : 'light'} board`, async ({page}) => {
    await page.goto('/');
    const photo = await page.evaluate(({givens,dark}) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1000;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = dark ? '#111' : '#fff';
      ctx.fillRect(0,0,1000,1000);
      // White-on-blue selection on a light board has opposite local polarity.
      if (!dark) {ctx.fillStyle='#245bc2';ctx.fillRect(250,50,100,100);}
      ctx.strokeStyle = dark ? '#bbb' : '#222';
      for(let i=0;i<=9;i++) {
        ctx.lineWidth=i%3===0?6:2;
        ctx.beginPath();ctx.moveTo(50+i*100,50);ctx.lineTo(50+i*100,950);ctx.stroke();
        ctx.beginPath();ctx.moveTo(50,50+i*100);ctx.lineTo(950,50+i*100);ctx.stroke();
      }
      ctx.font='bold 62px Arial';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillStyle=dark?'#bbb':'#222';
      [...givens].forEach((v,c)=>{if(v!=='.')ctx.fillText(v,100+c%9*100,102+Math.floor(c/9)*100);});
      for (const [cell,value] of [[2,4],[3,6],[5,8]]) {
        ctx.fillStyle = !dark && cell===2 ? '#fff' : '#2862ff';
        ctx.fillText(String(value),100+cell*100,102);
      }
      return canvas.toDataURL().split(',')[1];
    },{givens:GIVENS,dark});
    await page.getByRole('button',{name:'Puzzles',exact:true}).click();
    await page.getByRole('button',{name:'Import from photo'}).click();
    await page.getByLabel('Choose Sudoku photo').setInputFiles({name:'contrast.png',mimeType:'image/png',buffer:Buffer.from(photo,'base64')});
    await expect(page.getByRole('heading',{name:'Puzzle ready',exact:true})).toBeVisible({timeout:150000});
    const expected=[...GIVENS];expected[2]='4';expected[3]='6';expected[5]='8';
    expect((await page.locator('[data-photo-cell]').allTextContents()).map(v=>v||'.').join('')).toBe(expected.join(''));
    // Selection can hide a digit's role; do not invent ground truth for it.
    for(const cell of dark?[2,3,5]:[3,5]) await expect(page.locator(`[data-photo-cell="${cell}"]`)).toHaveAttribute('data-photo-role','placement');
  });
}
const REAL_PHOTOS = [
  {
    name: 'textured book page with dark handwriting',
    path: 'tests/e2e/024-camera-puzzle-import/fixtures/skewed-textured-worked-puzzle.jpg',
    givens: '.83.1.4.......42.52...7..9.7....8.5...........5.7....6.3..6...45.28.......4.5.18.'
  },
  {
    name: 'skewed book page with pencil work and notes',
    path: 'tests/e2e/024-camera-puzzle-import/fixtures/skewed-pencil-worked-puzzle.jpg',
    givens: '.2....1....5.9.2..6....1.3.....52...5..3..........9.48..8.7.....7...435....6....4'
  },
  {
    name: 'completed digital puzzle with coloured placements',
    path: 'tests/e2e/024-camera-puzzle-import/fixtures/completed-digital-puzzle.jpg',
    givens: '.7..82...6......1.............1.5..6.8....3.....4.........7.2..1..6.....4.5......'
  },
  {
    name: 'paper puzzle with red placements and candidates',
    path: 'tests/e2e/024-camera-puzzle-import/fixtures/red-ink-worked-puzzle.webp',
    givens: '93...45..7.....3....6..9.1.1...87......6.3......92...8.9.3..8....1.....3..35...46'
  }
] as const;

for (const photo of REAL_PHOTOS) {
  test(`keeps printed givens in ${photo.name}`, async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Puzzles' }).click();
    await page.getByRole('button', { name: 'Import from photo' }).click();
    await page.getByLabel('Choose Sudoku photo').setInputFiles(photo.path);

    await expect(page.getByRole('heading', { name: 'Puzzle ready' })).toBeVisible({ timeout: 150_000 });
    const recognized = await page.locator('[data-photo-cell]').evaluateAll(cells => cells.map(cell =>
      cell.getAttribute('data-photo-role') === 'placement' ? '.' : cell.textContent || '.').join(''));
    expect(recognized).toBe(photo.givens);
    await expect(page.getByText(new RegExp(`${[...photo.givens].filter((value) => value !== '.').length} givens ·`))).toBeVisible();
    await expect(page.getByText(/needs? a closer look/)).toHaveCount(0);
    await expect(page.getByText(/One unique solution/)).toBeVisible();
  });
}

test('a photographed grid preserves givens and player placements through review and import', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata(
    'Import a printed Sudoku with the camera',
    'A player can photograph a grid, recognize original givens and distinct full-size player placements on-device, correct digits and roles, validate the original puzzle, and resume with that progress.'
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Puzzles' }).click();

  await steps.step('photo-import-offered', {
    description: 'The puzzle library offers private photo import beside generation',
    verifications: [{ spec: 'The photo option explains that the image is not sent anywhere', check: async () => {
      await expect(page.getByRole('heading', { name: 'Have a puzzle in front of you?' })).toBeVisible();
      await expect(page.getByText('without sending the image anywhere')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Import from photo' })).toBeEnabled();
    } }]
  });

  await page.getByRole('button', { name: 'Import from photo' }).click();
  const photo = await page.evaluate(async (givens) => {
    await document.fonts.ready;
    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 1000;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#fff';
    context.fillRect(0, 0, 1000, 1000);
    context.translate(500, 500);
    context.rotate(0.045);
    context.translate(-500, -500);
    context.strokeStyle = '#111';
    for (let line = 0; line <= 9; line += 1) {
      context.lineWidth = line % 3 === 0 ? 7 : 2;
      const position = 50 + line * 100;
      context.beginPath();
      context.moveTo(50, position);
      context.lineTo(950, position);
      context.stroke();
      context.beginPath();
      context.moveTo(position, 50);
      context.lineTo(position, 950);
      context.stroke();
    }
    context.fillStyle = '#111';
    context.font = '700 62px "Atkinson Hyperlegible"';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    [...givens].forEach((given, cell) => {
      if (given === '.') return;
      context.fillText(given, 100 + (cell % 9) * 100, 102 + Math.floor(cell / 9) * 100);
    });
    context.fillStyle = '#245bc2';
    for (const [cell, value] of [[2,4],[3,6],[5,8]]) {
      context.fillText(String(value), 100 + (cell % 9) * 100, 102 + Math.floor(cell / 9) * 100);
    }
    return canvas.toDataURL('image/png').split(',')[1];
  }, GIVENS);
  await page.getByLabel('Choose Sudoku photo').setInputFiles({
    name: 'printed-sudoku.png',
    mimeType: 'image/png',
    buffer: Buffer.from(photo, 'base64')
  });

  await expect(page.getByRole('progressbar', { name: 'Photo recognition progress' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Puzzle ready' })).toBeVisible({ timeout: 120_000 });
  await steps.step('recognized-givens-reviewed', {
    description: 'The confident givens are checked and presented for acceptance',
    verifications: [
      { spec: 'Every printed clue and player placement lands in its own layer; blank cells stay empty', check: async () => {
        const recognized = await page.locator('[data-photo-cell]').allTextContents();
        const expected = [...GIVENS];
        expected[2] = '4'; expected[3] = '6'; expected[5] = '8';
        expect(recognized.map((value) => value || '.').join('')).toBe(expected.join(''));
        expect(await page.locator('[data-photo-role="placement"]').evaluateAll(cells=>cells.map(cell=>Number(cell.getAttribute('data-photo-cell'))))).toEqual([2,3,5]);
      } },
      { spec: 'The clean review is already proven and remains unsaved', check: async () => {
        await expect(page.getByText('30 givens · 3 placements', { exact: true })).toBeVisible();
        await expect(page.getByText(/needs? a closer look/)).toHaveCount(0);
        await expect(page.getByText(/One unique solution/)).toBeVisible();
        expect(await page.evaluate(() => localStorage.getItem('sudoku.event-store.v1'))).toBeNull();
      } }
    ]
  });

  await page.locator('[data-photo-cell="0"]').click();
  await page.getByRole('button', { name: '6', exact: true }).click();
  await page.getByRole('button', { name: 'Check puzzle' }).click();
  await expect(page.getByRole('alert')).toContainText('duplicate');
  await page.getByRole('button', { name: '5', exact: true }).click();
  await page.locator('[data-photo-cell="2"]').click();
  await page.getByLabel('Selected digit type').selectOption('given');
  await expect(page.getByText('31 givens · 2 placements', {exact:true})).toBeVisible();
  await page.getByLabel('Selected digit type').selectOption('placement');
  await page.getByRole('button', { name: 'Check puzzle' }).click();
  await steps.step('photo-puzzle-validated', {
    description: 'The corrected grid is proven before import',
    verifications: [{ spec: 'The review confirms one unique solution and its logical rating', check: async () => {
      await expect(page.getByRole('heading', { name: 'Puzzle ready' })).toBeVisible();
      await expect(page.getByText(/One unique solution/)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Start photographed puzzle' })).toBeEnabled();
    } }]
  });

  await page.getByRole('button', { name: 'Start photographed puzzle' }).click();
  await expect(page.getByRole('grid', { name: /Sudoku puzzle/ })).toBeVisible();
  await steps.step('photo-puzzle-started', {
    description: 'The photographed puzzle starts as a private local attempt',
    verifications: [
      { spec: 'The playable board preserves the photographed givens', check: async () => {
        const board = page.getByRole('grid', { name: /Sudoku puzzle/ });
        await expect(board).toBeVisible();
        await expect(board.getByRole('gridcell', { name: /fixed/ })).toHaveCount(30);
      } },
      { spec: 'One camera-photo origin records the validated puzzle but never the image', check: async () => {
        const events = await page.evaluate(() => JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '').events);
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
          type: 'game/imported',
          payload: {
            importKind: 'camera-photo',
            puzzle: { givens: GIVENS, provenance: { kind: 'camera-photo', recognizerVersion: 1 } },
            work: [{type:'value',cell:2,value:4},{type:'value',cell:3,value:6},{type:'value',cell:5,value:8}]
          }
        });
        expect(JSON.stringify(events)).not.toContain('data:image');
      } }
    ]
  });

  steps.generateDocs();
});
