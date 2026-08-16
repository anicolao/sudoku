import type { Digit } from './types';

export const CELL_COUNT = 81;
export const DIGITS: readonly Digit[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export const rowOf = (cell: number): number => Math.floor(cell / 9);
export const columnOf = (cell: number): number => cell % 9;
export const boxOf = (cell: number): number =>
  Math.floor(rowOf(cell) / 3) * 3 + Math.floor(columnOf(cell) / 3);

export const UNITS: readonly number[][] = [
  ...Array.from({ length: 9 }, (_, row) =>
    Array.from({ length: 9 }, (_, column) => row * 9 + column)
  ),
  ...Array.from({ length: 9 }, (_, column) =>
    Array.from({ length: 9 }, (_, row) => row * 9 + column)
  ),
  ...Array.from({ length: 9 }, (_, box) => {
    const firstRow = Math.floor(box / 3) * 3;
    const firstColumn = (box % 3) * 3;
    return Array.from(
      { length: 9 },
      (_, offset) => (firstRow + Math.floor(offset / 3)) * 9 + firstColumn + (offset % 3)
    );
  })
];

export const PEERS: readonly number[][] = Array.from({ length: CELL_COUNT }, (_, cell) => {
  const peers = new Set<number>();
  for (const unit of UNITS) {
    if (unit.includes(cell)) for (const peer of unit) if (peer !== cell) peers.add(peer);
  }
  return [...peers].sort((left, right) => left - right);
});

export function parseGrid(grid: string): number[] {
  if (!/^[1-9.]{81}$/.test(grid)) throw new Error('A Sudoku grid must contain 81 digits or dots');
  return [...grid].map((value) => (value === '.' ? 0 : Number(value)));
}

export const serializeGrid = (grid: readonly number[]): string =>
  grid.map((value) => (value === 0 ? '.' : String(value))).join('');

export function candidatesFor(grid: readonly number[], cell: number): Digit[] {
  if (grid[cell] !== 0) return [];
  const unavailable = new Set(PEERS[cell].map((peer) => grid[peer]));
  return DIGITS.filter((digit) => !unavailable.has(digit));
}

export function isSolvedGrid(grid: readonly number[]): boolean {
  if (grid.length !== CELL_COUNT || grid.some((value) => value < 1 || value > 9)) return false;
  return UNITS.every((unit) => new Set(unit.map((cell) => grid[cell])).size === 9);
}

export function givensAgree(givens: string, solution: string): boolean {
  if (!/^[1-9.]{81}$/.test(givens) || !/^[1-9]{81}$/.test(solution)) return false;
  return [...givens].every((value, cell) => value === '.' || value === solution[cell]);
}
