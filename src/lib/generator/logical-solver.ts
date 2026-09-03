import { DIGITS, PEERS, UNITS, boxOf, columnOf, parseGrid, rowOf, serializeGrid } from '$lib/domain/sudoku';
import { DIFFICULTY_RANK, TECHNIQUE_DIFFICULTY } from '$lib/domain/difficulty';
import type { Digit, PuzzleDifficulty, SolveTechnique } from '$lib/domain/types';

export interface LogicalStep {
  technique: SolveTechnique;
  cell?: number;
  value?: Digit;
  eliminated?: Array<{ cell: number; value: Digit }>;
  relatedCells?: number[];
}

export interface LogicalResult {
  solved: boolean;
  grid: string;
  steps: LogicalStep[];
  hardestTechnique: SolveTechnique;
  difficulty: PuzzleDifficulty;
  techniques: SolveTechnique[];
}

export interface LogicalSolveOptions {
  maxDifficulty?: PuzzleDifficulty;
}

interface SolverState {
  grid: number[];
  eliminated: Array<Set<Digit>>;
}

const TECHNIQUE_ORDER: readonly SolveTechnique[] = [
  'naked-single', 'hidden-single',
  'naked-pair', 'hidden-pair', 'pointing-pair', 'box-line-reduction',
  'naked-triple', 'hidden-triple', 'x-wing', 'swordfish', 'y-wing',
  'unique-rectangle', 'simple-colors', 'single-digit-chain', 'xy-chain', 'medusa'
];

const TECHNIQUE_RANK = Object.fromEntries(
  TECHNIQUE_ORDER.map((technique, index) => [technique, index])
) as Record<SolveTechnique, number>;

const combinations = <T>(values: readonly T[], size: number): T[][] => {
  const result: T[][] = [];
  const visit = (start: number, chosen: T[]): void => {
    if (chosen.length === size) {
      result.push(chosen);
      return;
    }
    for (let index = start; index <= values.length - (size - chosen.length); index += 1) {
      visit(index + 1, [...chosen, values[index]]);
    }
  };
  visit(0, []);
  return result;
};

const cloneState = (state: SolverState): SolverState => ({
  grid: [...state.grid],
  eliminated: state.eliminated.map((values) => new Set(values))
});

const candidatesIn = (state: SolverState, cell: number): Digit[] => {
  if (state.grid[cell] !== 0) return [];
  const used = new Set(PEERS[cell].map((peer) => state.grid[peer]));
  return DIGITS.filter((digit) => !used.has(digit) && !state.eliminated[cell].has(digit));
};

const place = (state: SolverState, cell: number, value: Digit): void => {
  state.grid[cell] = value;
  state.eliminated[cell].clear();
};

const removeCandidates = (
  state: SolverState,
  removals: Array<{ cell: number; value: Digit }>
): Array<{ cell: number; value: Digit }> => {
  const applied: Array<{ cell: number; value: Digit }> = [];
  for (const removal of removals) {
    if (!candidatesIn(state, removal.cell).includes(removal.value)) continue;
    state.eliminated[removal.cell].add(removal.value);
    applied.push(removal);
  }
  return applied;
};

function hasContradiction(state: SolverState): boolean {
  for (const unit of UNITS) {
    const placed = unit.map((cell) => state.grid[cell]).filter(Boolean);
    if (new Set(placed).size !== placed.length) return true;
    for (const digit of DIGITS) {
      if (placed.includes(digit)) continue;
      if (!unit.some((cell) => candidatesIn(state, cell).includes(digit))) return true;
    }
  }
  return state.grid.some((value, cell) => value === 0 && candidatesIn(state, cell).length === 0);
}

function tryNakedSingle(state: SolverState): LogicalStep | null {
  for (let cell = 0; cell < 81; cell += 1) {
    const values = candidatesIn(state, cell);
    if (values.length !== 1) continue;
    place(state, cell, values[0]);
    return { technique: 'naked-single', cell, value: values[0], relatedCells: PEERS[cell] };
  }
  return null;
}

