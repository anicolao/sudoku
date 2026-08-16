import { candidatesFor, isSolvedGrid, parseGrid, serializeGrid } from '$lib/domain/sudoku';

function chooseCell(grid: readonly number[]): { cell: number; candidates: number[] } | null {
  let choice: { cell: number; candidates: number[] } | null = null;
  for (let cell = 0; cell < grid.length; cell += 1) {
    if (grid[cell] !== 0) continue;
    const candidates = candidatesFor(grid, cell);
    if (candidates.length === 0) return { cell, candidates: [] };
    if (!choice || candidates.length < choice.candidates.length) choice = { cell, candidates };
  }
  return choice;
}

export function countSolutions(givens: string, limit = 2): number {
  const grid = parseGrid(givens);
  let count = 0;
  const search = (): void => {
    if (count >= limit) return;
    const choice = chooseCell(grid);
    if (!choice) {
      if (isSolvedGrid(grid)) count += 1;
      return;
    }
    for (const digit of choice.candidates) {
      grid[choice.cell] = digit;
      search();
      grid[choice.cell] = 0;
      if (count >= limit) return;
    }
  };
  search();
  return count;
}

export function solveFirst(givens: string): string | null {
  const grid = parseGrid(givens);
  const search = (): boolean => {
    const choice = chooseCell(grid);
    if (!choice) return isSolvedGrid(grid);
    for (const digit of choice.candidates) {
      grid[choice.cell] = digit;
      if (search()) return true;
      grid[choice.cell] = 0;
    }
    return false;
  };
  return search() ? serializeGrid(grid) : null;
}
