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
  it('uses an independent recognition pass only if its confident board validates', async () => {
    const first = recognition([5, ...Array(80).fill(null)], []);
    const second = recognition([6, ...Array(80).fill(null)], []);
    first.alternatives = [second];
    const accepted = { fingerprint: 'second' } as SharedPuzzleValidation;
    const validate = vi.fn().mockRejectedValueOnce(new Error('not unique')).mockResolvedValueOnce(accepted);
    const review = await preparePhotoReview(first, validate);
    expect(validate.mock.calls.map(call => call[0])).toEqual(['5' + '.'.repeat(80), '6' + '.'.repeat(80)]);
    expect(review.values).toEqual(second.values);
    expect(review.validation).toBe(accepted);
    expect(review.uncertainCells).toEqual([]);
  });

  it('does not consult alternatives after the first pass validates', async () => {
    const first = recognition([5, ...Array(80).fill(null)], []);
    first.alternatives = [recognition([6, ...Array(80).fill(null)], [])];
    const validate = vi.fn().mockResolvedValue({ fingerprint: 'first' });
    expect((await preparePhotoReview(first, validate)).values).toEqual(first.values);
    expect(validate).toHaveBeenCalledTimes(1);
  });

  it('retains the original review when every thresholding pass fails', async () => {
    const first = recognition([5, ...Array(80).fill(null)], [0]);
    first.alternatives = [recognition([6, ...Array(80).fill(null)], [])];
    const validate = vi.fn().mockRejectedValue(new Error('not unique'));
    const review = await preparePhotoReview(first, validate);
    expect(review.values).toEqual(first.values);
    expect(review.uncertainCells).toEqual([0]);
    expect(review.validation).toBeNull();
    expect(validate).toHaveBeenCalledTimes(2);
  });

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