function tryHiddenSingle(state: SolverState): LogicalStep | null {
  for (const unit of UNITS) {
    for (const digit of DIGITS) {
      if (unit.some((cell) => state.grid[cell] === digit)) continue;
      const cells = unit.filter((cell) => candidatesIn(state, cell).includes(digit));
      if (cells.length !== 1) continue;
      place(state, cells[0], digit);
      return { technique: 'hidden-single', cell: cells[0], value: digit, relatedCells: unit.filter((cell) => cell !== cells[0]) };
    }
  }
  return null;
}

function tryNakedSubset(state: SolverState, size: 2 | 3): LogicalStep | null {
  const technique = size === 2 ? 'naked-pair' : 'naked-triple';
  for (const unit of UNITS) {
    const eligible = unit.filter((cell) => {
      const length = candidatesIn(state, cell).length;
      return length >= 2 && length <= size;
    });
    for (const cells of combinations(eligible, size)) {
      const values = new Set(cells.flatMap((cell) => candidatesIn(state, cell)));
      if (values.size !== size) continue;
      const removals = removeCandidates(state, unit.flatMap((cell) =>
        cells.includes(cell) || state.grid[cell] !== 0
          ? []
          : [...values].map((value) => ({ cell, value }))
      ));
      if (removals.length) return { technique, eliminated: removals, relatedCells: cells };
    }
  }
  return null;
}

function tryHiddenSubset(state: SolverState, size: 2 | 3): LogicalStep | null {
  const technique = size === 2 ? 'hidden-pair' : 'hidden-triple';
  for (const unit of UNITS) {
    for (const values of combinations(DIGITS, size)) {
      const cells = new Set(values.flatMap((value) =>
        unit.filter((cell) => candidatesIn(state, cell).includes(value))
      ));
      if (cells.size !== size || values.some((value) =>
        ![...cells].some((cell) => candidatesIn(state, cell).includes(value))
      )) continue;
      const removals = removeCandidates(state, [...cells].flatMap((cell) =>
        candidatesIn(state, cell)
          .filter((value) => !values.includes(value))
          .map((value) => ({ cell, value }))
      ));
      if (removals.length) return { technique, eliminated: removals, relatedCells: [...cells] };
    }
  }
  return null;
}

function tryPointing(state: SolverState): LogicalStep | null {
  for (const box of UNITS.slice(18)) {
    for (const digit of DIGITS) {
      const cells = box.filter((cell) => candidatesIn(state, cell).includes(digit));
      if (cells.length < 2) continue;
      const rows = new Set(cells.map(rowOf));
      const columns = new Set(cells.map(columnOf));
      const target = rows.size === 1
        ? UNITS[[...rows][0]]
        : columns.size === 1 ? UNITS[9 + [...columns][0]] : null;
      if (!target) continue;
      const removals = removeCandidates(state, target
        .filter((cell) => !box.includes(cell))
        .map((cell) => ({ cell, value: digit }))
      );
      if (removals.length) return { technique: 'pointing-pair', eliminated: removals, relatedCells: cells };
    }
  }
  return null;
}

function tryBoxLineReduction(state: SolverState): LogicalStep | null {
  for (const line of UNITS.slice(0, 18)) {
    for (const digit of DIGITS) {
      const cells = line.filter((cell) => candidatesIn(state, cell).includes(digit));
      if (cells.length < 2 || new Set(cells.map(boxOf)).size !== 1) continue;
      const box = UNITS[18 + boxOf(cells[0])];
      const removals = removeCandidates(state, box
        .filter((cell) => !line.includes(cell))
        .map((cell) => ({ cell, value: digit }))
      );
      if (removals.length) return { technique: 'box-line-reduction', eliminated: removals, relatedCells: cells };
    }
  }
  return null;
}

