import { describeMove } from './game-log';
import { replay } from './reducer';
import { DIGITS, PEERS, UNITS, candidatesFor, columnOf, rowOf, serializeGrid } from './sudoku';
import { nextLogicalStep } from '$lib/generator/logical-solver';
import type { Digit, GameProjection, ReversibleEvent, SolveTechnique, SudokuEvent } from './types';

export type WalkthroughRule =
  | SolveTechnique
  | 'starting-position'
  | 'full-house'
  | 'naked-single'
  | 'hidden-single'
  | 'recorded-placement'
  | 'mistake'
  | 'candidate-added'
  | 'candidate-removed'
  | 'candidates-filled'
  | 'correction'
  | 'hint'
  | 'undo'
  | 'redo'
  | 'restart';

export interface WalkthroughStep {
  eventId: string;
  rule: WalkthroughRule;
  ruleLabel: string;
  action: string;
  explanation: string;
  targetCell: number | null;
  contextCells: number[];
  elapsedMs: number;
  game: GameProjection;
}

export interface SolveWalkthrough {
  gameId: string;
  steps: WalkthroughStep[];
}

interface PlacementExplanation {
  rule: WalkthroughRule;
  ruleLabel: string;
  explanation: string;
  contextCells: number[];
}

const TECHNIQUE_LABELS: Record<SolveTechnique, string> = {
  'naked-single': 'Naked single',
  'hidden-single': 'Hidden single',
  'naked-pair': 'Naked pair',
  'hidden-pair': 'Hidden pair',
  'pointing-pair': 'Pointing pair',
  'box-line-reduction': 'Box/line reduction',
  'naked-triple': 'Naked triple',
  'hidden-triple': 'Hidden triple',
  'x-wing': 'X-Wing',
  'swordfish': 'Swordfish',
  'y-wing': 'Y-Wing',
  'single-digit-chain': 'Single-digit chain',
  'simple-colors': 'Simple colors',
  'xy-chain': 'XY-Chain',
  'medusa': '3D Medusa',
  'unique-rectangle': 'Unique rectangle'
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
  if (value !== Number(game.puzzle.solution[cell])) {
    return {
      rule: 'mistake',
      ruleLabel: 'Mistake',
      explanation: `${value} does not match the puzzle's solution at ${target}. The walkthrough keeps it visible because it was part of the recorded solve.`,
      contextCells: PEERS[cell]
    };
  }

  const grid = boardFor(game);
  const containingUnits = UNITS
    .map((unit, index) => ({ unit, index }))
    .filter(({ unit }) => unit.includes(cell));
  const fullHouse = containingUnits.find(({ unit }) => {
    const filled = unit.map((candidate) => grid[candidate]).filter(Boolean);
    const missing = DIGITS.filter((digit) => !filled.includes(digit));
    return unit.filter((candidate) => grid[candidate] === 0).length === 1 &&
      new Set(filled).size === filled.length && missing.length === 1 && missing[0] === value;
  });
  if (fullHouse) {
    return {
      rule: 'full-house',
      ruleLabel: 'Full house',
      explanation: `${target} is the only empty cell in ${unitName(fullHouse.index)}, so ${value} is the missing digit.`,
      contextCells: fullHouse.unit.filter((candidate) => candidate !== cell)
    };
  }

  const candidates = candidatesFor(grid, cell);
  if (candidates.length === 1 && candidates[0] === value) {
    return {
      rule: 'naked-single',
      ruleLabel: 'Naked single',
      explanation: `The row, column, and box leave ${value} as the only legal candidate for ${target}.`,
      contextCells: PEERS[cell]
    };
  }

  const hiddenSingle = containingUnits.find(({ unit }) => {
    if (unit.some((candidate) => grid[candidate] === value)) return false;
    return unit.filter((candidate) => candidatesFor(grid, candidate).includes(value)).length === 1;
  });
  if (hiddenSingle) {
    return {
      rule: 'hidden-single',
      ruleLabel: 'Hidden single',
      explanation: `${target} is the only cell in ${unitName(hiddenSingle.index)} that can contain ${value}.`,
      contextCells: hiddenSingle.unit.filter((candidate) => candidate !== cell)
    };
  }

  const logical = nextLogicalStep(serializeGrid(grid));
  if (logical?.cell === cell && logical.value === value) {
    const ruleLabel = TECHNIQUE_LABELS[logical.technique];
    return {
      rule: logical.technique,
      ruleLabel,
      explanation: `${ruleLabel} proves that ${value} belongs at ${target}. The highlighted cells are the supporting pattern found in the pre-move board.`,
      contextCells: (logical.relatedCells ?? []).filter((candidate) => candidate !== cell)
    };
  }

  return {
    rule: 'recorded-placement',
    ruleLabel: 'Recorded placement',
    explanation: `${value} is correct at ${target}, but the event history records the move rather than the player's reasoning, so no specific rule can be proven for this step.`,
    contextCells: PEERS[cell]
  };
}

