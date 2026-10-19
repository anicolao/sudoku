/** Some monochrome puzzle apps distinguish fixed clues with a uniform grey
 * fill rather than a different digit. Require a board-wide two-fill convention:
 * a substantial darker group containing only full-size digits, and a lighter
 * group containing every blank/notes cell. Ordinary row/column highlighting
 * includes blanks and must not establish roles.
 */
export function backgroundPlacementCells(backgrounds: readonly number[], fullSizeCells: ReadonlySet<number>): Set<number> {
  if (backgrounds.length !== 81) return new Set();
  const groups = backgrounds.map(value => ({value, count:backgrounds.filter(other=>Math.abs(other-value)<=4).length}));
  const supported = groups.filter(group=>group.count>=17).map(group=>group.value);
  if (!supported.length) return new Set();
  const low = Math.min(...supported), high = Math.max(...supported);
  // One or two selected cells may have a third fill; a lighting gradient or
  // highlighted unit must not qualify as a fixed-clue background convention.
  if (high - low < 20 || backgrounds.filter(value => Math.abs(value-low)>4 && Math.abs(value-high)>4).length>2) return new Set();
  const darker = backgrounds.flatMap((value, cell) => Math.abs(value-low)<=4 ? [cell] : []);
  if (darker.length < 17 || darker.some(cell => !fullSizeCells.has(cell))) return new Set();
  return new Set([...fullSizeCells].filter(cell => Math.abs(backgrounds[cell]-high)<=4));
}