function tryFish(state: SolverState, size: 2 | 3): LogicalStep | null {
  const technique = size === 2 ? 'x-wing' : 'swordfish';
  for (const digit of DIGITS) {
    for (const orientation of ['row', 'column'] as const) {
      const bases = Array.from({ length: 9 }, (_, index) => {
        const unit = orientation === 'row' ? UNITS[index] : UNITS[9 + index];
        const covers = unit
          .filter((cell) => candidatesIn(state, cell).includes(digit))
          .map((cell) => orientation === 'row' ? columnOf(cell) : rowOf(cell));
        return { index, covers };
      }).filter(({ covers }) => covers.length >= 2 && covers.length <= size);
      for (const baseSet of combinations(bases, size)) {
        const covers = new Set(baseSet.flatMap((base) => base.covers));
        if (covers.size !== size) continue;
        const baseIndexes = new Set(baseSet.map((base) => base.index));
        const removals = removeCandidates(state, [...covers].flatMap((cover) =>
          Array.from({ length: 9 }, (_, base) => ({
            cell: orientation === 'row' ? base * 9 + cover : cover * 9 + base,
            value: digit
          })).filter(({ cell }) => !baseIndexes.has(
            orientation === 'row' ? rowOf(cell) : columnOf(cell)
          ))
        ));
        if (removals.length) {
          const relatedCells = baseSet.flatMap((base) => base.covers.map((cover) =>
            orientation === 'row' ? base.index * 9 + cover : cover * 9 + base.index
          ));
          return { technique, eliminated: removals, relatedCells };
        }
      }
    }
  }
  return null;
}

function tryYWing(state: SolverState): LogicalStep | null {
  const bivalue = Array.from({ length: 81 }, (_, cell) => cell)
    .filter((cell) => candidatesIn(state, cell).length === 2);
  for (const pivot of bivalue) {
    const pivotValues = candidatesIn(state, pivot);
    const pincers = PEERS[pivot].filter((cell) => candidatesIn(state, cell).length === 2);
    for (const [left, right] of combinations(pincers, 2)) {
      const leftValues = candidatesIn(state, left);
      const rightValues = candidatesIn(state, right);
      const leftShared = leftValues.filter((value) => pivotValues.includes(value));
      const rightShared = rightValues.filter((value) => pivotValues.includes(value));
      if (leftShared.length !== 1 || rightShared.length !== 1 || leftShared[0] === rightShared[0]) continue;
      const leftOuter = leftValues.find((value) => !pivotValues.includes(value));
      const rightOuter = rightValues.find((value) => !pivotValues.includes(value));
      if (!leftOuter || leftOuter !== rightOuter) continue;
      const removals = removeCandidates(state, PEERS[left]
        .filter((cell) => PEERS[right].includes(cell) && cell !== pivot)
        .map((cell) => ({ cell, value: leftOuter }))
      );
      if (removals.length) return { technique: 'y-wing', eliminated: removals, relatedCells: [pivot, left, right] };
    }
  }
  return null;
}

function tryXYChain(state: SolverState): LogicalStep | null {
  const bivalue = Array.from({ length: 81 }, (_, cell) => cell)
    .filter((cell) => candidatesIn(state, cell).length === 2);
  const bivalueSet = new Set(bivalue);

  for (const start of bivalue) {
    const startValues = candidatesIn(state, start);
    for (const endpointValue of startValues) {
      const firstLink = startValues.find((value) => value !== endpointValue);
      if (!firstLink) continue;

      const search = (
        current: number,
        linkValue: Digit,
        path: number[]
      ): LogicalStep | null => {
        if (path.length >= 12) return null;
        for (const next of PEERS[current]) {
          if (!bivalueSet.has(next) || path.includes(next)) continue;
          const values = candidatesIn(state, next);
          if (!values.includes(linkValue)) continue;
          const outgoing = values.find((value) => value !== linkValue);
          if (!outgoing) continue;

          const nextPath = [...path, next];
          if (outgoing === endpointValue && nextPath.length >= 3) {
            const removals = removeCandidates(state, PEERS[start]
              .filter((cell) => PEERS[next].includes(cell) && !nextPath.includes(cell))
              .map((cell) => ({ cell, value: endpointValue }))
            );
            if (removals.length) {
              return { technique: 'xy-chain', eliminated: removals, relatedCells: nextPath };
            }
          }

          const result = search(next, outgoing, nextPath);
          if (result) return result;
        }
        return null;
      };

      const result = search(start, firstLink, [start]);
      if (result) return result;
    }
  }
  return null;
}

