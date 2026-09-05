import type { SharedPuzzleValidation } from '$lib/sharing/puzzle-link';
import type { PhotoRecognitionResult } from './photo-recognition';

export interface PhotoReviewResult {
  values: PhotoRecognitionResult['values'];
  uncertainCells: number[];
  validation: SharedPuzzleValidation | null;
}

export async function preparePhotoReview(
  recognition: PhotoRecognitionResult,
  validate: (givens: string) => Promise<SharedPuzzleValidation>
): Promise<PhotoReviewResult> {
  const uncertain = new Set(recognition.uncertainCells);
  const confidentValues = recognition.values.map((value, cell) => uncertain.has(cell) ? null : value);
  const givens = confidentValues.map((value) => value ?? '.').join('');

  try {
    return {
      values: confidentValues,
      uncertainCells: [],
      validation: await validate(givens)
    };
  } catch {
    return {
      values: [...recognition.values],
      uncertainCells: [...recognition.uncertainCells],
      validation: null
    };
  }
}
