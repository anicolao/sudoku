import { EMPTY_BOARD, coordinates, masterDifferences, masterPayload } from './photo-master.mjs';

/** @param {unknown} value */
const escape = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

/**
 * @typedef {import('./photo-master.mjs').PhotoMaster} PhotoGolden
 * @typedef {import('./photo-master.mjs').PhotoPolicy} PhotoPolicy
 * @typedef {{filename: string, source?: string, values?: string, givens?:string, placements?:string, notes?:Record<string,string>, preview?: string, ready?: boolean, started?: boolean, reviewRequired?: boolean, error?: string, skipped?:string}} PhotoResult
 * @typedef {{default: PhotoPolicy, overrides: Record<string, PhotoPolicy>, skips?:Record<string,string>}} PhotoPolicies
 */

/** @param {PhotoGolden} example @param {PhotoResult | undefined} result @param {PhotoPolicy} policy */
export function photoExamplePassed(example, result, policy) {
  if (!result || result.skipped || result.error || masterDifferences(example, result, policy).length) return false;
  return policy.outcome === 'review'
    ? result.reviewRequired === true && result.ready === false && !result.started
    : result.ready === true && result.started === true;
}

/** @param {string} givens @param {string} comparison */
export function boardSvg(givens, comparison = givens, placements = EMPTY_BOARD, notes = /** @type {Record<string,string>} */ ({}), unclassified = EMPTY_BOARD, ambiguities = /** @type {Record<string,string>} */ ({})) {
  let content = '<rect width="470" height="470" fill="white"/>';
  for (let i = 0; i < 9; i++) {
    content += `<text x="${45 + i * 48}" y="15" text-anchor="middle" font-size="12">${i + 1}</text><text x="10" y="${50 + i * 48}" text-anchor="middle" font-size="12">${i + 1}</text>`;
  }
  [...givens].forEach((digit, cell) => {
    const x = 21 + cell % 9 * 48, y = 24 + Math.floor(cell / 9) * 48;
    if (digit !== comparison[cell]) content += `<rect x="${x}" y="${y}" width="48" height="48" fill="#ffdad5"/>`;
    if (digit !== '.') content += `<text x="${x + 24}" y="${y + 34}" text-anchor="middle" font-size="30" font-weight="700">${escape(digit)}</text>`;
    else if (placements[cell] !== '.') content += `<text x="${x + 24}" y="${y + 34}" text-anchor="middle" font-size="30" fill="#245bc2">${escape(placements[cell])}</text>`;
    else if (unclassified[cell] !== '.') content += `<text x="${x + 24}" y="${y + 34}" text-anchor="middle" font-size="30" fill="#a66300">${escape(unclassified[cell])}</text>`;
    for (const note of notes[coordinates(cell)] ?? '') {
      const index = Number(note) - 1;
      content += `<text x="${x + 8 + index % 3 * 16}" y="${y + 12 + Math.floor(index / 3) * 16}" text-anchor="middle" font-size="11" fill="#59646e">${note}</text>`;
    }
    if (ambiguities[`notes:${coordinates(cell)}`]) content += `<rect x="${x+1}" y="${y+1}" width="46" height="46" fill="#ffc457" opacity=".18"/><text x="${x+44}" y="${y+44}" text-anchor="end" font-size="12" fill="#8a4c00">?</text>`;
  });
  for (let i = 0; i <= 9; i++) content += `<path d="M${21 + i * 48} 24v432 M21 ${24 + i * 48}h432" stroke="#222" stroke-width="${i % 3 ? 1 : 3}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 470 470" role="img" aria-label="Sudoku grid" font-family="Arial,sans-serif">${content}</svg>`;
}

/** Both the committed review page and portable CI artifact use this renderer.
 * @param {PhotoGolden[]} examples
 * @param {PhotoResult[]} results
 * @param {PhotoPolicies} policies
 */
