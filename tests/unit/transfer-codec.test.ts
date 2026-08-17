import { describe, expect, it } from 'vitest';
import type { Digit } from '../../src/lib/domain/types';
import {
  decodeTransfer,
  encodeTransfer,
  transferUrl,
  validateTransfer,
  type TransferRecord
} from '../../src/lib/sharing/transfer-codec';

const GIVENS = '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79';
const SOLUTION = '534678912672195348198342567859761423426853791713924856961537284287419635345286179';

function record(): TransferRecord {
  const values = Array<Digit | null>(81).fill(null);
  const notes = Array.from({ length: 81 }, () => [] as Digit[]);
  values[2] = 4;
  notes[3] = [2, 6];
  values[5] = 8;
  return {
    transferId: '00112233445566778899aabb',
    givens: GIVENS,
    values,
    notes,
    hintedCells: [5],
    elapsedMs: 75_432,
    hints: 1,
    mistakes: 2,
    settings: {
      checkMistakes: true,
      autoRemoveNotes: false,
      showTimer: true,
      numberFirst: false
    },
    paused: true
  };
}

describe('progress transfer codec', () => {
  it('round-trips the stable, bounded V1 binary representation', () => {
    const encoded = encodeTransfer(record());
    expect(encoded.length).toBeLessThan(500);
    expect(decodeTransfer(encoded)).toEqual(record());
    expect(encoded).toBe('U0QBABEiM0RVZneImaq7UwBwAAYAGVAACYAABggABgADQAgDABcAAgAGBgAAKAAAQZAFAACAB5AEAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAiAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAAAAAAAAAAqM0EAQIVul8mjQ');
  });

  it('rejects data corrupted after encoding', () => {
    const encoded = encodeTransfer(record());
    const replacement = encoded.at(-1) === 'A' ? 'B' : 'A';
    expect(() => decodeTransfer(`${encoded.slice(0, -1)}${replacement}`)).toThrow(/checksum/);
  });

  it('revalidates the puzzle and hinted values instead of transferring a solution', async () => {
    const validated = await validateTransfer(encodeTransfer(record()));
    expect(validated).toMatchObject({
      transferId: record().transferId,
      puzzle: {
        givens: GIVENS,
        solution: SOLUTION,
        provenance: { kind: 'progress-transfer', formatVersion: 1 }
      },
      checkpoint: { elapsedMs: 75_432, hints: 1, mistakes: 2, paused: true },
      settings: record().settings
    });
  });

  it('rejects checkpoint edits to fixed givens', () => {
    const invalid = record();
    invalid.values[0] = 5;
    expect(() => encodeTransfer(invalid)).toThrow(/fixed given/);
  });

  it('rejects a hint counter that disagrees with the hinted-cell mask', () => {
    const invalid = record();
    invalid.hints = 2;
    expect(() => encodeTransfer(invalid)).toThrow(/hint count/);
  });

  it('rejects a hinted value that does not match the locally derived solution', async () => {
    const invalid = record();
    invalid.values[5] = 2;
    await expect(validateTransfer(encodeTransfer(invalid))).rejects.toThrow(/hint/);
  });

  it('builds a canonical base-path-safe fragment URL', () => {
    const encoded = encodeTransfer(record());
    expect(transferUrl('https://example.test/sudoku/pr5/?p=old#stale', encoded)).toBe(
      `https://example.test/sudoku/pr5/#t=${encoded}`
    );
  });
});
