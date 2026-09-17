import { candidatesFor, givensAgree, isSolvedGrid, parseGrid, PEERS, UNITS } from './sudoku';
import type { Digit, KillerCage, PuzzleDefinition } from './types';

export function canonicalCages(input: unknown): KillerCage[] {
  if (!Array.isArray(input) || input.length < 9 || input.length > 81) throw new Error('Killer cages must cover all 81 cells.');
  const seen = new Set<number>();
  const cages = input.map((item): KillerCage => {
    if (!item || !Array.isArray(item.cells) || item.cells.length < 1 || item.cells.length > 9 ||
      !Number.isInteger(item.total)) throw new Error('Invalid Killer cage.');
    const cells = [...item.cells] as number[];
    for (const cell of cells) {
      if (!Number.isInteger(cell) || cell < 0 || cell > 80 || seen.has(cell)) throw new Error('Cages must partition the grid without overlaps.');
      seen.add(cell);
    }
    const connected = new Set([cells[0]]);
    for (let pass = 0; pass < cells.length; pass++) for (const cell of cells) {
      if (cells.some((other) => connected.has(other) && adjacent(cell, other))) connected.add(cell);
    }
    if (connected.size !== cells.length) throw new Error('Each cage must be connected along cell edges.');
    const n = cells.length;
    if (item.total < n * (n + 1) / 2 || item.total > n * (19 - n) / 2) throw new Error('A cage total is outside its distinct-digit bounds.');
    return { cells: cells.sort((a, b) => a - b), total: item.total };
  }).sort((a, b) => a.cells[0] - b.cells[0]);
  if (seen.size !== 81 || cages.reduce((sum, cage) => sum + cage.total, 0) !== 405) throw new Error('Killer cages must cover 81 cells and total 405.');
  return cages;
}

export const adjacent = (a: number, b: number): boolean =>
  Math.abs(Math.floor(a / 9) - Math.floor(b / 9)) + Math.abs(a % 9 - b % 9) === 1;

export function validPuzzleRules(puzzle: PuzzleDefinition): boolean {
  try {
    if (puzzle.variant === undefined || puzzle.variant === 'classic') return puzzle.cages === undefined && puzzle.killerRulesVersion === undefined && puzzle.killerDifficulty === undefined && puzzle.killerRatingVersion === undefined;
    if (puzzle.variant !== 'killer' || puzzle.killerRulesVersion !== 1) return false;
    if (puzzle.killerDifficulty !== undefined && !['easy', 'medium', 'hard'].includes(puzzle.killerDifficulty)) return false;
    if ((puzzle.killerDifficulty === undefined) !== (puzzle.killerRatingVersion === undefined) ||
      (puzzle.killerRatingVersion !== undefined && puzzle.killerRatingVersion !== 1)) return false;
    const cages = canonicalCages(puzzle.cages);
    const grid = parseGrid(puzzle.solution);
    return isSolvedGrid(grid) && givensAgree(puzzle.givens, puzzle.solution) && cages.every((cage) =>
      new Set(cage.cells.map((cell) => grid[cell])).size === cage.cells.length &&
      cage.cells.reduce((sum, cell) => sum + grid[cell], 0) === cage.total);
  } catch { return false; }
}

export function puzzlePeers(puzzle: PuzzleDefinition, cell: number): number[] {
  return puzzle.variant === 'killer'
    ? [...new Set([...PEERS[cell], ...(puzzle.cages?.find((cage) => cage.cells.includes(cell))?.cells ?? [])])].filter((peer) => peer !== cell)
    : PEERS[cell];
}

export interface CagePossibilities {
  candidates: Digit[][];
  combinations: Digit[][];
  assignments: number;
}

