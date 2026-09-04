import { UNITS, givensAgree, isSolvedGrid, parseGrid } from '$lib/domain/sudoku';
import type {
  Digit,
  GameSettings,
  GameProjection,
  ImportedPuzzleMetadata,
  ImportedPuzzleWorkAction,
  PuzzleDefinition,
  PuzzleRating
} from '$lib/domain/types';
import { solveLogically } from '$lib/generator/logical-solver';
import { countSolutions, solveFirst } from '$lib/generator/solve';

export type SharedPuzzleErrorCode =
  | 'format'
  | 'work-format'
  | 'metadata-format'
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
  metadata: ImportedPuzzleMetadata | null;
}

const MAX_SHARED_PUZZLE_LENGTH = 4_096;
const MAX_WORK_ACTIONS = 512;
const MAX_ELAPSED_MS = 365 * 24 * 60 * 60 * 1_000;
const MAX_MISTAKES = 1_000_000;
const SETTING_KEYS = [
  'checkMistakes',
  'autoRemoveNotes',
  'showTimer',
  'numberFirst',
  'notesFirst',
  'notesBold',
  'notesLarge',
  'highlightMatchingNotes'
] as const satisfies readonly (keyof GameSettings)[];
type SharedSettingKey = typeof SETTING_KEYS[number];

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