function tryUniqueRectangle(state: SolverState): LogicalStep | null {
  for (const [top, bottom] of combinations(Array.from({ length: 9 }, (_, index) => index), 2)) {
    for (const [left, right] of combinations(Array.from({ length: 9 }, (_, index) => index), 2)) {
      const cells = [top * 9 + left, top * 9 + right, bottom * 9 + left, bottom * 9 + right];
      if (new Set(cells.map(boxOf)).size !== 2 || cells.some((cell) => state.grid[cell] !== 0)) continue;
      const sets = cells.map((cell) => candidatesIn(state, cell));
      for (let extraIndex = 0; extraIndex < 4; extraIndex += 1) {
        const pairCells = sets.filter((_, index) => index !== extraIndex);
        if (pairCells.some((values) => values.length !== 2)) continue;
        const pair = pairCells[0];
        if (pairCells.some((values) => values[0] !== pair[0] || values[1] !== pair[1])) continue;
        if (!pair.every((value) => sets[extraIndex].includes(value)) || sets[extraIndex].length <= 2) continue;
        const removals = removeCandidates(state, pair.map((value) => ({ cell: cells[extraIndex], value })));
        if (removals.length) return { technique: 'unique-rectangle', eliminated: removals, relatedCells: cells };
      }
    }
  }
  return null;
}

function trySimpleColors(state: SolverState): LogicalStep | null {
  for (const digit of DIGITS) {
    const graph = new Map<number, Set<number>>();
    for (const unit of UNITS) {
      const cells = unit.filter((cell) => candidatesIn(state, cell).includes(digit));
      if (cells.length !== 2) continue;
      for (const [cell, peer] of [[cells[0], cells[1]], [cells[1], cells[0]]]) {
        if (!graph.has(cell)) graph.set(cell, new Set());
        graph.get(cell)?.add(peer);
      }
    }
    const visited = new Set<number>();
    for (const start of graph.keys()) {
      if (visited.has(start)) continue;
      const colors = new Map<number, 0 | 1>([[start, 0]]);
      const queue = [start];
      while (queue.length) {
        const cell = queue.shift() as number;
        visited.add(cell);
        for (const peer of graph.get(cell) ?? []) {
          if (!colors.has(peer)) {
            colors.set(peer, colors.get(cell) === 0 ? 1 : 0);
            queue.push(peer);
          }
        }
      }
      if (colors.size < 4) continue;
      for (const color of [0, 1] as const) {
        const cells = [...colors].filter(([, value]) => value === color).map(([cell]) => cell);
        if (!cells.some((cell) => cells.some((peer) => peer !== cell && PEERS[cell].includes(peer)))) continue;
        const removals = removeCandidates(state, cells.map((cell) => ({ cell, value: digit })));
        if (removals.length) return { technique: 'simple-colors', eliminated: removals, relatedCells: [...colors.keys()] };
      }
      const colorZero = [...colors].filter(([, color]) => color === 0).map(([cell]) => cell);
      const colorOne = [...colors].filter(([, color]) => color === 1).map(([cell]) => cell);
      const removals = removeCandidates(state, Array.from({ length: 81 }, (_, cell) => cell)
        .filter((cell) => !colors.has(cell) && candidatesIn(state, cell).includes(digit))
        .filter((cell) => colorZero.some((peer) => PEERS[cell].includes(peer)) &&
          colorOne.some((peer) => PEERS[cell].includes(peer)))
        .map((cell) => ({ cell, value: digit }))
      );
      if (removals.length) return { technique: 'simple-colors', eliminated: removals, relatedCells: [...colors.keys()] };
    }
  }
  return null;
}

