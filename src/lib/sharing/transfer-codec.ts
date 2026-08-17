import { givensAgree, isSolvedGrid, parseGrid } from '$lib/domain/sudoku';
import type {
  Digit,
  GameProjection,
  GameSettings,
  ImportedCheckpoint,
  PuzzleDefinition
} from '$lib/domain/types';
import { validateSharedPuzzle } from './puzzle-link';

const MAGIC = [0x53, 0x44, 0x01] as const;
const TRANSFER_ID_BYTES = 12;
const FIXED_BITS = 81 * 4 + 81 * 4 + 81 * 9 + 81;
const FIXED_BYTES = Math.ceil(FIXED_BITS / 8);
const MAX_DECODED_BYTES = 512;
const MAX_ENCODED_LENGTH = 768;
const MAX_ELAPSED_MS = 365 * 24 * 60 * 60 * 1_000;
const MAX_COUNTER = 1_000_000;

export interface TransferRecord {
  transferId: string;
  givens: string;
  values: Array<Digit | null>;
  notes: Digit[][];
  hintedCells: number[];
  elapsedMs: number;
  hints: number;
  mistakes: number;
  settings: GameSettings;
  paused: true;
}

export interface ValidatedTransfer {
  transferId: string;
  puzzle: PuzzleDefinition;
  checkpoint: ImportedCheckpoint;
  settings: GameSettings;
}

class BitWriter {
  private bytes: number[] = [];
  private bit = 0;

  write(value: number, width: number): void {
    for (let offset = width - 1; offset >= 0; offset -= 1) {
      if (this.bit % 8 === 0) this.bytes.push(0);
      if ((value >> offset) & 1) this.bytes[this.bytes.length - 1] |= 1 << (7 - (this.bit % 8));
      this.bit += 1;
    }
  }

  finish(): number[] { return this.bytes; }
}

class BitReader {
  private bit = 0;
  constructor(private readonly bytes: Uint8Array) {}

  read(width: number): number {
    let value = 0;
    for (let offset = 0; offset < width; offset += 1) {
      if (this.bit >= this.bytes.length * 8) throw new Error('Transfer payload is truncated.');
      value = (value << 1) | ((this.bytes[Math.floor(this.bit / 8)] >> (7 - (this.bit % 8))) & 1);
      this.bit += 1;
    }
    return value;
  }

