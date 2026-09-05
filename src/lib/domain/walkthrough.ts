import { analyzeLogicalPlacement } from '$lib/generator/logical-solver';
import { describeMove } from './game-log';
import { replay } from './reducer';
import { DIGITS, UNITS, candidatesFor, columnOf, rowOf, serializeGrid } from './sudoku';
import type {
  Digit,
  GameImportedEvent,
  GameProjection,
  ImportedPuzzleWorkAction,
  SolveTechnique,
  SudokuEvent,
  ValueEnteredEvent
} from './types';

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

type PlacementReference =
  | { kind: 'event'; eventIndex: number }
  | { kind: 'shared-work'; eventIndex: number; actionIndex: number };

const cloneWork = (work: readonly ImportedPuzzleWorkAction[]): ImportedPuzzleWorkAction[] =>
  work.map((action) => action.type === 'value'
    ? { ...action }
    : { ...action, values: [...action.values] });

function placementReferences(events: readonly SudokuEvent[], gameId: string): PlacementReference[] {
  return events.flatMap((event, eventIndex): PlacementReference[] => {
    if (event.gameId !== gameId) return [];
    if (event.type === 'cell/value-entered') return [{ kind: 'event', eventIndex }];
    if (event.type !== 'game/imported' || event.payload.initialView !== 'walkthrough') return [];
    return (event.payload.work ?? []).flatMap((action, actionIndex) =>
      action.type === 'value' ? [{ kind: 'shared-work' as const, eventIndex, actionIndex }] : []
    );
  });
}

export function countSolveWalkthroughPlacements(events: readonly SudokuEvent[], gameId: string): number {
  return placementReferences(events, gameId).length;
}

function buildEventPlacementStep(
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

function importWithWorkPrefix(event: GameImportedEvent, actionCount: number): GameImportedEvent {
  const { work: _work, initialView: _initialView, ...payload } = event.payload;
  const work = cloneWork((event.payload.work ?? []).slice(0, actionCount));
  return {
    ...event,
    payload: {
      ...payload,
      puzzle: {
        ...event.payload.puzzle,
        provenance: event.payload.puzzle.provenance?.kind === 'puzzle-link'
          ? { ...event.payload.puzzle.provenance, formatVersion: event.payload.sharedMetadata ? 3 : work.length ? 2 : 1 }
          : event.payload.puzzle.provenance
      },
      ...(work.length ? { work } : {})
    }
  };
}

function buildSharedWorkPlacementStep(
  events: readonly SudokuEvent[],
  eventIndex: number,
  actionIndex: number,
  gameId: string
): WalkthroughStep | null {
  const origin = events[eventIndex] as GameImportedEvent;
  const action = origin.payload.work?.[actionIndex];
  if (!action || action.type !== 'value') return null;
  const preceding = events.slice(0, eventIndex);
  const before = replay([...preceding, importWithWorkPrefix(origin, actionIndex)]).games[gameId];
  const after = replay([...preceding, importWithWorkPrefix(origin, actionIndex + 1)]).games[gameId];
  if (!before || !after) return null;
  const detail = placementExplanation(before, action.cell, action.value);
  const placementEvent: ValueEnteredEvent = {
    ...origin,
    id: `${origin.id}-work-${actionIndex + 1}`,
    type: 'cell/value-entered',
    payload: { cell: action.cell, value: action.value }
  };
  return {
    eventId: placementEvent.id,
    elapsedMs: origin.elapsedMs,
    game: after,
    ...detail,
    action: describeMove(placementEvent),
    targetCell: action.cell,
    explanation: `${detail.explanation}${after.status === 'complete' ? ' This placement completed the puzzle.' : ''}`
  };
}

function buildPlacementStep(
  events: readonly SudokuEvent[],
  reference: PlacementReference,
  gameId: string
): WalkthroughStep | null {
  return reference.kind === 'event'
    ? buildEventPlacementStep(events, reference.eventIndex, gameId)
    : buildSharedWorkPlacementStep(events, reference.eventIndex, reference.actionIndex, gameId);
}

export function buildSolveWalkthrough(events: readonly SudokuEvent[], gameId: string): SolveWalkthrough {
  const steps = placementReferences(events, gameId)
    .map((reference) => buildPlacementStep(events, reference, gameId))
    .filter((step): step is WalkthroughStep => step !== null);
  return { gameId, steps };
}

const defaultYield = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

export async function buildSolveWalkthroughAsync(
  events: readonly SudokuEvent[],
  gameId: string,
  options: AsyncWalkthroughOptions = {}
): Promise<SolveWalkthrough> {
  const references = placementReferences(events, gameId);
  const steps: WalkthroughStep[] = [];
  const yieldControl = options.yieldControl ?? defaultYield;
  options.onProgress?.({ completed: 0, total: references.length });

  for (let position = 0; position < references.length; position += 1) {
    await yieldControl();
    const step = buildPlacementStep(events, references[position], gameId);
    if (step) steps.push(step);
    options.onProgress?.({ completed: position + 1, total: references.length });
  }
  return { gameId, steps };
}