interface ColoredCandidate {
  cell: number;
  value: Digit;
}

const candidateKey = ({ cell, value }: ColoredCandidate): string => `${cell}:${value}`;

function tryMedusa(state: SolverState): LogicalStep | null {
  const candidates = Array.from({ length: 81 }, (_, cell) =>
    candidatesIn(state, cell).map((value) => ({ cell, value }))
  ).flat();
  const byKey = new Map(candidates.map((candidate) => [candidateKey(candidate), candidate]));
  const graph = new Map<string, Set<string>>();
  const connect = (left: ColoredCandidate, right: ColoredCandidate): void => {
    const leftKey = candidateKey(left);
    const rightKey = candidateKey(right);
    if (!graph.has(leftKey)) graph.set(leftKey, new Set());
    if (!graph.has(rightKey)) graph.set(rightKey, new Set());
    graph.get(leftKey)?.add(rightKey);
    graph.get(rightKey)?.add(leftKey);
  };

  for (let cell = 0; cell < 81; cell += 1) {
    const values = candidatesIn(state, cell);
    if (values.length === 2) {
      connect({ cell, value: values[0] }, { cell, value: values[1] });
    }
  }
  for (const unit of UNITS) {
    for (const value of DIGITS) {
      const cells = unit.filter((cell) => candidatesIn(state, cell).includes(value));
      if (cells.length === 2) connect({ cell: cells[0], value }, { cell: cells[1], value });
    }
  }

  const visited = new Set<string>();
  for (const start of graph.keys()) {
    if (visited.has(start)) continue;
    const colors = new Map<string, 0 | 1>([[start, 0]]);
    const queue = [start];
    while (queue.length) {
      const key = queue.shift() as string;
      visited.add(key);
      for (const peer of graph.get(key) ?? []) {
        if (!colors.has(peer)) {
          colors.set(peer, colors.get(key) === 0 ? 1 : 0);
          queue.push(peer);
        }
      }
    }
    if (colors.size < 4) continue;

    const colored = [...colors].map(([key, color]) => ({
      candidate: byKey.get(key) as ColoredCandidate,
      color
    }));
    const relatedCells = [...new Set(colored.map(({ candidate }) => candidate.cell))];

    for (const color of [0, 1] as const) {
      const sameColor = colored.filter((entry) => entry.color === color).map((entry) => entry.candidate);
      const twiceInCell = sameColor.some((candidate, index) =>
        sameColor.some((other, otherIndex) => otherIndex !== index && other.cell === candidate.cell)
      );
      const twiceInUnit = sameColor.some((candidate, index) =>
        sameColor.some((other, otherIndex) => otherIndex !== index &&
          other.value === candidate.value && PEERS[candidate.cell].includes(other.cell))
      );
      if (twiceInCell || twiceInUnit) {
        const removals = removeCandidates(state, sameColor);
        if (removals.length) return { technique: 'medusa', eliminated: removals, relatedCells };
      }
    }

    for (let cell = 0; cell < 81; cell += 1) {
      const inCell = colored.filter(({ candidate }) => candidate.cell === cell);
      if (!inCell.some(({ color }) => color === 0) || !inCell.some(({ color }) => color === 1)) continue;
      const coloredValues = new Set(inCell.map(({ candidate }) => candidate.value));
      const removals = removeCandidates(state, candidatesIn(state, cell)
        .filter((value) => !coloredValues.has(value))
        .map((value) => ({ cell, value }))
      );
      if (removals.length) return { technique: 'medusa', eliminated: removals, relatedCells };
    }

    for (const candidate of candidates) {
      if (colors.has(candidateKey(candidate))) continue;
      const seenColors = new Set(colored
        .filter(({ candidate: coloredCandidate }) =>
          coloredCandidate.value === candidate.value &&
          PEERS[candidate.cell].includes(coloredCandidate.cell)
        )
        .map(({ color }) => color)
      );
      if (seenColors.size !== 2) continue;
      const removals = removeCandidates(state, [candidate]);
      if (removals.length) return { technique: 'medusa', eliminated: removals, relatedCells };
    }
  }
  return null;
}

