/** Source transcriptions are independent of the recognizer and its test policy.
 * null means NOT transcribed; an empty layer means verified absent.
 * Coordinates in notes/ambiguities are one-based row then column.
 * @typedef {{filename:string, status:'unreviewed'|'transcribed', givens:string|null, placements:string|null, notes:Record<string,string>|null, unclassified?:string, description?:string, ambiguities?:Record<string,string>}} PhotoMaster
 * @typedef {{layers:('givens'|'placements'|'notes')[], outcome:'start'|'review'}} PhotoPolicy
 */

export const EMPTY_BOARD = '.'.repeat(81);

/** @param {PhotoMaster} master */
export function validateMaster(master) {
  if (!['unreviewed','transcribed'].includes(master.status)) throw new Error(`${master.filename}: invalid transcription status`);
  if (master.unclassified && (!/^[.1-9]{81}$/.test(master.unclassified) || !Object.keys(master.ambiguities ?? {}).length)) {
    throw new Error(`${master.filename}: unclassified digits require an explicit ambiguity`);
  }
  for (const layer of ['givens', 'placements']) {
    const board = master[/** @type {'givens'|'placements'} */ (layer)];
    if (board !== null && !/^[.1-9]{81}$/.test(board)) throw new Error(`${master.filename}: invalid ${layer}`);
  }
  for (let cell = 0; cell < 81; cell++) {
    const entries = [master.givens,master.placements,master.unclassified].filter(board=>board?.[cell] && board[cell] !== '.');
    if (entries.length > 1) {
      throw new Error(`${master.filename}: digit layers overlap at ${coordinates(cell)}`);
    }
  }
  for (const [rc, digits] of Object.entries(master.notes ?? {})) {
    if (!/^[1-9]{2}$/.test(rc) || !/^[1-9]+$/.test(digits) || [...new Set(digits)].sort().join('') !== digits) {
      throw new Error(`${master.filename}: invalid notes at ${rc}`);
    }
  }
  if (master.status === 'transcribed' && (master.givens === null || master.placements === null || master.notes === null)) {
    throw new Error(`${master.filename}: a complete transcription needs all three layers`);
  }
}

/** @param {number} cell */
export const coordinates = cell => `${Math.floor(cell / 9) + 1}${cell % 9 + 1}`;

/** @param {PhotoMaster} master @param {PhotoPolicy['layers']} layers */
export function blockingAmbiguities(master, layers) {
  return Object.keys(master.ambiguities ?? {}).filter(key =>
    key.startsWith('notes:') ? layers.includes('notes') : layers.includes('givens') || layers.includes('placements'));
}

/** Never turn an unreviewed transcription into an apparently authoritative link.
 * @param {PhotoMaster} master @param {boolean} includeNotes
 */
export function masterPayload(master, includeNotes = false) {
  validateMaster(master);
  if (master.status !== 'transcribed' || blockingAmbiguities(master, includeNotes ? ['givens','placements','notes'] : ['givens','placements']).length) return null;
  const tokens = [master.givens];
  [...(master.placements ?? EMPTY_BOARD)].forEach((digit, cell) => {
    if (digit !== '.') tokens.push(`${coordinates(cell)}${digit}`);
  });
  if (includeNotes) for (const [rc, digits] of Object.entries(master.notes ?? {}).sort()) tokens.push(`${rc}+${digits}+`);
  return tokens.join('_');
}

/** Compare only the selected layers, but never accept unaudited source material.
 * @param {PhotoMaster} master
 * @param {{givens?:string, placements?:string, notes?:Record<string,string>}} actual
 * @param {PhotoPolicy} policy
 */
export function masterDifferences(master, actual, policy) {
  if (master.status !== 'transcribed') return ['Source transcription has not been audited.'];
  if (blockingAmbiguities(master, policy.layers).length) return ['Source contains unresolved ambiguities in the selected layers.'];
  /** @type {string[]} */
  const differences = [];
  for (const layer of policy.layers) {
    for (let cell = 0; cell < 81; cell++) {
      const rc = coordinates(cell);
      const expected = layer === 'notes' ? master.notes?.[rc] ?? '' : master[layer]?.[cell];
      const received = layer === 'notes' ? (actual.notes === undefined ? undefined : actual.notes[rc] ?? '') : actual[layer]?.[cell];
      if (expected !== received) differences.push(`${layer} r${rc[0]}c${rc[1]}: expected ${expected || 'none'}, got ${received ?? 'not reported'}`);
    }
  }
  return differences;
}