function parseMetadataToken(
  token: string,
  metadata: ImportedPuzzleMetadata,
  seen: Set<string>
): void {
  const separator = token.indexOf('=');
  if (separator <= 0) {
    throw new SharedPuzzleError('metadata-format', `Invalid shared metadata: ${token || '(empty)'}.`);
  }
  const name = token.slice(0, separator);
  const value = token.slice(separator + 1);
  if (seen.has(name)) {
    throw new SharedPuzzleError('metadata-format', `Shared metadata repeats ${name}.`);
  }
  seen.add(name);
  if (name === 'time') {
    if (!/^\d+$/.test(value) || Number(value) > MAX_ELAPSED_MS) {
      throw new SharedPuzzleError('metadata-format', 'Shared elapsed time is invalid.');
    }
    metadata.elapsedMs = Number(value);
    return;
  }
  if (name === 'mistakes') {
    if (!/^\d+$/.test(value) || Number(value) > MAX_MISTAKES) {
      throw new SharedPuzzleError('metadata-format', 'Shared mistake count is invalid.');
    }
    metadata.mistakes = Number(value);
    return;
  }
  if (name === 'hints') {
    if (!/^[1-9]{2}(,[1-9]{2})*$/.test(value)) {
      throw new SharedPuzzleError('metadata-format', 'Shared hinted cells are invalid.');
    }
    const cells = value.split(',').map((coordinates) => cellFromCoordinates(coordinates[0], coordinates[1]));
    if (new Set(cells).size !== cells.length) {
      throw new SharedPuzzleError('metadata-format', 'Shared hinted cells cannot repeat.');
    }
    metadata.hintedCells = cells;
    return;
  }
  if (name === 'settings') {
    if (!/^[01-]{8}$/.test(value) || !/[01]/.test(value)) {
      throw new SharedPuzzleError('metadata-format', 'Shared settings must contain eight 0, 1, or - values.');
    }
    const settings: Partial<GameSettings> = {};
    value.split('').forEach((setting, index) => {
      if (setting !== '-') settings[SETTING_KEYS[index] as SharedSettingKey] = setting === '1';
    });
    metadata.settings = settings;
    return;
  }
  throw new SharedPuzzleError('metadata-format', `Unknown shared metadata field: ${name}.`);
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
  metadata: ImportedPuzzleMetadata | null;
} {
  if (payload.length > MAX_SHARED_PUZZLE_LENGTH) {
    throw new SharedPuzzleError('work-format', 'This shared puzzle is too long to open safely.');
  }
  const [givens, ...tokens] = payload.split('_');
  assertStructure(givens);
  const work: ImportedPuzzleWorkAction[] = [];
  const metadata: ImportedPuzzleMetadata = {};
  const seenMetadata = new Set<string>();
  for (const token of tokens) {
    if (/^[A-Za-z]/.test(token)) parseMetadataToken(token, metadata, seenMetadata);
    else work.push(parseWorkToken(token));
  }
  const { values, notes } = applyWork(givens, work);
  if (metadata.hintedCells?.some((cell) => givens[cell] !== '.')) {
    throw new SharedPuzzleError('metadata-format', 'Shared hints can target only empty cells in the initial puzzle.');
  }
  return { givens, work, values, notes, metadata: seenMetadata.size ? metadata : null };
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
  work: readonly ImportedPuzzleWorkAction[],
  metadata: ImportedPuzzleMetadata | null
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
  if (metadata) {
    const metadataNames = Object.keys(metadata);
    if (metadataNames.length === 0 ||
      metadataNames.some((name) => !['elapsedMs', 'hintedCells', 'mistakes', 'settings'].includes(name))) {
      throw new SharedPuzzleError('metadata-format', 'Shared metadata is invalid.');
    }
    if (metadata.elapsedMs !== undefined) {
      if (!Number.isSafeInteger(metadata.elapsedMs) || metadata.elapsedMs < 0 || metadata.elapsedMs > MAX_ELAPSED_MS) {
        throw new SharedPuzzleError('metadata-format', 'Shared elapsed time is invalid.');
      }
      tokens.push(`time=${metadata.elapsedMs}`);
    }
    if (metadata.hintedCells !== undefined) {
      if (!Array.isArray(metadata.hintedCells) || metadata.hintedCells.length === 0 ||
        new Set(metadata.hintedCells).size !== metadata.hintedCells.length ||
        metadata.hintedCells.some((cell) => !Number.isInteger(cell) || cell < 0 || cell >= 81 || givens[cell] !== '.')) {
        throw new SharedPuzzleError('metadata-format', 'Shared hinted cells are invalid.');
      }
      tokens.push(`hints=${metadata.hintedCells.map(coordinatesFor).join(',')}`);
    }
    if (metadata.mistakes !== undefined) {
      if (!Number.isSafeInteger(metadata.mistakes) || metadata.mistakes < 0 || metadata.mistakes > MAX_MISTAKES) {
        throw new SharedPuzzleError('metadata-format', 'Shared mistake count is invalid.');
      }
      tokens.push(`mistakes=${metadata.mistakes}`);
    }
    if (metadata.settings !== undefined) {
      if (!metadata.settings || typeof metadata.settings !== 'object' || Array.isArray(metadata.settings)) {
        throw new SharedPuzzleError('metadata-format', 'Shared settings are invalid.');
      }
      const settingNames = Object.keys(metadata.settings);
      if (settingNames.length === 0 || settingNames.some((name) => !(SETTING_KEYS as readonly string[]).includes(name))) {
        throw new SharedPuzzleError('metadata-format', 'Shared settings are invalid.');
      }
      const encodedSettings = SETTING_KEYS.map((key) => {
        const value = metadata.settings?.[key];
        if (value === undefined) return '-';
        if (typeof value !== 'boolean') throw new SharedPuzzleError('metadata-format', `Shared setting ${key} is invalid.`);
        return value ? '1' : '0';
      }).join('');
      tokens.push(`settings=${encodedSettings}`);
    }
    if (tokens.length === coalesced.length) {
      throw new SharedPuzzleError('metadata-format', 'Shared metadata cannot be empty.');
    }
  }
  return [givens, ...tokens].join('_');
}

export async function validateSharedPuzzle(payload: string): Promise<SharedPuzzleValidation> {
  const parsed = parseSharedPuzzlePayload(payload);
  const { givens, work, values, notes, metadata } = parsed;
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
      provenance: { kind: 'puzzle-link', formatVersion: metadata ? 3 : work.length ? 2 : 1, fingerprint: digest }
    },
    work,
    filledCount: values.filter((value) => value !== null).length,
    notedCellCount: notes.filter((cellNotes) => cellNotes.length > 0).length,
    metadata
  };
}

export function puzzleUrl(
  base: string | URL,
  givens: string,
  work: readonly ImportedPuzzleWorkAction[] = [],
  metadata: ImportedPuzzleMetadata | null = null
): string {
  const url = new URL(base);
  url.search = '';
  url.hash = '';
  url.searchParams.set('p', encodeSharedPuzzlePayload(givens, work, metadata));
  return url.toString();
}