function propagateSingles(state: SolverState): boolean {
  for (let iteration = 0; iteration < 81; iteration += 1) {
    if (hasContradiction(state)) return false;
    if (!tryNakedSingle(state) && !tryHiddenSingle(state)) return !hasContradiction(state);
  }
  return !hasContradiction(state);
}

function tryForcingChain(state: SolverState): LogicalStep | null {
  const pivots = Array.from({ length: 81 }, (_, cell) => cell)
    .filter((cell) => candidatesIn(state, cell).length === 2);
  for (const pivot of pivots) {
    const [first, second] = candidatesIn(state, pivot);
    const branches = [first, second].map((value) => {
      const branch = cloneState(state);
      place(branch, pivot, value);
      return { value, state: branch, valid: propagateSingles(branch) };
    });
    const invalid = branches.filter((branch) => !branch.valid);
    if (invalid.length === 1) {
      const removals = removeCandidates(state, [{ cell: pivot, value: invalid[0].value }]);
      if (removals.length) return { technique: 'single-digit-chain', eliminated: removals, relatedCells: [pivot] };
    }
    if (invalid.length || branches.some((branch) => !branch.valid)) continue;
    for (let cell = 0; cell < 81; cell += 1) {
      if (state.grid[cell] !== 0) continue;
      const value = branches[0].state.grid[cell];
      if (!value || branches[1].state.grid[cell] !== value) continue;
      place(state, cell, value as Digit);
      return { technique: 'xy-chain', cell, value: value as Digit, relatedCells: [pivot] };
    }
  }
  return null;
}

function findLogicalStep(state: SolverState, maxDifficulty: PuzzleDifficulty): LogicalStep | null {
  const allowed = (technique: SolveTechnique): boolean =>
    DIFFICULTY_RANK[TECHNIQUE_DIFFICULTY[technique]] <= DIFFICULTY_RANK[maxDifficulty];
  const finders: Array<[SolveTechnique, () => LogicalStep | null]> = [
    ['naked-single', () => tryNakedSingle(state)],
    ['hidden-single', () => tryHiddenSingle(state)],
    ['naked-pair', () => tryNakedSubset(state, 2)],
    ['hidden-pair', () => tryHiddenSubset(state, 2)],
    ['pointing-pair', () => tryPointing(state)],
    ['box-line-reduction', () => tryBoxLineReduction(state)],
    ['naked-triple', () => tryNakedSubset(state, 3)],
    ['hidden-triple', () => tryHiddenSubset(state, 3)],
    ['x-wing', () => tryFish(state, 2)],
    ['swordfish', () => tryFish(state, 3)],
    ['y-wing', () => tryYWing(state)],
    ['unique-rectangle', () => tryUniqueRectangle(state)],
    ['simple-colors', () => trySimpleColors(state)],
    ['single-digit-chain', () => tryForcingChain(state)]
  ];
  for (const [technique, find] of finders) {
    if (!allowed(technique)) continue;
    const step = find();
    if (step) return step;
  }
  return null;
}

export function nextLogicalStep(
  givens: string,
  options: LogicalSolveOptions = {}
): LogicalStep | null {
  const state: SolverState = {
    grid: parseGrid(givens),
    eliminated: Array.from({ length: 81 }, () => new Set<Digit>())
  };
  if (hasContradiction(state) || !state.grid.includes(0)) return null;
  return findLogicalStep(state, options.maxDifficulty ?? 'master');
}

