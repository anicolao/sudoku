import { describe, expect, it } from 'vitest';
import { GLYPH_SIZE, glyphDistance } from '../../src/lib/photo/glyph-matching';

describe('within-photo glyph comparison', () => {
  const stroke = (x: number) => Array.from({ length: GLYPH_SIZE ** 2 }, (_, index) =>
    index % GLYPH_SIZE === x && Math.floor(index / GLYPH_SIZE) >= 4 && Math.floor(index / GLYPH_SIZE) < 24 ? 1 : 0);

  it('identical glyphs have zero distance', () => {
    expect(glyphDistance(stroke(12), stroke(12))).toBe(0);
  });

  it('uses symmetric distance and penalizes increasingly displaced strokes', () => {
    const a = stroke(12), b = stroke(13), c = stroke(18);
    expect(glyphDistance(a, b)).toBe(glyphDistance(b, a));
    expect(glyphDistance(a, b)).toBeLessThan(glyphDistance(a, c));
  });

  it('never treats blank glyphs as close matches', () => {
    const blank = Array(GLYPH_SIZE ** 2).fill(0);
    expect(glyphDistance(blank, stroke(12))).toBe(100);
    expect(glyphDistance(blank, blank)).toBe(100);
  });
});
