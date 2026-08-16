import { DIGITS, UNITS, parseGrid, serializeGrid } from '$lib/domain/sudoku';
import type { Digit, SolveTechnique } from '$lib/domain/types';

export interface LogicalStep {
  technique: SolveTechnique;
  cell?: number;
  value?: Digit;
  eliminated?: Array<{ cell: number; value: Digit }>;
}

export interface LogicalResult {
  solved: boolean;
  grid: string;
  steps: LogicalStep[];
  hardestTechnique: SolveTechnique;
}

const rank: Record<SolveTechnique, number> = {
  'naked-single': 0,
  'hidden-single': 1,
  'naked-pair': 2,
  'pointing-pair': 3
};

export function solveLogically(givens: string): LogicalResult {
  const grid = parseGrid(givens);
  const eliminated = Array.from({ length: 81 }, () => new Set<Digit>());
  const steps: LogicalStep[] = [];
  let hardest: SolveTechnique = 'naked-single';

  const candidates = (cell: number): Digit[] => {
    if (grid[cell] !== 0) return [];
    const used = new Set<number>();
    for (const unit of UNITS) {
      if (unit.includes(cell)) for (const peer of unit) if (grid[peer]) used.add(grid[peer]);
    }
    return DIGITS.filter((digit) => !used.has(digit) && !eliminated[cell].has(digit));
  };
  const record = (step: LogicalStep): void => {
    steps.push(step);
    if (rank[step.technique] > rank[hardest]) hardest = step.technique;
  };

  while (grid.includes(0)) {
    let progressed = false;

    for (let cell = 0; cell < 81; cell += 1) {
      const values = candidates(cell);
      if (grid[cell] === 0 && values.length === 1) {
        grid[cell] = values[0];
        eliminated[cell].clear();
        record({ technique: 'naked-single', cell, value: values[0] });
        progressed = true;
        break;
      }
    }
    if (progressed) continue;

    for (const unit of UNITS) {
      for (const digit of DIGITS) {
        const cells = unit.filter((cell) => candidates(cell).includes(digit));
        if (cells.length === 1) {
          grid[cells[0]] = digit;
          eliminated[cells[0]].clear();
          record({ technique: 'hidden-single', cell: cells[0], value: digit });
          progressed = true;
          break;
        }
      }
      if (progressed) break;
    }
    if (progressed) continue;

    for (const unit of UNITS) {
      const pairs = new Map<string, number[]>();
      for (const cell of unit) {
        const values = candidates(cell);
        if (values.length === 2) {
          const key = values.join('');
          pairs.set(key, [...(pairs.get(key) ?? []), cell]);
        }
      }
      for (const [key, cells] of pairs) {
        if (cells.length !== 2) continue;
        const values = [...key].map(Number) as Digit[];
        const removals: Array<{ cell: number; value: Digit }> = [];
        for (const cell of unit) {
          if (cells.includes(cell) || grid[cell] !== 0) continue;
          for (const value of values) {
            if (candidates(cell).includes(value)) {
              eliminated[cell].add(value);
              removals.push({ cell, value });
            }
          }
        }
        if (removals.length) {
          record({ technique: 'naked-pair', eliminated: removals });
          progressed = true;
          break;
        }
      }
      if (progressed) break;
    }
    if (progressed) continue;

    const boxes = UNITS.slice(18);
    for (const box of boxes) {
      for (const digit of DIGITS) {
        const cells = box.filter((cell) => candidates(cell).includes(digit));
        if (cells.length < 2) continue;
        const rows = new Set(cells.map((cell) => Math.floor(cell / 9)));
        const columns = new Set(cells.map((cell) => cell % 9));
        const targetUnit = rows.size === 1
          ? UNITS[[...rows][0]]
          : columns.size === 1
            ? UNITS[9 + [...columns][0]]
            : null;
        if (!targetUnit) continue;
        const removals: Array<{ cell: number; value: Digit }> = [];
        for (const cell of targetUnit) {
          if (box.includes(cell) || grid[cell] !== 0) continue;
          if (candidates(cell).includes(digit)) {
            eliminated[cell].add(digit);
            removals.push({ cell, value: digit });
          }
        }
        if (removals.length) {
          record({ technique: 'pointing-pair', eliminated: removals });
          progressed = true;
          break;
        }
      }
      if (progressed) break;
    }

    if (!progressed) break;
  }

  return {
    solved: !grid.includes(0),
    grid: serializeGrid(grid),
    steps,
    hardestTechnique: hardest
  };
}
