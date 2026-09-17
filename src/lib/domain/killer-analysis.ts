import { cagePossibilities, killerCandidates, killerConflicts } from './killer';
import { candidatesFor, DIGITS, UNITS } from './sudoku';
import type { Digit, KillerCage } from './types';

export interface KillerPlacement {
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

export function nextKillerPlacement(grid: readonly number[], cages: readonly KillerCage[]): KillerPlacement | null {
  if (UNITS.some((unit) => { const values=unit.map((c)=>grid[c]).filter(Boolean); return values.length !== new Set(values).size; }) || killerConflicts(grid, cages).length) return null;
  const domains = killerCandidates(grid, cages);
  if (domains.some((ds) => !ds.length)) return null;
  for (const relationship of killerRelationships(grid, cages)) {
    if (relationship.cells.length !== 1 || !domains[relationship.cells[0]].includes(relationship.total as Digit)) continue;
    return { rule: 'killer-45', ruleLabel: 'Rule of 45', targetCell: relationship.cells[0], value: relationship.total as Digit, contextCells: relationship.contextCells, explanation: relationship.explanation };
  }
  for (let cell = 0; cell < 81; cell++) {
    if (grid[cell] || domains[cell].length !== 1) continue;
    const cage = cages.find((c) => c.cells.includes(cell))!;
    const value = domains[cell][0];
    const simple = candidatesFor(grid, cell).length === 1;
    const possibilities = cagePossibilities(grid, cage);
    return {
      rule: simple ? 'killer-house' : 'killer-cage', ruleLabel: simple ? 'Naked Single' : 'Cage combinations', targetCell: cell, value,
      contextCells: simple ? UNITS.filter((u) => u.includes(cell)).flat() : cage.cells,
      explanation: simple ? `The row, column and box leave only ${value} in ${killerCellName(cell)}.`
        : `The ${cage.total} cage has ${possibilities.combinations.length} feasible digit ${possibilities.combinations.length === 1 ? 'set' : 'sets'}${possibilities.combinations.length === 1 ? ` {${possibilities.combinations[0].join(', ')}}` : ''}. Checking where those digits fit against the row, column and box leaves only ${value} in ${killerCellName(cell)}.`
    };
  }
  for (let i = 0; i < UNITS.length; i++) for (const digit of DIGITS) {
    const unit = UNITS[i];
    if (unit.some((cell) => grid[cell] === digit)) continue;
    const positions = unit.filter((cell) => !grid[cell] && domains[cell].includes(digit));
    if (positions.length === 1) return {
      rule: 'killer-house', ruleLabel: 'Hidden Single after cage restrictions', targetCell: positions[0], value: digit,
      contextCells: [...new Set(cages.filter((cage) => cage.cells.some((cell) => unit.includes(cell))).flatMap((cage) => cage.cells))],
      explanation: `Check the feasible cage assignments in ${houseName(i)}. Only ${killerCellName(positions[0])} can contain ${digit}; every other empty cell excludes it through its cage or ordinary Sudoku peers.`
    };
  }
  return null;
}

export function solveKillerLogically(givens: string, cages: readonly KillerCage[]): { solved: boolean; grid: string; steps: KillerPlacement[] } {
  const grid = [...givens].map((v) => v === '.' ? 0 : Number(v));
  const steps: KillerPlacement[] = [];
  while (grid.includes(0)) {
    const step = nextKillerPlacement(grid, cages);
    if (!step) break;
    steps.push(step); grid[step.targetCell] = step.value;
  }
  return { solved: !grid.includes(0), grid: grid.map((v)=>v || '.').join(''), steps };
}
