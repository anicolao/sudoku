import { cagePossibilities } from './killer';
import { candidatesFor, DIGITS, PEERS, UNITS } from './sudoku';
import type { Digit, KillerCage } from './types';

export type KillerDifficulty = 'easy' | 'medium' | 'hard';
export const KILLER_DIFFICULTIES: readonly KillerDifficulty[] = ['easy', 'medium', 'hard'];
export const killerDifficultyLabel = (level?: KillerDifficulty): string => level ? level[0].toUpperCase() + level.slice(1) : 'Unrated';

export interface KillerPlacement {
  prerequisites?: string[];
  difficulty?: KillerDifficulty;
  rule: 'killer-cage' | 'killer-house' | 'killer-45';
  ruleLabel: string;
  targetCell: number;
  value: Digit;
  contextCells: number[];
  explanation: string;
}
export interface KillerRelationship { cells: number[]; total: number; contextCells: number[]; explanation: string; }
export const killerCellName = (cell: number): string => `r${Math.floor(cell / 9) + 1}c${cell % 9 + 1}`;
const houseName = (i: number): string => i < 9 ? `row ${i+1}` : i < 18 ? `column ${i-8}` : `box ${i-17}`;

// Only single houses are enumerated in v1. No overlapping-house addition and no
// all-different assumption about the residual cells.
export function killerRelationships(grid: readonly number[], cages: readonly KillerCage[]): KillerRelationship[] {
  const result: KillerRelationship[] = [];
  const seen = new Set<string>();
  UNITS.forEach((unit, index) => {
    const inside = cages.filter((cage) => cage.cells.every((cell) => unit.includes(cell)));
    const covering = cages.filter((cage) => cage.cells.some((cell) => unit.includes(cell)));
    for (const [kind, selected] of [['inside', inside], ['outside', covering]] as const) {
      const covered = selected.flatMap((cage) => cage.cells);
      const residual = kind === 'inside' ? unit.filter((cell) => !covered.includes(cell)) : covered.filter((cell) => !unit.includes(cell));
      const cells = residual.filter((cell) => !grid[cell]);
      if (!cells.length || cells.length > 2) continue;
      const sum = selected.reduce((total, cage) => total + cage.total, 0);
      const known = residual.reduce((total, cell) => total + grid[cell], 0);
      const total = (kind === 'inside' ? 45 - sum : sum - 45) - known;
      const key = [...cells].sort((a,b)=>a-b).join(',') + ':' + total;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ cells, total, contextCells: [...new Set([...unit, ...covered])],
        explanation: `${houseName(index)} totals 45. ${kind === 'inside' ? 'The cages wholly inside it total' : 'The cages covering it total'} ${sum}.${known ? ` Subtract ${known} already placed in the remaining cells.` : ''} Therefore ${cells.map(killerCellName).join(' + ')} = ${total}.` });
    }
  });
  return result;
}

