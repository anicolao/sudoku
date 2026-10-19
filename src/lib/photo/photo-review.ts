import type { SharedPuzzleValidation } from '$lib/sharing/puzzle-link';
import type { PhotoRecognitionResult } from './photo-recognition';

export interface PhotoReviewResult {
  values: PhotoRecognitionResult['values'];
  placementCells: number[];
  uncertainCells: number[];
  validation: SharedPuzzleValidation | null;
}

/** Keep the original puzzle and its visible work separate in the shared format. */
export function photoPuzzlePayload(values: PhotoRecognitionResult['values'], placementCells: readonly number[]): string {
  const placements = new Set(placementCells);
  const givens = values.map((value, cell) => placements.has(cell) ? '.' : value ?? '.').join('');
  const work = values.flatMap((value, cell) => value !== null && placements.has(cell)
    ? [`${Math.floor(cell / 9) + 1}${cell % 9 + 1}${value}`] : []);
  return [givens, ...work].join('_');
}

export async function preparePhotoReview(
  recognition: PhotoRecognitionResult,
  validate: (payload: string) => Promise<SharedPuzzleValidation>
): Promise<PhotoReviewResult> {
  const checked = new Set<string>();
  for (const candidate of [recognition, ...(recognition.alternatives ?? [])]) {
    const uncertain = new Set(candidate.uncertainCells);
    const confidentValues = candidate.values.map((value, cell) => uncertain.has(cell) ? null : value);
    const placementCells = (candidate.placementCells ?? []).filter(cell => confidentValues[cell] !== null);
    const payload = photoPuzzlePayload(confidentValues, placementCells);
    if (checked.has(payload)) continue;
    checked.add(payload);

    try {
      return {
        values: confidentValues,
        placementCells,
        uncertainCells: [],
        validation: await validate(payload)
      };
    } catch { /* Try the independent thresholding pass before asking for corrections. */ }
  }
  return {
    values: [...recognition.values],
    placementCells: [...(recognition.placementCells ?? [])],
    uncertainCells: [...recognition.uncertainCells],
    validation: null
  };
}
