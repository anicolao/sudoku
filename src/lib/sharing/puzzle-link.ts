import { UNITS, givensAgree, isSolvedGrid, parseGrid } from '$lib/domain/sudoku';
import type {
  Digit,
  GameProjection,
  ImportedPuzzleWorkAction,
  PuzzleDefinition,
  PuzzleRating
} from '$lib/domain/types';
import { solveLogically } from '$lib/generator/logical-solver';
import { countSolutions, solveFirst } from '$lib/generator/solve';

export type SharedPuzzleErrorCode =
  | 'format'
  | 'work-format'
  | 'clue-count'
  | 'duplicate-givens'
  | 'no-solution'
  | 'multiple-solutions';

export class SharedPuzzleError extends Error {
  constructor(readonly code: SharedPuzzleErrorCode, message: string) {
    super(message);
    this.name = 'SharedPuzzleError';
  }
}

export interface SharedPuzzleValidation {
  puzzle: PuzzleDefinition;
  clueCount: number;
  fingerprint: string;
  work: ImportedPuzzleWorkAction[];
  filledCount: number;
  notedCellCount: number;
}

const MAX_SHARED_PUZZLE_LENGTH = 4_096;
const MAX_WORK_ACTIONS = 512;

function assertStructure(givens: string): number[] {
  if (!/^[1-9.]{81}$/.test(givens)) {
    throw new SharedPuzzleError('format', 'A shared puzzle must contain exactly 81 digits or dots.');
  }
  const grid = parseGrid(givens);
  const clueCount = grid.filter(Boolean).length;
  if (clueCount < 17 || clueCount > 80) {
    throw new SharedPuzzleError('clue-count', 'A playable shared puzzle must contain 17 to 80 givens.');
  }
  if (UNITS.some((unit) => {
    const values = unit.map((cell) => grid[cell]).filter(Boolean);
    return values.length !== new Set(values).size;
  })) {
    throw new SharedPuzzleError('duplicate-givens', 'The shared givens contain a row, column, or box duplicate.');
  }
  return grid;
}

async function fingerprint(givens: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(givens));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

const cellFromCoordinates = (row: string, column: string): number =>
  (Number(row) - 1) * 9 + Number(column) - 1;

const coordinatesFor = (cell: number): string =>
  `${Math.floor(cell / 9) + 1}${(cell % 9) + 1}`;

function parseWorkToken(token: string): ImportedPuzzleWorkAction {
  if (/^[1-9]{3}$/.test(token)) {
    return {
      type: 'value',
      cell: cellFromCoordinates(token[0], token[1]),
      value: Number(token[2]) as Digit
    };
  }
  const note = token.match(/^([1-9])([1-9])([+-])([1-9]{1,9})\3$/);
  if (!note) throw new SharedPuzzleError('work-format', `Invalid shared work action: ${token || '(empty)'}.`);
  const values = [...note[4]].map(Number) as Digit[];
  if (new Set(values).size !== values.length) {
    throw new SharedPuzzleError('work-format', 'A shared note action cannot repeat a candidate.');
  }
  return {
    type: 'notes',
    cell: cellFromCoordinates(note[1], note[2]),
    values,
    enabled: note[3] === '+'
  };
}

function applyWork(givens: string, work: readonly ImportedPuzzleWorkAction[]): {
  values: Array<Digit | null>;
  notes: Digit[][];
} {
  if (work.length > MAX_WORK_ACTIONS) {
    throw new SharedPuzzleError('work-format', 'A shared puzzle contains too many work actions.');
  }
  const values = Array<Digit | null>(81).fill(null);
  const notes = Array.from({ length: 81 }, () => [] as Digit[]);
  for (const action of work) {
    if (!Number.isInteger(action.cell) || action.cell < 0 || action.cell >= 81 || givens[action.cell] !== '.') {
      throw new SharedPuzzleError('work-format', 'Shared work can edit only empty cells in the initial puzzle.');
    }
    if (action.type === 'value') {
      if (!Number.isInteger(action.value) || action.value < 1 || action.value > 9) {
        throw new SharedPuzzleError('work-format', 'A shared placement must contain one digit from 1 to 9.');
      }
      values[action.cell] = action.value;
      notes[action.cell] = [];
      continue;
    }
    if (!Array.isArray(action.values) || action.values.length === 0 ||
      new Set(action.values).size !== action.values.length ||
      action.values.some((value) => !Number.isInteger(value) || value < 1 || value > 9)) {
      throw new SharedPuzzleError('work-format', 'A shared note action must contain unique candidates from 1 to 9.');
    }
    if (values[action.cell] !== null) {
      throw new SharedPuzzleError('work-format', 'Shared notes cannot edit a cell that already has a placement.');
    }
    const current = new Set(notes[action.cell]);
    action.values.forEach((value) => action.enabled ? current.add(value) : current.delete(value));
    notes[action.cell] = [...current].sort();
  }
  return { values, notes };
}

