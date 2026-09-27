import { describe, expect, it } from 'vitest';
import { findGridQuadrilateral, perspectiveCoefficients, projectPoint } from './grid-extraction';

describe('photo grid extraction', () => {
  it('finds the connected Sudoku lattice among unrelated marks', () => {
    const width = 240;
    const height = 220;
    const dark = new Uint8Array(width * height);
    const plot = (x: number, y: number): void => { dark[y * width + x] = 1; };
    for (let line = 0; line <= 9; line += 1) {
      const x = 31 + line * 18;
      const y = 24 + line * 18;
      for (let offset = 0; offset <= 162; offset += 1) {
        plot(x, 24 + offset);
        plot(31 + offset, y);
      }
    }
    for (let x = 4; x < 34; x += 1) plot(x, 205);

    const quad = findGridQuadrilateral(dark, width, height);

    expect(quad).not.toBeNull();
    expect(quad?.topLeft.x).toBeGreaterThanOrEqual(27);
    expect(quad?.topLeft.x).toBeLessThanOrEqual(34);
    expect(quad?.topLeft.y).toBeGreaterThanOrEqual(20);
    expect(quad?.topLeft.y).toBeLessThanOrEqual(27);
    expect(quad?.bottomRight.x).toBeGreaterThanOrEqual(190);
    expect(quad?.bottomRight.x).toBeLessThanOrEqual(197);
    expect(quad?.bottomRight.y).toBeGreaterThanOrEqual(183);
    expect(quad?.bottomRight.y).toBeLessThanOrEqual(190);
  });

  it('recovers the lattice borders when connected page marks extend its top corners', () => {
    const width = 300;
    const height = 280;
    const dark = new Uint8Array(width * height);
    const plot = (x: number, y: number): void => {
      if (x >= 0 && x < width && y >= 0 && y < height) dark[y * width + x] = 1;
    };
    const line = (from: { x: number; y: number }, to: { x: number; y: number }): void => {
      const steps = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y));
      for (let step = 0; step <= steps; step += 1) {
        const x = Math.round(from.x + (to.x - from.x) * step / steps);
        const y = Math.round(from.y + (to.y - from.y) * step / steps);
        for (let offset = -1; offset <= 1; offset += 1) {
          plot(x + offset, y);
          plot(x, y + offset);
        }
      }
    };
    const lerp = (from: { x: number; y: number }, to: { x: number; y: number }, amount: number) => ({
      x: from.x + (to.x - from.x) * amount,
      y: from.y + (to.y - from.y) * amount
    });
    const expected = {
      topLeft: { x: 60, y: 55 },
      topRight: { x: 245, y: 70 },
      bottomRight: { x: 230, y: 245 },
      bottomLeft: { x: 45, y: 230 }
    };
    for (let index = 0; index <= 9; index += 1) {
      const amount = index / 9;
      line(lerp(expected.topLeft, expected.bottomLeft, amount), lerp(expected.topRight, expected.bottomRight, amount));
      line(lerp(expected.topLeft, expected.topRight, amount), lerp(expected.bottomLeft, expected.bottomRight, amount));
    }
    line(expected.topLeft, { x: 18, y: 15 });
    line(expected.topRight, { x: 282, y: 25 });

    const quad = findGridQuadrilateral(dark, width, height);

    expect(quad).not.toBeNull();
    for (const corner of ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'] as const) {
      expect(quad?.[corner].x).toBeCloseTo(expected[corner].x, -1);
      expect(quad?.[corner].y).toBeCloseTo(expected[corner].y, -1);
    }
  });

  it('maps every normalized corner through a perspective transform', () => {
    const quad = {
      topLeft: { x: 22, y: 15 },
      topRight: { x: 190, y: 30 },
      bottomRight: { x: 178, y: 202 },
      bottomLeft: { x: 8, y: 180 }
    };
    const coefficients = perspectiveCoefficients(quad);

    expect(projectPoint(coefficients, 0, 0)).toEqual(quad.topLeft);
    expect(projectPoint(coefficients, 1, 0).x).toBeCloseTo(quad.topRight.x);
    expect(projectPoint(coefficients, 1, 0).y).toBeCloseTo(quad.topRight.y);
    expect(projectPoint(coefficients, 1, 1).x).toBeCloseTo(quad.bottomRight.x);
    expect(projectPoint(coefficients, 1, 1).y).toBeCloseTo(quad.bottomRight.y);
    expect(projectPoint(coefficients, 0, 1).x).toBeCloseTo(quad.bottomLeft.x);
    expect(projectPoint(coefficients, 0, 1).y).toBeCloseTo(quad.bottomLeft.y);
  });
});
