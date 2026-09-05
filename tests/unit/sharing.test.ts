import { describe, expect, it } from 'vitest';
import {
  coalescePuzzleWork,
  parseSharedPuzzlePayload,
  puzzleUrl,
  SharedPuzzleError,
  validateSharedPuzzle
} from '../../src/lib/sharing/puzzle-link';

const GIVENS = '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79';
const SOLUTION = '534678912672195348198342567859761423426853791713924856961537284287419635345286179';
const INVALID: Array<[SharedPuzzleError['code'], string]> = [
  ['format', `${GIVENS.slice(0, 80)}x`],
  ['clue-count', '.'.repeat(81)],
  ['duplicate-givens', `55${GIVENS.slice(2)}`]
];

describe('shared puzzle links', () => {
  it('derives and rates the one unique solution without trusting URL metadata', async () => {
    const first = await validateSharedPuzzle(GIVENS);
    const second = await validateSharedPuzzle(GIVENS);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      clueCount: 30,
      work: [],
      filledCount: 0,
      notedCellCount: 0,
      puzzle: {
        givens: GIVENS,
        solution: SOLUTION,
        validatorVersion: 3,
        provenance: { kind: 'puzzle-link', formatVersion: 1 }
      }
    });
    expect(first.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each(INVALID)('rejects %s errors before import', async (code, givens) => {
    await expect(validateSharedPuzzle(givens)).rejects.toMatchObject({ code } satisfies Partial<SharedPuzzleError>);
  });

  it('rejects a structurally valid puzzle with multiple solutions', async () => {
    const ambiguous = [...SOLUTION].map((value) => value === '1' || value === '2' ? '.' : value).join('');
    await expect(validateSharedPuzzle(ambiguous)).rejects.toMatchObject({ code: 'multiple-solutions' });
  });

  it('builds a canonical base-path-safe puzzle URL', () => {
    expect(puzzleUrl('https://example.test/sudoku/pr5/?old=1&view=walkthrough#stale', GIVENS)).toBe(
      `https://example.test/sudoku/pr5/?p=${GIVENS}`
    );
  });

  it('parses placements and ordered candidate edits after the givens', async () => {
    const payload = `${GIVENS}_134_14+189+_14-1-`;
    const parsed = parseSharedPuzzlePayload(payload);
    const validated = await validateSharedPuzzle(payload);

    expect(parsed.values[2]).toBe(4);
    expect(parsed.notes[3]).toEqual([8, 9]);
    expect(validated).toMatchObject({
      filledCount: 1,
      notedCellCount: 1,
      puzzle: { provenance: { kind: 'puzzle-link', formatVersion: 2 } }
    });
    expect(validated.work).toEqual([
      { type: 'value', cell: 2, value: 4 },
      { type: 'notes', cell: 3, values: [1, 8, 9], enabled: true },
      { type: 'notes', cell: 3, values: [1], enabled: false }
    ]);
  });

  it('parses optional time, hint, mistake, and setting directives as format version 3', async () => {
    const payload = `${GIVENS}_134_time=75432_hints=13_mistakes=2_settings=1-0--0--`;
    const parsed = parseSharedPuzzlePayload(payload);
    const validated = await validateSharedPuzzle(payload);

    expect(parsed.metadata).toEqual({
      elapsedMs: 75_432,
      hintedCells: [2],
      mistakes: 2,
      settings: { checkMistakes: true, showTimer: false, notesBold: false }
    });
    expect(validated).toMatchObject({
      metadata: parsed.metadata,
      puzzle: { provenance: { kind: 'puzzle-link', formatVersion: 3 } }
    });
  });

  it('allows progress metadata independently of board work', async () => {
    const validated = await validateSharedPuzzle(`${GIVENS}_time=5000_hints=13`);

    expect(validated).toMatchObject({
      work: [],
      metadata: { elapsedMs: 5_000, hintedCells: [2] },
      puzzle: { provenance: { kind: 'puzzle-link', formatVersion: 3 } }
    });
  });

  it.each([
    `${GIVENS}_time=1_time=2`,
    `${GIVENS}_future=1`,
    `${GIVENS}_settings=01x10111`,
    `${GIVENS}_settings=--------`,
    `${GIVENS}_134_hints=11`,
    `${GIVENS}_hints=13,13`
  ])('rejects invalid shared metadata: %s', async (payload) => {
    await expect(validateSharedPuzzle(payload)).rejects.toMatchObject({ code: 'metadata-format' });
  });

  it.each([
    `${GIVENS}_`,
    `${GIVENS}_14+11+`,
    `${GIVENS}_111`,
    `${GIVENS}_134_13+2+`
  ])('rejects malformed or impossible shared work: %s', async (payload) => {
    await expect(validateSharedPuzzle(payload)).rejects.toMatchObject({ code: 'work-format' });
  });

  it('coalesces consecutive note edits and URL-encodes their plus signs', () => {
    const work = coalescePuzzleWork([
      { type: 'notes', cell: 3, values: [8], enabled: true },
      { type: 'notes', cell: 3, values: [9, 4], enabled: true },
      { type: 'notes', cell: 3, values: [1], enabled: false },
      { type: 'value', cell: 2, value: 4 }
    ]);
    const url = puzzleUrl('https://example.test/sudoku/pr5/?old=1#stale', GIVENS, work);

    expect(work).toEqual([
      { type: 'notes', cell: 3, values: [4, 8, 9], enabled: true },
      { type: 'notes', cell: 3, values: [1], enabled: false },
      { type: 'value', cell: 2, value: 4 }
    ]);
    expect(url).toContain('14%2B489%2B');
    expect(new URL(url).searchParams.get('p')).toBe(`${GIVENS}_14+489+_14-1-_134`);
  });

  it('writes shared metadata in a stable readable order', () => {
    const url = puzzleUrl('https://example.test/sudoku/', GIVENS, [
      { type: 'value', cell: 2, value: 4 }
    ], {
      elapsedMs: 75_432,
      hintedCells: [2],
      mistakes: 2,
      settings: { showTimer: false, checkMistakes: true }
    });

    expect(url).toContain('time%3D75432_hints%3D13_mistakes%3D2_settings%3D1-0-----');
    expect(new URL(url).searchParams.get('p')).toBe(
      `${GIVENS}_134_time=75432_hints=13_mistakes=2_settings=1-0-----`
    );
  });
});
