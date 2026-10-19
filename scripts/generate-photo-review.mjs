import { readFileSync, writeFileSync } from 'node:fs';
import { photoReviewReport } from './photo-review-report.mjs';

const goldens = JSON.parse(readFileSync(new URL('../examples/goldens.json', import.meta.url), 'utf8'));
for (const golden of goldens) {
  if (!/^[.1-9]{81}$/.test(golden.givens)) throw new Error(`Invalid golden: ${golden.filename}`);
}
writeFileSync(new URL('../examples/review.html', import.meta.url), photoReviewReport(goldens));
console.log(`Generated examples/review.html for ${goldens.length} explicit golden masters. No expectations were updated.`);
