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
    expect(quad?.topLeft.x).toBeCloseTo(30, 0);
    expect(quad?.topLeft.y).toBeCloseTo(23, 0);
    expect(quad?.bottomRight.x).toBeCloseTo(194, 0);
    expect(quad?.bottomRight.y).toBeCloseTo(187, 0);
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
