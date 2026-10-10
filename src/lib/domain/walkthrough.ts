import {
  analyzeLogicalPlacement,
  findLogicalElimination,
  type LogicalStep
} from '$lib/generator/logical-solver';
import { describeMove } from './game-log';
import { replay } from './reducer';
import { DIGITS, PEERS, UNITS, candidatesFor, columnOf, rowOf, serializeGrid } from './sudoku';
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

export interface NextSolveHint extends PlacementExplanation {
  targetCell: number;
  value: Digit;
}

export interface NextVisualHint extends NextSolveHint {
  logicalStep?: LogicalStep;
}

export interface VisualHintCandidateCell {
  cell: number;
  values: Digit[];
  emphasized: Digit[];
  endpoints: Digit[];
  colors: Array<{ value: Digit; parity: 'even' | 'odd' }>;
  excluded: Digit[];
}

export interface VisualHintArrow {
  fromCell: number;
  toCell: number;
  fromValue?: Digit;
  toValue?: Digit;
  kind?: 'conjugate' | 'elimination';
}

export interface SolveHintVisualization {
  rule: WalkthroughRule;
  ruleLabel: string;
  targetCell: number;
  patternCells: number[];
  exclusionCells: number[];
  candidateCells: VisualHintCandidateCell[];
  arrows: VisualHintArrow[];
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

type LogicalLink = NonNullable<LogicalStep['relatedLinks']>[number];
type LogicalColor = NonNullable<LogicalStep['relatedColors']>[number];

interface SimpleColorsProof {
  cells: number[];
  links: LogicalLink[];
  colors: LogicalColor[];
  eliminated: Array<{ cell: number; value: Digit }>;
  conclusionLinks: LogicalLink[];
}

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
  value: Digit,
  techniqueOrder: readonly SolveTechnique[] = BOOK_TECHNIQUE_ORDER,
  includeFullHouse = true,
  notes: readonly (readonly Digit[])[] = game.notes
): PlacementExplanation {
  const target = cellName(cell);
  const grid = boardFor(game);
  const containingUnits = UNITS
    .map((unit, index) => ({ unit, index }))
    .filter(({ unit }) => unit.includes(cell));

  if (value === Number(game.puzzle.solution[cell])) {
    const fullHouse = includeFullHouse ? containingUnits.find(({ unit }) => {
      const filled = unit.map((candidate) => grid[candidate]).filter(Boolean);
      const missing = DIGITS.filter((digit) => !filled.includes(digit));
      return unit.filter((candidate) => grid[candidate] === 0).length === 1 &&
        new Set(filled).size === filled.length && missing.length === 1 && missing[0] === value;
    }) : undefined;
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
      techniqueOrder,
      notes
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
      if (rule === 'x-wing') {
        const eliminated = logical.eliminated?.find((candidate) => candidate.cell === cell);
        const pattern = (logical.relatedCells ?? []).map(cellName).join(', ');
        return {
          rule,
          ruleLabel,
          explanation: eliminated
            ? `The ${eliminated.value} X-Wing at ${pattern} eliminates ${eliminated.value} from ${target}, leaving ${value}.`
            : `The X-Wing at ${pattern} eliminates the other candidate from ${target}, leaving ${value}.`,
          contextCells: (logical.relatedCells ?? []).filter((candidate) => candidate !== cell)
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

export function findNextSolveHint(game: GameProjection): NextSolveHint | null {
  const targets = game.values.flatMap((value, cell) =>
    game.puzzle.givens[cell] === '.' && value === null ? [cell] : []
  );
  if (!targets.length) return null;

  for (const targetCell of targets) {
    const value = Number(game.puzzle.solution[targetCell]) as Digit;
    const detail = placementExplanation(game, targetCell, value, [], true, []);
    if (detail.rule === 'full-house') return { targetCell, value, ...detail };
  }

  for (const technique of BOOK_TECHNIQUE_ORDER) {
    for (const targetCell of targets) {
      const value = Number(game.puzzle.solution[targetCell]) as Digit;
      const detail = placementExplanation(game, targetCell, value, [technique], false, []);
      if (detail.rule !== 'unknown-rule') return { targetCell, value, ...detail };
    }
  }

  const targetCell = targets[0];
  const value = Number(game.puzzle.solution[targetCell]) as Digit;
  return { targetCell, value, ...placementExplanation(game, targetCell, value, [], false, []) };
}

export function findNextVisualHint(game: GameProjection): NextVisualHint | null {
  const placement = findNextSolveHint(game);
  if (!placement || placement.rule !== 'unknown-rule') return placement;

  const logicalStep = findLogicalElimination(
    serializeGrid(boardFor(game)),
    BOOK_TECHNIQUE_ORDER,
    game.notes
  );
  const removal = logicalStep?.eliminated?.[0];
  if (!logicalStep || !removal) return placement;

  const rule = logicalStep.technique as BookTechnique;
  const ruleLabel = RULE_LABELS[rule];
  const contextCells = logicalStep.relatedCells ?? [];
  const removals = logicalStep.eliminated?.map(({ cell, value }) =>
    `${value} from ${cellName(cell)}`
  ).join(', ') ?? '';
  return {
    rule,
    ruleLabel,
    targetCell: removal.cell,
    value: Number(game.puzzle.solution[removal.cell]) as Digit,
    explanation: `${ruleLabel} at ${contextCells.map(cellName).join(', ')} eliminates ${removals}.`,
    contextCells,
    logicalStep
  };
}

function visualHintArrows(
  rule: WalkthroughRule,
  patternCells: readonly number[],
  targetCell: number,
  logical: LogicalStep | null,
  candidatesAt: (cell: number) => Digit[],
  simpleColorsProof: SimpleColorsProof | null
): VisualHintArrow[] {
  const arrows: VisualHintArrow[] = [];
  const add = (
    fromCell: number,
    toCell: number,
    fromValue?: Digit,
    toValue?: Digit,
    kind?: VisualHintArrow['kind']
  ): void => {
    if ((fromCell === toCell && fromValue === toValue) || arrows.some((arrow) =>
      arrow.fromCell === fromCell && arrow.toCell === toCell &&
      arrow.fromValue === fromValue && arrow.toValue === toValue
    )) return;
    arrows.push({ fromCell, toCell, fromValue, toValue, ...(kind ? { kind } : {}) });
  };

  if (rule === 'y-wing' && patternCells.length >= 3) {
    add(patternCells[0], patternCells[1]);
    add(patternCells[0], patternCells[2]);
    add(patternCells[1], targetCell);
    add(patternCells[2], targetCell);
  } else if (rule === 'pointing-pair') {
    patternCells.forEach((cell) => add(cell, targetCell));
  } else if (rule === 'x-wing' || rule === 'swordfish') {
    patternCells.forEach((cell, index) => patternCells.slice(index + 1).forEach((other) => {
      if (rowOf(cell) === rowOf(other) || columnOf(cell) === columnOf(other)) add(cell, other);
    }));
  } else if (rule === 'xy-chain') {
    const endpointValue = logical?.eliminated?.[0]?.value;
    const chainCandidates = patternCells.map(candidatesAt);
    if (endpointValue && chainCandidates.length >= 3 && chainCandidates.every((values) => values.length === 2)) {
      let currentValue = chainCandidates[0].find((value) => value !== endpointValue);
      if (currentValue) {
        add(patternCells[0], patternCells[0], endpointValue, currentValue);
        for (let index = 1; index < patternCells.length && currentValue; index += 1) {
          const previous = patternCells[index - 1];
          const current = patternCells[index];
          const values = chainCandidates[index];
          if (!values.includes(currentValue)) {
            currentValue = undefined;
            break;
          }
          add(previous, current, currentValue, currentValue);
          const outgoing = values.find((value) => value !== currentValue);
          if (!outgoing) {
            currentValue = undefined;
            break;
          }
          add(current, current, currentValue, outgoing);
          currentValue = outgoing;
        }
        if (currentValue === endpointValue) {
          return arrows;
        }
      }
    }
    arrows.length = 0;
    patternCells.slice(1).forEach((cell, index) => add(patternCells[index], cell));
  } else if (rule === 'simple-colors') {
    for (const link of simpleColorsProof?.links ?? []) {
      add(link.fromCell, link.toCell, link.value, link.value, 'conjugate');
    }
    for (const link of simpleColorsProof?.conclusionLinks ?? []) {
      add(link.fromCell, link.toCell, link.value, link.value, 'elimination');
    }
  } else if (rule === 'medusa') {
    patternCells.slice(1).forEach((cell, index) => add(patternCells[index], cell));
  }

  return arrows;
}

function shortestLinkPath(
  links: readonly LogicalLink[],
  start: number,
  finish: number
): number[] | null {
  const adjacency = new Map<number, number[]>();
  for (const { fromCell, toCell } of links) {
    adjacency.set(fromCell, [...(adjacency.get(fromCell) ?? []), toCell]);
    adjacency.set(toCell, [...(adjacency.get(toCell) ?? []), fromCell]);
  }
  const queue: number[][] = [[start]];
  const visited = new Set([start]);
  while (queue.length) {
    const path = queue.shift() as number[];
    const cell = path.at(-1) as number;
    if (cell === finish) return path;
    for (const next of (adjacency.get(cell) ?? []).toSorted((left, right) => left - right)) {
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push([...path, next]);
    }
  }
  return null;
}

function simpleColorsProof(logical: LogicalStep | null, targetCell: number): SimpleColorsProof | null {
  const allLinks = logical?.relatedLinks ?? [];
  const allColors = logical?.relatedColors ?? [];
  const eliminated = logical?.eliminated ?? [];
  if (!allLinks.length || !allColors.length || !eliminated.length) return null;
  const colorByCell = new Map(allColors.map((color) => [color.cell, color]));
  const linkFor = (fromCell: number, toCell: number): LogicalLink | null => {
    const link = allLinks.find((candidate) =>
      (candidate.fromCell === fromCell && candidate.toCell === toCell) ||
      (candidate.fromCell === toCell && candidate.toCell === fromCell)
    );
    return link ? { fromCell, toCell, value: link.value } : null;
  };
  const proofForPath = (
    path: number[],
    removal: { cell: number; value: Digit },
    conclusionLinks: LogicalLink[]
  ): SimpleColorsProof | null => {
    const links = path.slice(1).map((cell, index) => linkFor(path[index], cell));
    if (links.some((link) => link === null)) return null;
    return {
      cells: path,
      links: links as LogicalLink[],
      colors: path.flatMap((cell) => colorByCell.has(cell) ? [colorByCell.get(cell) as LogicalColor] : []),
      eliminated: [removal],
      conclusionLinks
    };
  };
  const proofs: SimpleColorsProof[] = [];

  // Color trap: an uncolored candidate that sees both colors can be removed.
  for (const removal of eliminated) {
    if (colorByCell.has(removal.cell)) continue;
    const witnesses = allColors.filter(({ cell, value }) =>
      value === removal.value && PEERS[removal.cell].includes(cell)
    );
    const even = witnesses.filter(({ color }) => color === 0).toSorted((left, right) => left.cell - right.cell);
    const odd = witnesses.filter(({ color }) => color === 1).toSorted((left, right) => left.cell - right.cell);
    for (const left of even) {
      for (const right of odd) {
        const path = shortestLinkPath(allLinks, left.cell, right.cell);
        if (!path) continue;
        const proof = proofForPath(path, removal, [
          { fromCell: left.cell, toCell: removal.cell, value: removal.value },
          { fromCell: right.cell, toCell: removal.cell, value: removal.value }
        ]);
        if (proof) proofs.push(proof);
      }
    }
  }

  // Color wrap: two candidates of one color see each other, so that color is false.
  for (const color of [0, 1] as const) {
    const cells = allColors.filter((candidate) => candidate.color === color);
    for (let leftIndex = 0; leftIndex < cells.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < cells.length; rightIndex += 1) {
        const left = cells[leftIndex];
        const right = cells[rightIndex];
        if (left.value !== right.value || !PEERS[left.cell].includes(right.cell)) continue;
        const path = shortestLinkPath(allLinks, left.cell, right.cell);
        const removal = eliminated.find(({ cell, value }) => cell === targetCell && value === left.value) ??
          eliminated.find(({ cell, value }) => colorByCell.get(cell)?.color === color && value === left.value);
        if (!path || !removal) continue;
        const proof = proofForPath(path, removal, [
          { fromCell: left.cell, toCell: right.cell, value: left.value }
        ]);
        if (proof) proofs.push(proof);
      }
    }
  }
  return proofs.toSorted((left, right) =>
    left.cells.length - right.cells.length ||
    left.conclusionLinks.length - right.conclusionLinks.length ||
    Number(right.eliminated[0].cell === targetCell) - Number(left.eliminated[0].cell === targetCell) ||
    left.eliminated[0].cell - right.eliminated[0].cell ||
    left.cells[0] - right.cells[0] || left.cells.at(-1)! - right.cells.at(-1)!
  )[0] ?? null;
}

function visualPatternValues(
  rule: WalkthroughRule,
  logical: LogicalStep | null,
  grid: readonly number[],
  patternCells: readonly number[]
): Set<Digit> {
  const eliminated = new Set(logical?.eliminated?.map(({ value }) => value) ?? []);
  if ([
    'pointing-pair', 'x-wing', 'swordfish', 'simple-colors', 'medusa'
  ].includes(rule)) return eliminated;
  if ([
    'naked-pair', 'hidden-pair', 'y-wing', 'naked-triple', 'xy-chain', 'unique-rectangle'
  ].includes(rule)) {
    return new Set(patternCells.flatMap((cell) => candidatesFor(grid, cell)));
  }
  return new Set();
}

export function buildSolveHintVisualization(
  game: GameProjection,
  hint: NextVisualHint
): SolveHintVisualization {
  const grid = boardFor(game);
  const logical = hint.logicalStep ?? (hint.rule === 'full-house' || hint.rule === 'unknown-rule'
    ? null
    : analyzeLogicalPlacement(
        serializeGrid(grid),
        hint.targetCell,
        hint.value,
        [hint.rule as BookTechnique],
        game.notes
      ));
  const colorProof = hint.rule === 'simple-colors' ? simpleColorsProof(logical, hint.targetCell) : null;
  const contextCells = colorProof?.cells ?? (
    hint.rule === 'xy-chain' && logical?.relatedCells?.length ? logical.relatedCells : hint.contextCells
  );
  const patternCells = [...new Set(contextCells)].filter((cell) =>
    hint.rule === 'xy-chain' || cell !== hint.targetCell
  );
  const relatedCandidates = new Map(
    (hint.rule === 'xy-chain' ? logical?.relatedCandidates ?? [] : [])
      .map(({ cell, values }) => [cell, values] as const)
  );
  const relatedColors = new Map(
    (hint.rule === 'simple-colors' ? colorProof?.colors ?? [] : [])
      .map(({ cell, value, color }) => [cell, { value, parity: color === 0 ? 'even' as const : 'odd' as const }] as const)
  );
  const candidatesAt = (cell: number): Digit[] => {
    const related = relatedCandidates.get(cell);
    if (related) return related;
    const legal = candidatesFor(grid, cell);
    const notes = game.notes[cell] ?? [];
    return notes.length && (cell !== hint.targetCell || hint.logicalStep !== undefined)
      ? legal.filter((value) => notes.includes(value))
      : legal;
  };
  const excludedByCell = new Map<number, Set<Digit>>();
  for (const eliminated of colorProof?.eliminated ?? logical?.eliminated ?? []) {
    if (!excludedByCell.has(eliminated.cell)) excludedByCell.set(eliminated.cell, new Set());
    excludedByCell.get(eliminated.cell)?.add(eliminated.value);
  }
  const exclusionCells = hint.rule === 'full-house' || hint.rule === 'naked-single' || hint.rule === 'hidden-single'
    ? patternCells
    : [...excludedByCell.keys()];
  const patternValues = visualPatternValues(hint.rule, logical, grid, patternCells);
  const cellsToAnnotate = new Set([
    ...patternCells,
    ...excludedByCell.keys(),
    hint.targetCell
  ]);
  const candidateCells = [...cellsToAnnotate].flatMap((cell): VisualHintCandidateCell[] => {
    if (grid[cell] !== 0) return [];
    // Direct-placement hints keep their answer hidden by leaving the destination
    // blank. Elimination hints can safely show its complete candidate set: the
    // styling identifies only the eliminated candidate, not the answer.
    if (cell === hint.targetCell && excludedByCell.size === 0) return [];
    const values = candidatesAt(cell);
    const excluded = [...(excludedByCell.get(cell) ?? [])];
    const shown = [...new Set([...values, ...excluded])].sort((left, right) => left - right);
    if (!shown.length) return [];
    const xyEndpointValue = hint.rule === 'xy-chain' ? logical?.eliminated?.[0]?.value : undefined;
    const isXYEndpoint = cell === patternCells[0] || cell === patternCells.at(-1);
    return [{
      cell,
      values: shown,
      emphasized: shown.filter((value) => patternCells.includes(cell) && (
        hint.rule === 'xy-chain' || patternValues.has(value)
      )),
      endpoints: shown.filter((value) => isXYEndpoint && value === xyEndpointValue),
      colors: shown.flatMap((value) => {
        const color = relatedColors.get(cell);
        return color?.value === value ? [color] : [];
      }),
      excluded
    }];
  });

  return {
    rule: hint.rule,
    ruleLabel: hint.ruleLabel,
    targetCell: hint.targetCell,
    patternCells,
    exclusionCells,
    candidateCells,
    arrows: visualHintArrows(hint.rule, patternCells, hint.targetCell, logical, candidatesAt, colorProof)
  };
}

export function buildHumanSolveSequence(game: GameProjection): NextSolveHint[] {
  const solving = humanSolveStart(game);
  const sequence: NextSolveHint[] = [];
  for (let placement = 0; placement < 81; placement += 1) {
    const next = appendNextHumanPlacement(solving, sequence);
    if (!next) return sequence;
  }
  throw new Error('Human solve ordering did not finish within 81 placements.');
}

function humanSolveStart(game: GameProjection): GameProjection {
  return {
    ...game,
    values: Array<Digit | null>(81).fill(null),
    valueSourceEventIds: Array<string | null>(81).fill(null),
    notes: Array.from({ length: 81 }, () => []),
    conflicts: [],
    mistakeCells: [],
    hintedCells: [],
    status: 'active',
    completedAt: null
  };
}

function appendNextHumanPlacement(
  solving: GameProjection,
  sequence: NextSolveHint[]
): NextSolveHint | null {
  const next = findNextSolveHint(solving);
  if (!next) return null;
  sequence.push(next);
  solving.values[next.targetCell] = next.value;
  return next;
}

export async function buildHumanSolveSequenceAsync(
  game: GameProjection,
  options: AsyncWalkthroughOptions = {}
): Promise<NextSolveHint[]> {
  const solving = humanSolveStart(game);
  const sequence: NextSolveHint[] = [];
  const yieldControl = options.yieldControl ?? defaultYield;
  const total = game.puzzle.givens.split('').filter((given) => given === '.').length;
  options.onProgress?.({ completed: 0, total });

  for (let placement = 0; placement < 81; placement += 1) {
    await yieldControl();
    const next = appendNextHumanPlacement(solving, sequence);
    if (!next) return sequence;
    options.onProgress?.({ completed: sequence.length, total });
  }
  throw new Error('Human solve ordering did not finish within 81 placements.');
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
          ? {
              ...event.payload.puzzle.provenance,
              formatVersion: event.payload.sharedMetadata?.patternCells
                ? 4
                : event.payload.sharedMetadata ? 3 : work.length ? 2 : 1
            }
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
