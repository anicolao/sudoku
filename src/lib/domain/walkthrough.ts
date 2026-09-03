import { analyzeLogicalPlacement } from '$lib/generator/logical-solver';
import { describeMove } from './game-log';
import { replay } from './reducer';
import { DIGITS, UNITS, candidatesFor, columnOf, rowOf, serializeGrid } from './sudoku';
import type { Digit, GameProjection, SolveTechnique, SudokuEvent, ValueEnteredEvent } from './types';

export type WalkthroughRule =
  | 'full-house'
  | 'naked-single'
  | 'hidden-single'
  | 'naked-pair'
  | 'hidden-pair'
  | 'pointing-pair'
  | 'y-wing'
  | 'x-wing'
  | 'swordfish'
  | 'naked-triple'
  | 'simple-colors'
  | 'xy-chain'
  | 'unique-rectangle'
  | 'medusa'
  | 'unknown-rule';

type BookTechnique = Exclude<WalkthroughRule, 'full-house' | 'unknown-rule'>;

export interface WalkthroughStep {
  eventId: string;
  rule: WalkthroughRule;
  ruleLabel: string;
  action: string;
  explanation: string;
  targetCell: number;
  contextCells: number[];
  elapsedMs: number;
  game: GameProjection;
}

export interface SolveWalkthrough {
  gameId: string;
  steps: WalkthroughStep[];
}

export interface WalkthroughBuildProgress {
  completed: number;
  total: number;
}

export interface AsyncWalkthroughOptions {
  onProgress?: (progress: WalkthroughBuildProgress) => void;
  yieldControl?: () => Promise<void>;
}

interface PlacementExplanation {
  rule: WalkthroughRule;
  ruleLabel: string;
  explanation: string;
  contextCells: number[];
}

const BOOK_TECHNIQUE_ORDER: readonly BookTechnique[] = [
  'naked-single',
  'hidden-single',
  'naked-pair',
  'hidden-pair',
  'pointing-pair',
  'y-wing',
  'x-wing',
  'swordfish',
  'naked-triple',
  'simple-colors',
  'xy-chain',
  'unique-rectangle',
  'medusa'
];

const RULE_LABELS: Record<WalkthroughRule, string> = {
  'full-house': 'Full House',
  'naked-single': 'Naked Single',
  'hidden-single': 'Hidden Single',
  'naked-pair': 'Naked Pairs',
  'hidden-pair': 'Hidden Pairs',
  'pointing-pair': 'Pointing Pairs',
  'y-wing': 'Y-Wing',
  'x-wing': 'X-Wing',
  'swordfish': 'Swordfish',
  'naked-triple': 'Naked Triples',
  'simple-colors': 'Simple Colors',
  'xy-chain': 'XY-Chains',
  'unique-rectangle': 'Unique Rectangles',
  'medusa': '3D Medusa',
  'unknown-rule': 'Unknown rule'
};

const boardFor = (game: GameProjection): number[] => [...game.puzzle.givens].map((given, cell) =>
  given === '.' ? game.values[cell] ?? 0 : Number(given)
);

const cellName = (cell: number): string => `r${rowOf(cell) + 1}c${columnOf(cell) + 1}`;

function unitName(unitIndex: number): string {
  if (unitIndex < 9) return `row ${unitIndex + 1}`;
  if (unitIndex < 18) return `column ${unitIndex - 8}`;
  return `box ${unitIndex - 17}`;
}

