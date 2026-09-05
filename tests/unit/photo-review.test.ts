import { describe, expect, it, vi } from 'vitest';
import type { Digit } from '../../src/lib/domain/types';
import { preparePhotoReview } from '../../src/lib/photo/photo-review';
import type { PhotoRecognitionResult } from '../../src/lib/photo/photo-recognition';
import type { SharedPuzzleValidation } from '../../src/lib/sharing/puzzle-link';

function recognition(values: Array<Digit | null>, uncertainCells: number[]): PhotoRecognitionResult {
  return {
    values,
    uncertainCells,
    confidence: Array(81).fill(100),
    detectedCellCount: values.filter(Boolean).length,
    previewDataUrl: 'data:image/jpeg;base64,preview'
  };
}

describe('photo review preparation', () => {
  it('drops uncertain readings and accepts the clean grid when it validates', async () => {
    const values = Array<Digit | null>(81).fill(null);
    values[0] = 5;
    values[1] = 8;
    const accepted = { fingerprint: 'accepted' } as SharedPuzzleValidation;
    const validate = vi.fn(async () => accepted);

    const review = await preparePhotoReview(recognition(values, [1, 2]), validate);

    expect(validate).toHaveBeenCalledWith(`5${'.'.repeat(80)}`);
    expect(review).toEqual({
      values: [5, ...Array(80).fill(null)],
      uncertainCells: [],
      validation: accepted
    });
  });

  it('shows the original uncertain readings when the clean grid cannot be proved', async () => {
    const values = Array<Digit | null>(81).fill(null);
    values[0] = 5;
    values[1] = 8;
    const validate = vi.fn(async () => { throw new Error('multiple solutions'); });

    const review = await preparePhotoReview(recognition(values, [1]), validate);

    expect(review.values).toEqual(values);
    expect(review.uncertainCells).toEqual([1]);
    expect(review.validation).toBeNull();
  });
});