export function photoReviewReport(examples, results = [], policies = {default: {layers:['givens','placements'],outcome:'start'},overrides:{}}) {
  const resultByFile = new Map(results.map((result) => [result.filename, result]));
  const skippedCount = examples.filter(example => policies.skips?.[example.filename]).length;
  const articles = examples.map((example) => {
    const result = resultByFile.get(example.filename);
    const policy = policies.overrides[example.filename] ?? policies.default;
    const skipReason = policies.skips?.[example.filename];
    const pass = photoExamplePassed(example, result, policy);
    const image = result?.source ?? example.filename;
    const differences = !skipReason && (result || example.status !== 'transcribed') ? masterDifferences(example, result ?? {}, policy) : [];
    const payload = masterPayload(example);
    const allData = masterPayload(example, true);
    const givenComparison = [...(example.givens ?? EMPTY_BOARD)].map((digit,cell) =>
      policy.unclassifiedRoles === 'either' && example.unclassified?.[cell] && example.unclassified[cell] !== '.'
        ? (result?.givens?.[cell] && result.givens[cell] !== '.' ? example.unclassified[cell] : '.') : digit).join('');
    return `<article id="${escape(example.filename)}" data-status="${skipReason ? 'skip' : result ? pass ? 'pass' : 'fail' : 'golden'}">
      <h2>${escape(example.filename)}${skipReason ? ' — SKIP' : result ? ` — ${pass ? 'PASS' : 'FAIL'}` : ''}</h2>
      ${skipReason ? `<p>Recognition skipped: ${escape(skipReason)} Source transcription retained; this is not a passing recognition result.</p>` : ''}
      <p>${escape(example.description ?? '')}</p>
      <p>Source: ${escape(example.status)}. Validating: ${policy.layers.join(', ')}${policy.unclassifiedRoles === 'either' ? '; unclassified digits must match exactly, in either full-size layer' : ''}. Expected outcome: ${policy.outcome === 'review' ? 'exact recognition; review required; puzzle start blocked' : 'exact recognition and successful puzzle start'}.</p>
      <div class="comparison"><figure><a href="${escape(image)}"><img loading="lazy" src="${escape(image)}" alt="Original ${escape(example.filename)}"></a><figcaption>Original photo (open for full resolution)</figcaption></figure>
      <figure>${example.givens !== null && example.placements !== null && example.notes !== null ? boardSvg(example.givens, example.givens, example.placements, example.notes, example.unclassified, example.ambiguities) : '<p>Not yet transcribed. No accepted master.</p>'}<figcaption>Source transcription · bold black givens · blue placements · small grey notes · amber digits of unknown role · ? unresolved notes</figcaption></figure>
      ${result?.preview ? `<figure><img loading="lazy" src="${escape(result.preview)}" alt="Straightened grid"><figcaption>Actual straightened grid</figcaption></figure>` : ''}
      ${result?.givens?.length === 81 ? `<figure>${boardSvg(result.givens, givenComparison, result.placements ?? EMPTY_BOARD, result.notes)}<figcaption>Actual recognized layers · given differences shaded red; all layer differences listed below</figcaption></figure>` : ''}</div>
      ${result && !skipReason ? `<p>${escape(result.error ?? (result.reviewRequired ? 'Review required; non-unique puzzle cannot start' : result.ready ? 'Puzzle ready' : 'Recognition needs correction'))}${result.started ? '; successfully started as a playable puzzle.' : ''}</p>` : ''}
      ${differences.length ? `<details open><summary>${differences.length} differing cells</summary><p>${differences.map(escape).join('; ')}</p></details>` : ''}
      ${Object.keys(example.ambiguities ?? {}).length ? `<p>Unresolved source details: ${escape(JSON.stringify(example.ambiguities))}</p>` : ''}
      ${payload ? `<p><a href="https://sudoku.annasdadpress.com/?p=${encodeURIComponent(payload)}">Open givens with player placements</a>${allData ? ` · <a href="https://sudoku.annasdadpress.com/?p=${encodeURIComponent(allData)}">Open with notes too</a>` : ' · Notes link withheld: candidate transcription is ambiguous.'}</p>` : '<p>No authoritative original-puzzle link: given/placement roles cannot be recovered from this image.</p>'}
      <details><summary>Layered source data</summary><pre>${escape(JSON.stringify({givens:example.givens,placements:example.placements,notes:example.notes,unclassified:example.unclassified,ambiguities:example.ambiguities},null,2))}</pre></details>
    </article>`.replace(/^[ \t]+$/gm, '');
  }).join('\n');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Photo import regression review</title>
  <style>body{font:16px system-ui,sans-serif;color:#20242b;background:#f5f4f0;margin:0;padding:24px}h1{margin-top:0}article{background:white;border:1px solid #ccc;border-radius:10px;padding:20px;margin:24px 0}article[data-status=fail]{border:3px solid #b42318}article[data-status=pass]{border-left:6px solid #22843e}.comparison{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px;align-items:start}figure{margin:0;min-width:0}img,svg{display:block;width:100%;height:auto;max-height:650px;object-fit:contain}figcaption{margin-top:8px;font-weight:600}summary{cursor:pointer;margin:14px 0}pre{font:18px/1.5 monospace}a{color:#304c96}nav{display:flex;flex-wrap:wrap;gap:12px}label{display:block;margin:20px 0}</style>
  <h1>Photo import regression review</h1><p>${examples.length} examples; ${examples.filter(e=>e.status==='transcribed').length} visually transcribed, ${examples.filter(e=>Object.keys(e.ambiguities ?? {}).length).length} with unresolved source details. Source masters retain givens, placements and notes independently of the recognition policy. Null layers are unknown, not empty. Neither OCR output nor a computed solution is source evidence.</p>
  <p>${skippedCount} recognition checks explicitly skipped; source masters retained.</p>
  ${results.length ? `<p>${examples.filter(example => !policies.skips?.[example.filename] && photoExamplePassed(example, resultByFile.get(example.filename), policies.overrides[example.filename] ?? policies.default)).length}/${examples.length-skippedCount} exact recognition and expected outcome checks passed.</p><label><input id="failures" type="checkbox"> Show failures only</label>` : '<p>Transcriptions are proposed for visual review. Unreviewed sources cannot pass the suite.</p>'}
  <nav>${examples.map(e => `<a href="#${escape(e.filename)}">${escape(e.filename)}</a>`).join('')}</nav>${articles}
  <script>document.querySelector('#failures')?.addEventListener('change',e=>document.querySelectorAll('article').forEach(a=>a.hidden=e.target.checked&&a.dataset.status!=='fail'));</script></html>\n`;
}
