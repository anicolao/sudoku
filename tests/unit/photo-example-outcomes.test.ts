import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { photoExamplePassed, photoReviewReport } from '../../scripts/photo-review-report.mjs';
import { countSolutions } from '../../src/lib/generator/solve';

const golden = { filename: 'example.jpeg', givens: '1' + '.'.repeat(80) };
const reviewGolden = { ...golden, requiresReview: true };
const reviewed = { filename: golden.filename, values: golden.givens, ready: false, started: false, reviewRequired: true };

describe('photo corpus expected outcomes', () => {
  it('requires an exact board and verified review-only state for ambiguous puzzles', () => {
    expect(photoExamplePassed(reviewGolden, reviewed)).toBe(true);
    expect(photoExamplePassed(reviewGolden, { ...reviewed, values: '.'.repeat(81) })).toBe(false);
    expect(photoExamplePassed(reviewGolden, { ...reviewed, reviewRequired: false })).toBe(false);
    expect(photoExamplePassed(reviewGolden, { ...reviewed, ready: true })).toBe(false);
    expect(photoExamplePassed(reviewGolden, { ...reviewed, started: true })).toBe(false);
    expect(photoExamplePassed(reviewGolden, { ...reviewed, error: 'wrong validation error' })).toBe(false);
    expect(photoExamplePassed(reviewGolden, undefined)).toBe(false);
  });

  it('still requires successful puzzle start for ordinary examples', () => {
    expect(photoExamplePassed(golden, reviewed)).toBe(false);
    expect(photoExamplePassed(golden, { ...reviewed, ready: true, started: true })).toBe(true);
    expect(photoExamplePassed(golden, { ...reviewed, ready: true })).toBe(false);
  });

  it('reports review-required success without calling it a successful import', () => {
    const html = photoReviewReport([reviewGolden], [reviewed]);
    expect(html).toContain('data-status="pass"');
    expect(html).toContain('1/1 exact recognition and expected outcome checks passed');
    expect(html).toContain('Review required; non-unique puzzle cannot start');
    expect(html).not.toContain('successfully started as a playable puzzle');
    expect(photoReviewReport([reviewGolden], [{ ...reviewed, values: '.'.repeat(81) }])).toContain('data-status="fail"');
  });

  it('marks only the confirmed non-unique transcription as review-required', () => {
    const goldens = JSON.parse(readFileSync('examples/goldens.json', 'utf8')) as Array<typeof reviewGolden>;
    const ambiguous = goldens.filter(example => example.requiresReview);
    expect(ambiguous.map(example => example.filename)).toEqual(['21forward.webp']);
    expect(countSolutions(ambiguous[0].givens)).toBe(2);
  });
});