  assertZeroPadding(): void {
    while (this.bit < this.bytes.length * 8) {
      if (this.read(1) !== 0) throw new Error('Transfer payload has invalid padding.');
    }
  }
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeVarint(output: number[], value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Transfer counter is invalid.');
  let remaining = value;
  do {
    const byte = remaining % 128;
    remaining = Math.floor(remaining / 128);
    output.push(byte | (remaining ? 0x80 : 0));
  } while (remaining);
}

function readVarint(bytes: Uint8Array, cursor: { value: number }): number {
  let result = 0;
  let multiplier = 1;
  for (let index = 0; index < 8; index += 1) {
    if (cursor.value >= bytes.length) throw new Error('Transfer payload is truncated.');
    const byte = bytes[cursor.value++];
    result += (byte & 0x7f) * multiplier;
    if ((byte & 0x80) === 0) {
      if (!Number.isSafeInteger(result)) throw new Error('Transfer counter is too large.');
      return result;
    }
    multiplier *= 128;
  }
  throw new Error('Transfer counter is too large.');
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function base64UrlToBytes(encoded: string): Uint8Array {
  if (!encoded || encoded.length > MAX_ENCODED_LENGTH || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
    throw new Error('Transfer payload format is invalid.');
  }
  const padded = encoded.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - encoded.length % 4) % 4);
  let binary: string;
  try { binary = atob(padded); }
  catch { throw new Error('Transfer payload format is invalid.'); }
  if (binary.length > MAX_DECODED_BYTES) throw new Error('Transfer payload is too large.');
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function transferIdBytes(transferId: string): number[] {
  if (!/^[0-9a-f]{24}$/.test(transferId)) throw new Error('Transfer ID is invalid.');
  return Array.from({ length: TRANSFER_ID_BYTES }, (_, index) =>
    Number.parseInt(transferId.slice(index * 2, index * 2 + 2), 16)
  );
}

const digitValue = (value: Digit | null): number => value ?? 0;

function validateRecord(record: TransferRecord): void {
  if (!/^[1-9.]{81}$/.test(record.givens)) throw new Error('Transfer givens are invalid.');
  if (record.values.length !== 81 || record.notes.length !== 81) throw new Error('Transfer board size is invalid.');
  if (!record.paused) throw new Error('A transferred puzzle must be paused.');
  if (!Number.isSafeInteger(record.elapsedMs) || record.elapsedMs < 0 || record.elapsedMs > MAX_ELAPSED_MS) throw new Error('Transfer elapsed time is invalid.');
  if (![record.hints, record.mistakes].every((value) => Number.isSafeInteger(value) && value >= 0 && value <= MAX_COUNTER)) throw new Error('Transfer counters are invalid.');
  const hinted = new Set(record.hintedCells);
  if (hinted.size !== record.hintedCells.length || [...hinted].some((cell) => !Number.isInteger(cell) || cell < 0 || cell >= 81)) throw new Error('Transfer hint cells are invalid.');
  for (let cell = 0; cell < 81; cell += 1) {
    const value = record.values[cell];
    const notes = record.notes[cell];
    if (value !== null && (!Number.isInteger(value) || value < 1 || value > 9)) throw new Error('Transfer value is invalid.');
    if (!Array.isArray(notes) || new Set(notes).size !== notes.length || notes.some((note) => !Number.isInteger(note) || note < 1 || note > 9)) throw new Error('Transfer notes are invalid.');
    if (record.givens[cell] !== '.' && (value !== null || notes.length)) throw new Error('Transfer data edits a fixed given.');
    if (value !== null && notes.length) throw new Error('Transfer notes occur on a filled cell.');
  }
}

export function encodeTransfer(record: TransferRecord): string {
  validateRecord(record);
  const writer = new BitWriter();
  for (const value of record.givens) writer.write(value === '.' ? 0 : Number(value), 4);
  for (const value of record.values) writer.write(digitValue(value), 4);
  for (const notes of record.notes) {
    const mask = notes.reduce((value, digit) => value | (1 << (digit - 1)), 0);
    writer.write(mask, 9);
  }
  const hinted = new Set(record.hintedCells);
  for (let cell = 0; cell < 81; cell += 1) writer.write(hinted.has(cell) ? 1 : 0, 1);

  const output = [...MAGIC, ...transferIdBytes(record.transferId), ...writer.finish()];
  writeVarint(output, record.elapsedMs);
  writeVarint(output, record.hints);
  writeVarint(output, record.mistakes);
  const settings = record.settings;
  output.push(
    (settings.checkMistakes ? 1 : 0) |
    (settings.autoRemoveNotes ? 2 : 0) |
    (settings.showTimer ? 4 : 0) |
    (settings.numberFirst ? 8 : 0) |
    16
  );
  const checksum = crc32(Uint8Array.from(output));
  output.push((checksum >>> 24) & 0xff, (checksum >>> 16) & 0xff, (checksum >>> 8) & 0xff, checksum & 0xff);
  return bytesToBase64Url(Uint8Array.from(output));
}

export function decodeTransfer(encoded: string): TransferRecord {
  const bytes = base64UrlToBytes(encoded);
  if (bytes.length < MAGIC.length + TRANSFER_ID_BYTES + FIXED_BYTES + 8) throw new Error('Transfer payload is truncated.');
  const body = bytes.slice(0, -4);
  const storedCrc = ((bytes.at(-4) as number) * 0x1000000) + ((bytes.at(-3) as number) << 16) + ((bytes.at(-2) as number) << 8) + (bytes.at(-1) as number);
  if (crc32(body) !== storedCrc >>> 0) throw new Error('Transfer payload checksum does not match.');
  if (MAGIC.some((value, index) => body[index] !== value)) throw new Error('Transfer payload version is unsupported.');
  const idStart = MAGIC.length;
  const transferId = [...body.slice(idStart, idStart + TRANSFER_ID_BYTES)]
    .map((value) => value.toString(16).padStart(2, '0')).join('');
  const fixedStart = idStart + TRANSFER_ID_BYTES;
  const reader = new BitReader(body.slice(fixedStart, fixedStart + FIXED_BYTES));
  const givens = Array.from({ length: 81 }, () => reader.read(4)).map((value) => value ? String(value) : '.').join('');
  const values = Array.from({ length: 81 }, () => reader.read(4)).map((value) => value ? value as Digit : null);
  const notes = Array.from({ length: 81 }, () => {
    const mask = reader.read(9);
    return Array.from({ length: 9 }, (_, index) => index + 1 as Digit).filter((digit) => mask & (1 << (digit - 1)));
  });
  const hintedCells = Array.from({ length: 81 }, (_, cell) => reader.read(1) ? cell : -1).filter((cell) => cell >= 0);
  reader.assertZeroPadding();

  const cursor = { value: fixedStart + FIXED_BYTES };
  const elapsedMs = readVarint(body, cursor);
  const hints = readVarint(body, cursor);
  const mistakes = readVarint(body, cursor);
  if (cursor.value !== body.length - 1) throw new Error('Transfer payload has trailing data.');
  const flags = body[cursor.value];
  if ((flags & 0xe0) !== 0 || (flags & 16) === 0) throw new Error('Transfer flags are invalid.');
  const record: TransferRecord = {
    transferId,
    givens,
    values,
    notes,
    hintedCells,
    elapsedMs,
    hints,
    mistakes,
    paused: true,
    settings: {
      checkMistakes: !!(flags & 1),
      autoRemoveNotes: !!(flags & 2),
      showTimer: !!(flags & 4),
      numberFirst: !!(flags & 8)
    }
  };
  validateRecord(record);
  return record;
}

export async function validateTransfer(encoded: string): Promise<ValidatedTransfer> {
  const record = decodeTransfer(encoded);
  const shared = await validateSharedPuzzle(record.givens);
  for (const cell of record.hintedCells) {
    if (record.values[cell] !== Number(shared.puzzle.solution[cell])) throw new Error('A transferred hint does not match the puzzle solution.');
  }
  if (!isSolvedGrid(parseGrid(shared.puzzle.solution)) || !givensAgree(record.givens, shared.puzzle.solution)) throw new Error('Transfer solution validation failed.');
  return {
    transferId: record.transferId,
    puzzle: {
      ...shared.puzzle,
      provenance: { kind: 'progress-transfer', formatVersion: 1, fingerprint: shared.fingerprint }
    },
    checkpoint: {
      values: record.values,
      notes: record.notes,
      hintedCells: record.hintedCells,
      elapsedMs: record.elapsedMs,
      hints: record.hints,
      mistakes: record.mistakes,
      paused: true
    },
    settings: record.settings
  };
}

export function checkpointFromGame(game: GameProjection): TransferRecord {
  if (!game.paused || game.status !== 'active') throw new Error('Pause an active puzzle before preparing a transfer.');
  return {
    transferId: '',
    givens: game.puzzle.givens,
    values: [...game.values],
    notes: game.notes.map((notes) => [...notes]),
    hintedCells: [...game.hintedCells],
    elapsedMs: game.elapsedMs,
    hints: game.hints,
    mistakes: game.mistakes,
    settings: { ...game.settings },
    paused: true
  };
}

export function transferUrl(base: string | URL, encoded: string): string {
  decodeTransfer(encoded);
  const url = new URL(base);
  url.search = '';
  url.hash = new URLSearchParams({ t: encoded }).toString();
  return url.toString();
}