const placementTechniqueStep = (
  state: SolverState,
  technique: SolveTechnique
): LogicalStep | null => {
  switch (technique) {
    case 'naked-pair': return tryNakedSubset(state, 2);
    case 'hidden-pair': return tryHiddenSubset(state, 2);
    case 'pointing-pair': return tryPointing(state);
    case 'y-wing': return tryYWing(state);
    case 'x-wing': return tryFish(state, 2);
    case 'swordfish': return tryFish(state, 3);
    case 'naked-triple': return tryNakedSubset(state, 3);
    case 'simple-colors': return trySimpleColors(state);
    case 'xy-chain': return tryXYChain(state);
    case 'unique-rectangle': return tryUniqueRectangle(state);
    case 'medusa': return tryMedusa(state);
    default: return null;
  }
};

function directPlacementTechnique(
  state: SolverState,
  cell: number,
  value: Digit
): 'naked-single' | 'hidden-single' | null {
  const candidates = candidatesIn(state, cell);
  if (candidates.length === 1 && candidates[0] === value) return 'naked-single';
  if (!candidates.includes(value)) return null;
  const hidden = UNITS
    .filter((unit) => unit.includes(cell))
    .some((unit) => unit.filter((candidate) => candidatesIn(state, candidate).includes(value)).length === 1);
  return hidden ? 'hidden-single' : null;
}

export function analyzeLogicalPlacement(
  givens: string,
  cell: number,
  value: Digit,
  techniqueOrder: readonly SolveTechnique[]
): LogicalStep | null {
  const base: SolverState = {
    grid: parseGrid(givens),
    eliminated: Array.from({ length: 81 }, () => new Set<Digit>())
  };
  if (cell < 0 || cell >= 81 || base.grid[cell] !== 0 || hasContradiction(base)) return null;

  const direct = directPlacementTechnique(base, cell, value);
  if (direct && techniqueOrder.includes(direct)) {
    return { technique: direct, cell, value, relatedCells: PEERS[cell] };
  }

  for (const technique of techniqueOrder) {
    if (technique === 'naked-single' || technique === 'hidden-single') continue;
    const state = cloneState(base);
    for (let iteration = 0; iteration < 512; iteration += 1) {
      const step = placementTechniqueStep(state, technique);
      if (!step || hasContradiction(state)) break;
      const nowDirect = directPlacementTechnique(state, cell, value);
      if (nowDirect) {
        return {
          technique,
          cell,
          value,
          eliminated: step.eliminated,
          relatedCells: step.relatedCells ?? []
        };
      }
    }
  }
  return null;
}

function difficultyFromSteps(steps: readonly LogicalStep[]): PuzzleDifficulty {
  const expertSteps = steps.filter((step) => TECHNIQUE_DIFFICULTY[step.technique] === 'expert');
  if (expertSteps.length >= 3) return 'master';
  let hardest: PuzzleDifficulty = 'foundations';
  for (const step of steps) {
    const difficulty = TECHNIQUE_DIFFICULTY[step.technique];
    if (DIFFICULTY_RANK[difficulty] > DIFFICULTY_RANK[hardest]) hardest = difficulty;
  }
  return hardest;
}

export function solveLogically(
  givens: string,
  options: LogicalSolveOptions = {}
): LogicalResult {
  const state: SolverState = {
    grid: parseGrid(givens),
    eliminated: Array.from({ length: 81 }, () => new Set<Digit>())
  };
  const steps: LogicalStep[] = [];
  const maxDifficulty = options.maxDifficulty ?? 'master';
  let hardest: SolveTechnique = 'naked-single';
  const record = (step: LogicalStep): void => {
    steps.push(step);
    if (TECHNIQUE_RANK[step.technique] > TECHNIQUE_RANK[hardest]) hardest = step.technique;
  };

  while (state.grid.includes(0) && !hasContradiction(state)) {
    const step = findLogicalStep(state, maxDifficulty);
    if (!step) break;
    record(step);
  }

  const techniques = [...new Set(steps.map((step) => step.technique))];
  return {
    solved: !state.grid.includes(0) && !hasContradiction(state),
    grid: serializeGrid(state.grid),
    steps,
    hardestTechnique: hardest,
    difficulty: difficultyFromSteps(steps),
    techniques
  };
}
