import { describe, expect, it } from 'vitest';
import { cageContours, cagePaths } from '../../src/lib/rendering/cage-geometry';

describe('continuous inset cage boundaries', () => {
  it('joins the inside corner of an L instead of stopping at the cell edges', () => {
    expect(cageContours([0, 1, 9])).toEqual([[
      [.08, .08], [1.92, .08], [1.92, .92], [.92, .92], [.92, 1.92], [.08, 1.92]
    ]]);
    expect(cagePaths([0, 1, 9]).corners).toContain('Q 0.92 0.92');
  });

  it('removes internal seams and respects board edges', () => {
    expect(cageContours([7, 8])).toEqual([[[7.08, .08], [8.92, .08], [8.92, .92], [7.08, .92]]]);
    expect(cageContours([8, 9])).toHaveLength(2);
    expect(cageContours([80])).toEqual([[[8.08, 8.08], [8.92, 8.08], [8.92, 8.92], [8.08, 8.92]]]);
  });

  it('preserves the hole of a ring cage with its border inset into occupied cells', () => {
    const contours = cageContours([0, 1, 2, 9, 11, 18, 19, 20]);
    expect(contours).toHaveLength(2);
    expect(contours[1]).toEqual([[2.08, .92], [.92, .92], [.92, 2.08], [2.08, 2.08]]);
  });

  it('traces every boundary exactly once for all shapes in a three-by-three region', () => {
    // Includes concavities, holes, and diagonal contacts. At zero inset the
    // signed area must recover exactly the occupied cells, without lost edges.
    const cells = [0, 1, 2, 9, 10, 11, 18, 19, 20];
    for (let mask = 1; mask < 512; mask++) {
      const occupied = cells.filter((_, i) => mask & (1 << i));
      const contours = cageContours(occupied, 0);
      let area = 0;
      for (const contour of contours) {
        for (let i = 0; i < contour.length; i++) {
          const [x, y] = contour[i], [nx, ny] = contour[(i + 1) % contour.length];
          expect((x === nx) !== (y === ny)).toBe(true);
          area += (x * ny - nx * y) / 2;
        }
      }
      expect(area).toBe(occupied.length);
      expect(cagePaths(occupied).outline).not.toMatch(/NaN|undefined/);
    }
  });
});