type WalkthroughEvent = Extract<SudokuEvent, { type:
  | 'game/started'
  | 'game/imported'
  | 'cell/value-entered'
  | 'cell/value-erased'
  | 'cell/note-toggled'
  | 'cell/notes-filled'
  | 'cell/cleared'
  | 'hint/revealed'
  | 'move/undone'
  | 'move/redone'
  | 'game/restarted'
}>;

const walkable = (event: SudokuEvent): event is WalkthroughEvent =>
  event.type === 'game/started' ||
  event.type === 'game/imported' ||
  event.type === 'cell/value-entered' ||
  event.type === 'cell/value-erased' ||
  event.type === 'cell/note-toggled' ||
  event.type === 'cell/notes-filled' ||
  event.type === 'cell/cleared' ||
  event.type === 'hint/revealed' ||
  event.type === 'move/undone' ||
  event.type === 'move/redone' ||
  event.type === 'game/restarted';

function actionStep(
  event: Exclude<SudokuEvent, { type: 'settings/changed' | 'game/started' | 'game/imported' | 'game/paused' | 'game/resumed' | 'game/abandoned' }>,
  before: GameProjection,
  after: GameProjection,
  eventsById: ReadonlyMap<string, SudokuEvent>
): Omit<WalkthroughStep, 'eventId' | 'elapsedMs' | 'game'> {
  if (event.type === 'cell/value-entered') {
    const detail = placementExplanation(before, event.payload.cell, event.payload.value);
    return {
      ...detail,
      action: describeMove(event),
      targetCell: event.payload.cell,
      explanation: `${detail.explanation}${after.status === 'complete' ? ' This placement completed the puzzle.' : ''}`
    };
  }
  if (event.type === 'hint/revealed') {
    return {
      rule: 'hint', ruleLabel: 'Revealed hint', action: describeMove(event), targetCell: event.payload.cell,
      contextCells: PEERS[event.payload.cell],
      explanation: `The app revealed ${event.payload.value} at ${cellName(event.payload.cell)}. This is recorded as a hint rather than a player-derived rule.`
    };
  }
  if (event.type === 'cell/note-toggled') {
    const logical = !event.payload.enabled
      ? nextLogicalStep(serializeGrid(boardFor(before)))
      : null;
    if (logical?.eliminated?.some((removal) =>
      removal.cell === event.payload.cell && removal.value === event.payload.value
    )) {
      const ruleLabel = TECHNIQUE_LABELS[logical.technique];
      return {
        rule: logical.technique,
        ruleLabel,
        action: describeMove(event),
        targetCell: event.payload.cell,
        contextCells: (logical.relatedCells ?? []).filter((candidate) => candidate !== event.payload.cell),
        explanation: `${ruleLabel} removes ${event.payload.value} from ${cellName(event.payload.cell)}. The highlighted cells form the pattern that proves this candidate cannot remain.`
      };
    }
    return {
      rule: event.payload.enabled ? 'candidate-added' : 'candidate-removed',
      ruleLabel: event.payload.enabled ? 'Candidate added' : 'Candidate removed',
      action: describeMove(event), targetCell: event.payload.cell, contextCells: [],
      explanation: `${event.payload.value} was ${event.payload.enabled ? 'added to' : 'removed from'} the candidates at ${cellName(event.payload.cell)}. The history does not claim which elimination rule motivated that note change.`
    };
  }
  if (event.type === 'cell/notes-filled') {
    return {
      rule: 'candidates-filled', ruleLabel: 'Candidates filled', action: describeMove(event),
      targetCell: event.payload.cell, contextCells: PEERS[event.payload.cell],
      explanation: `The available candidates were written into ${cellName(event.payload.cell)} as one recorded action.`
    };
  }
  if (event.type === 'cell/cleared' || event.type === 'cell/value-erased') {
    return {
      rule: 'correction', ruleLabel: 'Correction', action: describeMove(event),
      targetCell: event.payload.cell, contextCells: PEERS[event.payload.cell],
      explanation: `${cellName(event.payload.cell)} was cleared, returning the solve to the board shown here.`
    };
  }
  if (event.type === 'game/restarted') {
    return {
      rule: 'restart', ruleLabel: 'Restart', action: describeMove(event), targetCell: null,
      contextCells: [], explanation: 'The player reset every editable cell and began the attempt again from its givens.'
    };
  }

  const target = eventsById.get(event.payload.targetEventId);
  const targetAction = target && walkable(target) &&
    target.type !== 'game/started' && target.type !== 'game/imported' &&
    target.type !== 'move/undone' && target.type !== 'move/redone'
    ? describeMove(target as ReversibleEvent)
    : 'the previous action';
  const targetCell = target && 'cell' in target.payload && typeof target.payload.cell === 'number'
    ? target.payload.cell
    : null;
  return {
    rule: event.type === 'move/undone' ? 'undo' : 'redo',
    ruleLabel: event.type === 'move/undone' ? 'Undo' : 'Redo',
    action: `${event.type === 'move/undone' ? 'Undid' : 'Redid'} ${targetAction}`,
    targetCell,
    contextCells: targetCell === null ? [] : PEERS[targetCell],
    explanation: `The player ${event.type === 'move/undone' ? 'stepped back from' : 'restored'} ${targetAction.toLowerCase()}.`
  };
}

