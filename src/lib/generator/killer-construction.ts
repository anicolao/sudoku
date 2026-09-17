import { adjacent } from '$lib/domain/killer';
import { candidatesFor } from '$lib/domain/sudoku';
import type { KillerCage } from '$lib/domain/types';
import type { Prng } from './prng';

/** Randomized backtracking from an empty grid; no stored grid or template. */
export function constructSolution(random: Prng): number[] {
  const grid = Array<number>(81).fill(0);
  let nodes = 0;
  function fill(): boolean {
    if (++nodes > 100_000) throw new Error('Solved-grid construction reached its work limit.');
    let target = -1, allowed: number[] = [];
    for (let cell = 0; cell < 81; cell++) {
      if (grid[cell]) continue;
      const digits = candidatesFor(grid, cell);
      if (!digits.length) return false;
      if (target < 0 || digits.length < allowed.length) { target = cell; allowed = digits; }
    }
    if (target < 0) return true;
    for (const digit of random.shuffle(allowed)) {
      grid[target] = digit;
      if (fill()) return true;
    }
    grid[target] = 0;
    return false;
  }
  if (!fill()) throw new Error('Could not construct a solved grid.');
  return grid;
}

const EDGES = Array.from({ length: 81 }, (_, a) =>
  [a + 1, a + 9].filter((b) => b < 81 && adjacent(a, b)).map((b) => [a, b])
).flat();

/** A randomized matching, followed by absorption of unmatched cells. */
export function constructCages(solution: readonly number[], random: Prng, merges: number): KillerCage[] | null {
  let groups = Array.from({ length: 81 }, (_, cell) => [cell]);
  const groupAt = (cell: number): number[] => groups.find((g) => g.includes(cell))!;
  const merge = (left: number[], right: number[]): void => {
    groups = groups.filter((g) => g !== left && g !== right);
    groups.push([...left, ...right]);
  };
  for (const [a, b] of random.shuffle(EDGES)) {
    const left = groupAt(a), right = groupAt(b);
    if (left !== right && left.length === 1 && right.length === 1) merge(left, right);
  }
  for (const single of random.shuffle(groups.filter((g) => g.length === 1))) {
    const neighbours = random.shuffle(groups.filter((g) => g !== single && g.length < 4 &&
      !g.some((cell) => solution[cell] === solution[single[0]]) && g.some((cell) => adjacent(cell, single[0]))));
    if (!neighbours.length) return null;
    merge(single, neighbours[0]);
  }
  for (const [a, b] of random.shuffle(EDGES)) {
    if (merges <= 0) break;
    const left = groupAt(a), right = groupAt(b);
    if (left === right || left.length + right.length > 5 ||
      new Set([...left, ...right].map((cell) => solution[cell])).size !== left.length + right.length) continue;
    merge(left, right); merges--;
  }
  return groups.map((cells) => ({ cells, total: cells.reduce((sum, cell) => sum + solution[cell], 0) }));
}
