import { expect, test, type Page } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';

const fixtures = [["xy-chain-destination-fixture", "823....69...29.834..46381.258712649334....2.6..2..3...136..294727...4...4.8....2._14+457+_15+1457+_16+157+_17+57+_21+167+_22+156+_23+15+_26+157+_31+579+_32+59+_38+57+_53+19+_54+5789+_55+578+_56+579+_58+1578+_61+169+_62+169+_64+45789+_65+4578+_67+57+_68+1578+_69+158+_74+58+_75+58+_83+59+_84+359+_85+16+_87+36+_88+158+_89+158+_92+59+_94+379+_95+167+_96+1679+_97+36+_99+15+"], ["simple-colors-visual-fixture", "64983125753167298482754961321.39.74549....8327.32.41963.4.2.56.1...6342.9624.537._43+68+_46+68+_53+56+_54+17+_55+15+_56+67+_62+58+_65+58+_72+58+_74+179+_76+78+_79+189+_82+578+_83+58+_84+79+_89+89+_95+18+_99+18+"]];

async function checkAnchors(page: Page) {
  await expect.poll(() => page.locator('.candidate-arrow').evaluateAll(paths => {
    if (!paths.length) return ['No candidate arrows'];
    const errors: string[] = [];
    for (const element of paths) {
      const path = element as SVGPathElement;
      const [from, to] = path.dataset.hintArrow!.split('-');
      const length = path.getTotalLength();
      for (const [reference, distance] of [[from, 0], [to, length]] as const) {
        const [cell, value] = reference.split(':');
        const candidate = document.querySelector(`[data-cell="${cell}"] [data-note-value="${value}"]`)!;
        const rect = candidate.getBoundingClientRect();
        const point = path.getPointAtLength(distance).matrixTransform(path.getScreenCTM()!);
        if (Math.abs(point.y - (rect.top + rect.bottom) / 2) > .1 ||
          Math.min(Math.abs(point.x - rect.left), Math.abs(point.x - rect.right)) > .1) {
          errors.push(reference);
        }
      }
    }
    return errors;
  })).toEqual([]);
}

test('visual arrows follow candidate boundaries through chains, colors, and resizing', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata('Follow arrows between candidate shapes', 'As a solver, I can follow visual-hint arrows that start and end at the side boundaries of candidate boxes and ellipses, centered vertically, including after resizing the board.');
  for (const [name, payload] of fixtures) {
    await page.goto(`/?p=${encodeURIComponent(payload)}`);
    await page.getByRole('button', { name: /^(Open shared work|Abandon current and open shared puzzle)$/ }).click({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Hint', exact: true }).click({ timeout: 20_000 });
    await page.getByRole('button', { name: /Visual hint/ }).click({ timeout: 20_000 });
    const rule = name.startsWith('xy-') ? 'XY-Chains' : 'Simple Colors';
    await expect(page.getByRole('status', { name: `Visual hint for ${rule}` })).toBeVisible();
    await steps.step(name, {
      description: `${rule} links meet the highlighted shapes at mid-height without crossing their digits`,
      verifications: [{ spec: 'Every candidate-arrow endpoint meets a measured shape boundary, with the marker tip on its endpoint', check: async () => {
        await checkAnchors(page);
        for (const marker of await page.locator('.hint-visual-overlay marker').all()) {
          await expect(marker).toHaveAttribute('refX', '5');
        }
      } }]
    });
    const viewport = page.viewportSize()!;
    await page.setViewportSize({ width: viewport.width - 20, height: viewport.height });
    await checkAnchors(page);
    await page.setViewportSize(viewport);
  }
  steps.generateDocs();
});