export function buildSolveWalkthrough(events: readonly SudokuEvent[], gameId: string): SolveWalkthrough {
  const steps: WalkthroughStep[] = [];
  const eventsById = new Map(events.map((event) => [event.id, event]));

  events.forEach((event, index) => {
    if (event.gameId !== gameId || !walkable(event)) return;
    const after = replay(events.slice(0, index + 1)).games[gameId];
    if (!after) return;

    if (event.type === 'game/started' || event.type === 'game/imported') {
      steps.push({
        eventId: event.id,
        rule: 'starting-position',
        ruleLabel: event.type === 'game/imported' && event.payload.checkpoint ? 'Transferred position' : 'Starting position',
        action: event.type === 'game/imported' && event.payload.checkpoint ? 'Loaded transferred progress' : 'Opened the puzzle',
        explanation: event.type === 'game/imported' && event.payload.checkpoint
          ? 'The walkthrough begins with the values and notes that arrived in the transferred checkpoint.'
          : 'Begin with the givens. No player-entered values have been added yet.',
        targetCell: null,
        contextCells: [],
        elapsedMs: event.elapsedMs,
        game: after
      });
      return;
    }

    const before = replay(events.slice(0, index)).games[gameId];
    if (!before) return;
    const detail = actionStep(event, before, after, eventsById);
    steps.push({ eventId: event.id, elapsedMs: event.elapsedMs, game: after, ...detail });
  });

  return { gameId, steps };
}