export function parseSharedPuzzlePayload(payload: string): {
  givens: string;
  work: ImportedPuzzleWorkAction[];
  values: Array<Digit | null>;
  notes: Digit[][];
} {
  if (payload.length > MAX_SHARED_PUZZLE_LENGTH) {
    throw new SharedPuzzleError('work-format', 'This shared puzzle is too long to open safely.');
  }
  const [givens, ...tokens] = payload.split('_');
  assertStructure(givens);
  const work = tokens.map(parseWorkToken);
  const { values, notes } = applyWork(givens, work);
  return { givens, work, values, notes };
}

export function coalescePuzzleWork(
  work: readonly ImportedPuzzleWorkAction[]
): ImportedPuzzleWorkAction[] {
  const coalesced: ImportedPuzzleWorkAction[] = [];
  for (const action of work) {
    const previous = coalesced.at(-1);
    if (action.type === 'notes' && previous?.type === 'notes' &&
      previous.cell === action.cell && previous.enabled === action.enabled) {
      previous.values = [...new Set([...previous.values, ...action.values])].sort();
    } else {
      coalesced.push(action.type === 'value'
        ? { ...action }
        : { ...action, values: [...action.values].sort() });
    }
  }
  return coalesced;
}

export function puzzleWorkFromGame(game: GameProjection): ImportedPuzzleWorkAction[] {
  const work: ImportedPuzzleWorkAction[] = [];
  game.values.forEach((value, cell) => {
    if (value !== null) work.push({ type: 'value', cell, value });
  });
  game.notes.forEach((values, cell) => {
    if (values.length) work.push({ type: 'notes', cell, values: [...values], enabled: true });
  });
  return work;
}

function encodeSharedPuzzlePayload(
  givens: string,
  work: readonly ImportedPuzzleWorkAction[]
): string {
  assertStructure(givens);
  const coalesced = coalescePuzzleWork(work);
  applyWork(givens, coalesced);
  const tokens = coalesced.map((action) => {
    const coordinates = coordinatesFor(action.cell);
    return action.type === 'value'
      ? `${coordinates}${action.value}`
      : `${coordinates}${action.enabled ? '+' : '-'}${action.values.join('')}${action.enabled ? '+' : '-'}`;
  });
  return [givens, ...tokens].join('_');
}

export async function validateSharedPuzzle(payload: string): Promise<SharedPuzzleValidation> {
  const parsed = parseSharedPuzzlePayload(payload);
  const { givens, work, values, notes } = parsed;
  const grid = assertStructure(givens);
  const solutionCount = countSolutions(givens);
  if (solutionCount === 0) throw new SharedPuzzleError('no-solution', 'The shared puzzle has no solution.');
  if (solutionCount !== 1) {
    throw new SharedPuzzleError('multiple-solutions', 'The shared puzzle does not have one unique solution.');
  }
  const solution = solveFirst(givens);
  if (!solution || !isSolvedGrid(parseGrid(solution)) || !givensAgree(givens, solution)) {
    throw new SharedPuzzleError('no-solution', 'The shared puzzle has no valid solution.');
  }
  const logical = solveLogically(givens, { maxDifficulty: 'master' });
  const difficulty: PuzzleRating = logical.solved && logical.grid === solution
    ? logical.difficulty
    : 'custom';
  const digest = await fingerprint(givens);
  const clueCount = grid.filter(Boolean).length;
  return {
    clueCount,
    fingerprint: digest,
    puzzle: {
      id: `shared-${digest.slice(0, 12)}`,
      givens,
      solution,
      difficulty,
      validatorVersion: 3,
      hardestTechnique: difficulty === 'custom' ? null : logical.hardestTechnique,
      provenance: { kind: 'puzzle-link', formatVersion: work.length ? 2 : 1, fingerprint: digest }
    },
    work,
    filledCount: values.filter((value) => value !== null).length,
    notedCellCount: notes.filter((cellNotes) => cellNotes.length > 0).length
  };
}

export function puzzleUrl(
  base: string | URL,
  givens: string,
  work: readonly ImportedPuzzleWorkAction[] = []
): string {
  const url = new URL(base);
  url.search = '';
  url.hash = '';
  url.searchParams.set('p', encodeSharedPuzzlePayload(givens, work));
  return url.toString();
}
