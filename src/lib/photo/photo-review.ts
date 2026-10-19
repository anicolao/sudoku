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
  const checked = new Set<string>();
  for (const candidate of [recognition, ...(recognition.alternatives ?? [])]) {
    const uncertain = new Set(candidate.uncertainCells);
    const confidentValues = candidate.values.map((value, cell) => uncertain.has(cell) ? null : value);
    const givens = confidentValues.map((value) => value ?? '.').join('');
    if (checked.has(givens)) continue;
    checked.add(givens);

    try {
      return {
        values: confidentValues,
        uncertainCells: [],
        validation: await validate(givens)
      };
    } catch { /* Try the independent thresholding pass before asking for corrections. */ }
  }
  return {
    values: [...recognition.values],
    uncertainCells: [...recognition.uncertainCells],
    validation: null
  };
}