// Exact cell support, not just the union of possible digit sets. The largest
// legal cage has at most 9! assignments; no cross-cage search occurs here.
export function cagePossibilities(grid: readonly number[], cage: KillerCage, domains?: readonly Digit[][]): CagePossibilities {
  const candidates = cage.cells.map(() => new Set<Digit>());
  const combinations = new Map<string, Digit[]>();
  const allowed = cage.cells.map((cell) => grid[cell] ? [grid[cell] as Digit] : domains?.[cell] ?? candidatesFor(grid, cell));
  const order = cage.cells.map((_, i) => i).sort((a, b) => allowed[a].length - allowed[b].length);
  const chosen: Digit[] = [];
  let assignments = 0;
  function visit(depth: number, sum: number, used: number): void {
    if (depth === order.length) {
      if (sum !== cage.total) return;
      assignments++;
      chosen.forEach((digit, i) => candidates[i].add(digit));
      const combo = [...chosen].sort((a, b) => a - b);
      combinations.set(combo.join(''), combo);
      return;
    }
    const index = order[depth];
    for (const digit of allowed[index]) {
      if ((used & (1 << digit)) || sum + digit > cage.total) continue;
      const rest = order.length - depth - 1;
      const available = [1,2,3,4,5,6,7,8,9].filter((d) => d !== digit && !(used & (1 << d)));
      const min = available.slice(0, rest).reduce((a,b) => a+b, 0);
      const max = rest ? available.slice(-rest).reduce((a,b) => a+b, 0) : 0;
      if (sum + digit + min > cage.total || sum + digit + max < cage.total) continue;
      chosen[index] = digit;
      visit(depth + 1, sum + digit, used | (1 << digit));
    }
  }
  visit(0, 0, 0);
  return { candidates: candidates.map((set) => [...set].sort((a,b) => a-b)), combinations: [...combinations.values()], assignments };
}

export function killerCandidates(grid: readonly number[], cages: readonly KillerCage[]): Digit[][] {
  const domains = grid.map((value, cell) => value ? [value as Digit] : candidatesFor(grid, cell));
  for (const cage of cages) {
    const possibilities = cagePossibilities(grid, cage, domains);
    cage.cells.forEach((cell, i) => { domains[cell] = possibilities.candidates[i]; });
  }
  return domains;
}

export function killerConflicts(grid: readonly number[], cages: readonly KillerCage[]): number[] {
  return [...new Set(cages.filter((cage) => cagePossibilities(grid, cage).assignments === 0).flatMap((cage) => cage.cells))];
}

export function solveKiller(givens: string, cages: readonly KillerCage[], maxNodes = 50_000): { count: number; solution: string | null } {
  const grid = parseGrid(givens);
  let nodes = 0, count = 0;
  let solution: string | null = null;
  function search(): void {
    if (++nodes > maxNodes) throw new Error('Killer validation reached its work limit. Try a simpler puzzle.');
    if (UNITS.some((unit) => { const values = unit.map((c) => grid[c]).filter(Boolean); return new Set(values).size !== values.length; })) return;
    const domains = killerCandidates(grid, cages);
    if (domains.some((digits) => !digits.length)) return;
    const empty = grid.flatMap((v,c) => v ? [] : [c]);
    if (!empty.length) { count++; solution ??= grid.join(''); return; }
    const cell = empty.sort((a,b) => domains[a].length - domains[b].length)[0];
    for (const digit of domains[cell]) {
      grid[cell] = digit;
      search();
      grid[cell] = 0;
      if (count >= 2) return;
    }
  }
  search();
  return { count, solution };
}

// Shared geometry in board-cell coordinates for screen and vector printing.
export function cageSegments(cage: KillerCage): number[][] {
  const result: number[][] = [];
  const inset = .08;
  for (const cell of cage.cells) {
    const x = cell % 9, y = Math.floor(cell / 9);
    const top = !cage.cells.includes(cell - 9), bottom = !cage.cells.includes(cell + 9);
    const left = x === 0 || !cage.cells.includes(cell - 1), right = x === 8 || !cage.cells.includes(cell + 1);
    if (top) result.push([x + (left ? inset : 0), y + inset, x + 1 - (right ? inset : 0), y + inset]);
    if (bottom) result.push([x + (left ? inset : 0), y + 1 - inset, x + 1 - (right ? inset : 0), y + 1 - inset]);
    if (left) result.push([x + inset, y + (top ? inset : 0), x + inset, y + 1 - (bottom ? inset : 0)]);
    if (right) result.push([x + 1 - inset, y + (top ? inset : 0), x + 1 - inset, y + 1 - (bottom ? inset : 0)]);
  }
  return result;
}