/** Human candidate propagation: every removal has a local, replayable reason. */
export function nextKillerPlacement(
  grid: readonly number[], cages: readonly KillerCage[], level: KillerDifficulty = 'hard'
): KillerPlacement | null {
  if (UNITS.some((unit) => { const values = unit.map((c) => grid[c]).filter(Boolean); return values.length !== new Set(values).size; })) return null;
  const domains = grid.map((value, cell) => value ? [value as Digit] : candidatesFor(grid, cell));
  if (cages.some((cage) => cagePossibilities(grid, cage, domains).assignments === 0)) return null;
  const prerequisites: string[] = [];
  const context = new Set<number>();
  let hardest: KillerDifficulty = 'easy';
  const finish = (cell: number, value: Digit, explanation: string, cells: number[], rule: KillerPlacement['rule'] = 'killer-house'): KillerPlacement => ({
    rule, ruleLabel: rule === 'killer-45' ? 'Rule of 45' : prerequisites.length ? 'Cages and Sudoku' : 'Sudoku single',
    targetCell: cell, value, explanation, prerequisites: [...prerequisites],
    contextCells: [...new Set([...context, ...cells])], difficulty: hardest
  });
  const remove = (cells: readonly number[], digit: Digit): number[] => {
    const affected = cells.filter((cell) => !grid[cell] && domains[cell].includes(digit));
    affected.forEach((cell) => { domains[cell] = domains[cell].filter((d) => d !== digit); });
    return affected;
  };
  const record = (text: string, cells: readonly number[], difficulty: KillerDifficulty = 'easy'): void => {
    prerequisites.push(text); cells.forEach((c) => context.add(c));
    if (KILLER_DIFFICULTIES.indexOf(difficulty) > KILLER_DIFFICULTIES.indexOf(hardest)) hardest = difficulty;
  };
  const opening = killerRelationships(grid, cages).find((r) => r.cells.length === 1 && domains[r.cells[0]].includes(r.total as Digit));
  if (opening) return finish(opening.cells[0], opening.total as Digit, opening.explanation, opening.contextCells, 'killer-45');
  // Each changed pass removes at least one of the 729 possible candidates.
  for (let pass = 0; pass < 730; pass++) {
    if (domains.some((ds) => !ds.length)) return null;
    for (let cell = 0; cell < 81; cell++) if (!grid[cell] && domains[cell].length === 1) {
      return finish(cell, domains[cell][0], `Only ${domains[cell][0]} remains in ${killerCellName(cell)}.`, [cell]);
    }
    for (let i = 0; i < UNITS.length; i++) for (const digit of DIGITS) {
      const unit = UNITS[i];
      if (unit.some((cell) => grid[cell] === digit)) continue;
      const positions = unit.filter((cell) => !grid[cell] && domains[cell].includes(digit));
      if (!positions.length) return null;
      if (positions.length === 1) return finish(positions[0], digit,
        `Only ${killerCellName(positions[0])} can contain ${digit} in ${houseName(i)}.`, unit);
    }
    let changed = false;
    for (const cage of cages) {
      const possibilities = cagePossibilities(grid, cage, domains);
      if (!possibilities.assignments) return null;
      const reductions: string[] = [];
      cage.cells.forEach((cell, i) => {
        if (domains[cell].length !== possibilities.candidates[i].length) {
          const excluded = domains[cell].filter((d) => !possibilities.candidates[i].includes(d));
          reductions.push(`${killerCellName(cell)} excludes ${excluded.join('/')}`);
          domains[cell] = possibilities.candidates[i]; changed = true;
        }
      });
      if (reductions.length) record(`The ${cage.total} cage at ${killerCellName(cage.cells[0])} must use distinct digits that fit its cells and total. ${reductions.join('; ')}.`, cage.cells);
    }
    if (changed) continue;
    const relationships = killerRelationships(grid, cages);
    const single = relationships.find((r) => r.cells.length === 1 && domains[r.cells[0]].includes(r.total as Digit));
    if (single) return finish(single.cells[0], single.total as Digit, single.explanation, single.contextCells, 'killer-45');
    if (level === 'easy') return null;
    // Naked pairs in ordinary houses and cages (both are all-different).
    for (const unit of [...UNITS, ...cages.map((c) => c.cells)]) {
      for (const cell of unit) {
        if (grid[cell] || domains[cell].length !== 2) continue;
        const pair = unit.filter((other) => !grid[other] && domains[other].join() === domains[cell].join());
        if (pair.length !== 2) continue;
        const affected = domains[cell].flatMap((d) => remove(unit.filter((c) => !pair.includes(c)), d));
        if (affected.length) { changed = true; record(`${pair.map(killerCellName).join(' and ')} form the pair {${domains[cell].join(', ')}}. Remove those digits from the other cells of their shared house or cage.`, [...pair, ...affected], 'medium'); }
      }
    }
    // Ordinary locked candidates and digits mandatory in every cage assignment.
    for (const [index, unit] of UNITS.entries()) for (const digit of DIGITS) {
      if (unit.some((cell) => grid[cell] === digit)) continue;
      const places = unit.filter((cell) => !grid[cell] && domains[cell].includes(digit));
      if (!places.length) return null;
      const sharedPeers = PEERS[places[0]].filter((cell) => !unit.includes(cell) && places.every((place) => PEERS[place].includes(cell)));
      const affected = remove(sharedPeers, digit);
      if (affected.length) { changed = true; record(`${digit} in ${houseName(index)} is confined to ${places.map(killerCellName).join(', ')}. Cells seeing all those positions exclude ${digit}.`, [...places, ...affected], 'medium'); }
    }
    for (const cage of cages) {
      const combinations = cagePossibilities(grid, cage, domains).combinations;
      if (!combinations.length) return null;
      for (const digit of DIGITS) {
        if (!combinations.every((combo) => combo.includes(digit)) || cage.cells.some((cell) => grid[cell] === digit)) continue;
        const places = cage.cells.filter((cell) => domains[cell].includes(digit));
        if (!places.length) return null;
        const affected = remove(PEERS[places[0]].filter((cell) => !cage.cells.includes(cell) && places.every((place) => PEERS[place].includes(cell))), digit);
        if (affected.length) { changed = true; record(`Every feasible set for the ${cage.total} cage at ${killerCellName(cage.cells[0])} contains ${digit}. It is confined to ${places.map(killerCellName).join(', ')}, excluding ${digit} from cells seeing all those positions.`, [...cage.cells, ...affected], 'medium'); }
      }
    }
    if (changed) continue;
    if (level === 'medium') return null;
    for (const relationship of relationships) {
      if (relationship.cells.length !== 2) continue;
      const [a, b] = relationship.cells;
      const distinct = PEERS[a].includes(b) || cages.some((cage) => cage.cells.includes(a) && cage.cells.includes(b));
      const left = domains[a].filter((d) => domains[b].some((e) => d + e === relationship.total && (!distinct || d !== e)));
      const right = domains[b].filter((d) => domains[a].some((e) => d + e === relationship.total && (!distinct || d !== e)));
      if (left.length !== domains[a].length || right.length !== domains[b].length) {
        domains[a] = left; domains[b] = right; changed = true;
        record(`${relationship.explanation} Keep only pairs fitting this sum${distinct ? ' with distinct digits' : '; repetition is permitted here'}.`, relationship.contextCells, 'hard');
      }
    }
    if (!changed) return null;
  }
  return null;
}

export function solveKillerLogically(givens: string, cages: readonly KillerCage[], level: KillerDifficulty = 'hard'): { solved: boolean; grid: string; steps: KillerPlacement[] } {
  const grid = [...givens].map((v) => v === '.' ? 0 : Number(v));
  const steps: KillerPlacement[] = [];
  while (grid.includes(0)) {
    const step = nextKillerPlacement(grid, cages, level);
    if (!step) break;
    steps.push(step); grid[step.targetCell] = step.value;
  }
  return { solved: !grid.includes(0), grid: grid.map((v)=>v || '.').join(''), steps };
}

export function rateKiller(givens: string, cages: readonly KillerCage[]): { difficulty: KillerDifficulty; steps: KillerPlacement[] } | null {
  for (const difficulty of KILLER_DIFFICULTIES) {
    const logical = solveKillerLogically(givens, cages, difficulty);
    if (logical.solved) return { difficulty, steps: logical.steps };
  }
  return null;
}
