/** @param {unknown} value */
const escape = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

/**
 * @typedef {{filename: string, givens: string, description?: string, requiresReview?: boolean}} PhotoGolden
 * @typedef {{filename: string, source?: string, values?: string, preview?: string, ready?: boolean, started?: boolean, reviewRequired?: boolean, error?: string}} PhotoResult
 */

/** @param {PhotoGolden} example @param {PhotoResult | undefined} result */
export function photoExamplePassed(example, result) {
  if (!result || result.error || result.values !== example.givens) return false;
  return example.requiresReview
    ? result.reviewRequired === true && result.ready === false && !result.started
    : result.ready === true && result.started === true;
}

/** @param {string} givens @param {string} comparison */
export function boardSvg(givens, comparison = givens) {
  let content = '<rect width="470" height="470" fill="white"/>';
  for (let i = 0; i < 9; i++) {
    content += `<text x="${45 + i * 48}" y="15" text-anchor="middle" font-size="12">${i + 1}</text><text x="10" y="${50 + i * 48}" text-anchor="middle" font-size="12">${i + 1}</text>`;
  }
  [...givens].forEach((digit, cell) => {
    const x = 21 + cell % 9 * 48, y = 24 + Math.floor(cell / 9) * 48;
    if (digit !== comparison[cell]) content += `<rect x="${x}" y="${y}" width="48" height="48" fill="#ffdad5"/>`;
    if (digit !== '.') content += `<text x="${x + 24}" y="${y + 34}" text-anchor="middle" font-size="30">${escape(digit)}</text>`;
  });
  for (let i = 0; i <= 9; i++) content += `<path d="M${21 + i * 48} 24v432 M21 ${24 + i * 48}h432" stroke="#222" stroke-width="${i % 3 ? 1 : 3}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 470 470" role="img" aria-label="Sudoku grid" font-family="Arial,sans-serif">${content}</svg>`;
}

/** Both the committed review page and portable CI artifact use this renderer.
 * @param {PhotoGolden[]} examples
 * @param {PhotoResult[]} results
 */
export function photoReviewReport(examples, results = []) {
  const resultByFile = new Map(results.map((result) => [result.filename, result]));
  const articles = examples.map((example) => {
    const result = resultByFile.get(example.filename);
    const pass = photoExamplePassed(example, result);
    const image = result?.source ?? example.filename;
    const values = result?.values ?? '';
    const differences = values.length === 81 ? [...example.givens].flatMap((digit, cell) => digit === values[cell] ? [] : [`r${Math.floor(cell / 9) + 1}c${cell % 9 + 1}: expected ${digit}, got ${values[cell]}`]) : [];
    return `<article id="${escape(example.filename)}" data-status="${result ? pass ? 'pass' : 'fail' : 'golden'}">
      <h2>${escape(example.filename)}${result ? ` — ${pass ? 'PASS' : 'FAIL'}` : ''}</h2>
      <p>${escape(example.description ?? '')}</p>
      <p>Expected outcome: ${example.requiresReview ? 'exact recognition; review required; puzzle start blocked' : 'exact recognition and successful puzzle start'}.</p>
      <div class="comparison"><figure><a href="${escape(image)}"><img loading="lazy" src="${escape(image)}" alt="Original ${escape(example.filename)}"></a><figcaption>Original photo (open for full resolution)</figcaption></figure>
      <figure>${boardSvg(example.givens)}<figcaption>Golden master · ${[...example.givens].filter(v => v !== '.').length} givens</figcaption></figure>
      ${result?.preview ? `<figure><img loading="lazy" src="${escape(result.preview)}" alt="Straightened grid"><figcaption>Actual straightened grid</figcaption></figure>` : ''}
      ${result?.values?.length === 81 ? `<figure>${boardSvg(result.values, example.givens)}<figcaption>Actual recognized board · differences shaded red</figcaption></figure>` : ''}</div>
      ${result ? `<p>${escape(result.error ?? (result.reviewRequired ? 'Review required; non-unique puzzle cannot start' : result.ready ? 'Puzzle ready' : 'Recognition needs correction'))}${result.started ? '; successfully started as a playable puzzle.' : ''}</p>` : ''}
      ${differences.length ? `<details open><summary>${differences.length} differing cells</summary><p>${differences.map(escape).join('; ')}</p></details>` : ''}
      <details><summary>Golden puzzle text and playable link</summary><pre>${(example.givens.match(/.{9}/g) ?? []).join('\n')}</pre><a href="https://sudoku.annasdadpress.com/?p=${encodeURIComponent(example.givens)}">Open golden puzzle</a></details>
    </article>`;
  }).join('\n');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Photo import regression review</title>
  <style>body{font:16px system-ui,sans-serif;color:#20242b;background:#f5f4f0;margin:0;padding:24px}h1{margin-top:0}article{background:white;border:1px solid #ccc;border-radius:10px;padding:20px;margin:24px 0}article[data-status=fail]{border:3px solid #b42318}article[data-status=pass]{border-left:6px solid #22843e}.comparison{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px;align-items:start}figure{margin:0;min-width:0}img,svg{display:block;width:100%;height:auto;max-height:650px;object-fit:contain}figcaption{margin-top:8px;font-weight:600}summary{cursor:pointer;margin:14px 0}pre{font:18px/1.5 monospace}a{color:#304c96}nav{display:flex;flex-wrap:wrap;gap:12px}label{display:block;margin:20px 0}</style>
  <h1>Photo import regression review</h1><p>${examples.length} examples. Compare each source with its explicit golden master. Notes and visibly distinct work are excluded where possible; indistinguishable full-size entries may remain. Recognition never fills blank cells from the solution.</p>
  ${results.length ? `<p>${examples.filter(example => photoExamplePassed(example, resultByFile.get(example.filename))).length}/${examples.length} exact recognition and expected outcome checks passed.</p><label><input id="failures" type="checkbox"> Show failures only</label>` : '<p>Golden masters are reviewable expectations; running the suite produces an additional report with actual boards and straightened images.</p>'}
  <nav>${examples.map(e => `<a href="#${escape(e.filename)}">${escape(e.filename)}</a>`).join('')}</nav>${articles}
  <script>document.querySelector('#failures')?.addEventListener('change',e=>document.querySelectorAll('article').forEach(a=>a.hidden=e.target.checked&&a.dataset.status!=='fail'));</script></html>\n`;
}
