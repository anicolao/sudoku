import { describe, expect, test } from 'vitest';
import { recognizeStylusDigit, type StylusStroke } from '../../src/lib/input/stylus-digit-recognizer';

const samples: Record<number, StylusStroke[]> = {
  1: [[{ x: 48, y: 10 }, { x: 47, y: 48 }, { x: 46, y: 91 }]],
  2: [[{ x: 17, y: 27 }, { x: 28, y: 10 }, { x: 51, y: 5 }, { x: 76, y: 12 }, { x: 83, y: 29 }, { x: 69, y: 48 }, { x: 20, y: 89 }, { x: 86, y: 89 }]],
  3: [[{ x: 20, y: 12 }, { x: 51, y: 4 }, { x: 78, y: 17 }, { x: 70, y: 41 }, { x: 51, y: 49 }, { x: 76, y: 58 }, { x: 81, y: 81 }, { x: 58, y: 96 }, { x: 24, y: 89 }]],
  4: [[{ x: 70, y: 7 }, { x: 20, y: 63 }, { x: 88, y: 63 }], [{ x: 70, y: 7 }, { x: 69, y: 96 }]],
  5: [[{ x: 81, y: 7 }, { x: 29, y: 7 }, { x: 23, y: 45 }, { x: 49, y: 40 }, { x: 75, y: 50 }, { x: 82, y: 72 }, { x: 67, y: 92 }, { x: 41, y: 96 }, { x: 18, y: 82 }]],
  6: [[{ x: 74, y: 9 }, { x: 48, y: 5 }, { x: 27, y: 25 }, { x: 18, y: 57 }, { x: 25, y: 84 }, { x: 46, y: 97 }, { x: 70, y: 90 }, { x: 81, y: 69 }, { x: 73, y: 49 }, { x: 53, y: 41 }, { x: 30, y: 50 }, { x: 20, y: 70 }]],
  7: [[{ x: 13, y: 9 }, { x: 87, y: 9 }, { x: 54, y: 95 }]],
  8: [[{ x: 50, y: 49 }, { x: 29, y: 39 }, { x: 24, y: 20 }, { x: 38, y: 5 }, { x: 61, y: 5 }, { x: 75, y: 21 }, { x: 68, y: 40 }, { x: 50, y: 49 }, { x: 29, y: 59 }, { x: 22, y: 79 }, { x: 38, y: 95 }, { x: 63, y: 95 }, { x: 78, y: 77 }, { x: 70, y: 58 }, { x: 50, y: 49 }]],
  9: [[{ x: 75, y: 48 }, { x: 55, y: 57 }, { x: 31, y: 49 }, { x: 21, y: 28 }, { x: 31, y: 9 }, { x: 54, y: 4 }, { x: 73, y: 17 }, { x: 78, y: 40 }, { x: 74, y: 95 }]]
};

describe('stylus digit recognition', () => {
  test.each(Object.entries(samples))('recognizes a handwritten %s', (digit, strokes) => {
    const result = recognizeStylusDigit(strokes);
    expect(result.digit).toBe(Number(digit));
    expect(result.confidence).toBeGreaterThan(.5);
  });

  test('ignores a tap and rejects an unrelated horizontal slash', () => {
    expect(recognizeStylusDigit([[{ x: 1, y: 1 }]]).digit).toBeNull();
    expect(recognizeStylusDigit([[{ x: 4, y: 50 }, { x: 95, y: 51 }]]).digit).toBeNull();
  });
});