function placementExplanation(
  game: GameProjection,
  cell: number,
  value: Digit
): PlacementExplanation {
  const target = cellName(cell);
  const grid = boardFor(game);
  const containingUnits = UNITS
    .map((unit, index) => ({ unit, index }))
    .filter(({ unit }) => unit.includes(cell));

  if (value === Number(game.puzzle.solution[cell])) {
    const fullHouse = containingUnits.find(({ unit }) => {
      const filled = unit.map((candidate) => grid[candidate]).filter(Boolean);
      const missing = DIGITS.filter((digit) => !filled.includes(digit));
      return unit.filter((candidate) => grid[candidate] === 0).length === 1 &&
        new Set(filled).size === filled.length && missing.length === 1 && missing[0] === value;
    });
    if (fullHouse) {
      return {
        rule: 'full-house',
        ruleLabel: RULE_LABELS['full-house'],
        explanation: `${target} is the only empty cell in ${unitName(fullHouse.index)}, so ${value} is the missing digit.`,
        contextCells: fullHouse.unit.filter((candidate) => candidate !== cell)
      };
    }

    const logical = analyzeLogicalPlacement(
      serializeGrid(grid),
      cell,
      value,
      BOOK_TECHNIQUE_ORDER as readonly SolveTechnique[]
    );
    if (logical) {
      const rule = logical.technique as BookTechnique;
      const ruleLabel = RULE_LABELS[rule];
      if (rule === 'naked-single') {
        return {
          rule,
          ruleLabel,
          explanation: `The row, column, and box leave ${value} as the only legal candidate for ${target}.`,
          contextCells: [...new Set(
            UNITS.filter((unit) => unit.includes(cell)).flat().filter((candidate) => candidate !== cell)
          )]
        };
      }
      if (rule === 'hidden-single') {
        const hiddenUnit = containingUnits.find(({ unit }) =>
          unit.filter((candidate) => candidatesFor(grid, candidate).includes(value)).length === 1
        );
        return {
          rule,
          ruleLabel,
          explanation: `${target} is the only cell in ${hiddenUnit ? unitName(hiddenUnit.index) : 'its unit'} that can contain ${value}.`,
          contextCells: hiddenUnit?.unit.filter((candidate) => candidate !== cell) ?? logical.relatedCells ?? []
        };
      }
      return {
        rule,
        ruleLabel,
        explanation: `${ruleLabel} is the simplest listed rule that eliminates enough candidates to prove ${value} at ${target}.`,
        contextCells: (logical.relatedCells ?? []).filter((candidate) => candidate !== cell)
      };
    }
  }

  return {
    rule: 'unknown-rule',
    ruleLabel: RULE_LABELS['unknown-rule'],
    explanation: value === Number(game.puzzle.solution[cell])
      ? `No rule in the walkthrough's book list can be proven from the board before ${value} was placed at ${target}.`
      : `${value} does not match the puzzle's solution at ${target}, so no solving rule accounts for this placement.`,
    contextCells: []
  };
}

const placementIndexes = (events: readonly SudokuEvent[], gameId: string): number[] =>
  events.flatMap((event, index) =>
    event.gameId === gameId && event.type === 'cell/value-entered' ? [index] : []
  );

function buildPlacementStep(
  events: readonly SudokuEvent[],
  index: number,
  gameId: string
): WalkthroughStep | null {
  const event = events[index] as ValueEnteredEvent;
  const before = replay(events.slice(0, index)).games[gameId];
  const after = replay(events.slice(0, index + 1)).games[gameId];
  if (!before || !after) return null;
  const detail = placementExplanation(before, event.payload.cell, event.payload.value);
  return {
    eventId: event.id,
    elapsedMs: event.elapsedMs,
    game: after,
    ...detail,
    action: describeMove(event),
    targetCell: event.payload.cell,
    explanation: `${detail.explanation}${after.status === 'complete' ? ' This placement completed the puzzle.' : ''}`
  };
}

export function buildSolveWalkthrough(events: readonly SudokuEvent[], gameId: string): SolveWalkthrough {
  const steps = placementIndexes(events, gameId)
    .map((index) => buildPlacementStep(events, index, gameId))
    .filter((step): step is WalkthroughStep => step !== null);
  return { gameId, steps };
}

const defaultYield = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

export async function buildSolveWalkthroughAsync(
  events: readonly SudokuEvent[],
  gameId: string,
  options: AsyncWalkthroughOptions = {}
): Promise<SolveWalkthrough> {
  const indexes = placementIndexes(events, gameId);
  const steps: WalkthroughStep[] = [];
  const yieldControl = options.yieldControl ?? defaultYield;
  options.onProgress?.({ completed: 0, total: indexes.length });

  for (let position = 0; position < indexes.length; position += 1) {
    await yieldControl();
    const step = buildPlacementStep(events, indexes[position], gameId);
    if (step) steps.push(step);
    options.onProgress?.({ completed: position + 1, total: indexes.length });
  }
  return { gameId, steps };
}
