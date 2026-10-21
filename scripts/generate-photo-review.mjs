import { readFileSync, writeFileSync } from 'node:fs';
import { photoReviewReport } from './photo-review-report.mjs';
import { validateMaster } from './photo-master.mjs';

const goldens = JSON.parse(readFileSync(new URL('../examples/goldens.json', import.meta.url), 'utf8'));
for (const golden of goldens) validateMaster(golden);
const policies = JSON.parse(readFileSync(new URL('../examples/recognition-policy.json', import.meta.url), 'utf8'));
writeFileSync(new URL('../examples/review.html', import.meta.url), photoReviewReport(goldens, [], policies));
console.log(`Generated examples/review.html for ${goldens.length} explicit golden masters. No expectations were updated.`);
