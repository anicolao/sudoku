import { describe, expect, it } from 'vitest';
import { puzzleUrl, SharedPuzzleError, validateSharedPuzzle } from '../../src/lib/sharing/puzzle-link';

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
    expect(puzzleUrl('https://example.test/sudoku/pr5/?old=1#stale', GIVENS)).toBe(
      `https://example.test/sudoku/pr5/?p=${GIVENS}`
    );
  });
});
