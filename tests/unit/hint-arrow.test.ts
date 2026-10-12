import { describe, expect, it } from 'vitest';
import { candidateArrowPath } from '../../src/lib/rendering/hint-arrow';

const box = (left: number, top: number) => ({ left, right: left + .24, top, bottom: top + .28 });
const points = (path: string) => path.match(/-?\d+(?:\.\d+)?/g)!.map(Number);

describe('candidate arrow anchors', () => {
  it('connects facing sides at mid-height, with horizontal departure and arrival', () => {
    const a = box(1, 2), b = box(5, 6);
    const p = points(candidateArrowPath(a, b));
    expect(p[0]).toBe(a.right);
    expect(p[1]).toBeCloseTo(2.14);
    expect(p[3]).toBe(p[1]);
    expect(p[6]).toBe(b.left);
    expect(p[7]).toBeCloseTo(6.14);
    expect(p[5]).toBe(p[7]);
    const reverse = points(candidateArrowPath(b, a));
    expect(reverse[0]).toBe(b.left);
    expect(reverse[6]).toBe(a.right);
  });
  it('routes vertically aligned candidates around the side, not through the digits', () => {
    for (const x of [0, 8]) {
      const a = box(x, 1), b = box(x, 2);
      const p = points(candidateArrowPath(a, b));
      const edge = x === 0 ? a.right : a.left;
      expect(p[0]).toBe(edge);
      expect(p[6]).toBe(edge);
      expect(x === 0 ? p[2] > edge : p[2] < edge).toBe(true);
      expect(p[4]).toBe(p[2]);
    }
  });
  it('keeps a short same-cell connection between its two shapes', () => {
    const a = box(0, 0), b = box(1 / 3, 0);
    const p = points(candidateArrowPath(a, b));
    for (const x of [p[0], p[2], p[4], p[6]]) {
      expect(x).toBeGreaterThanOrEqual(a.right);
      expect(x).toBeLessThanOrEqual(b.left);
    }
  });
});
