import { describe, expect, it } from 'vitest';
import type { Digit, PuzzleDefinition, SudokuEvent } from '../../src/lib/domain/types';
import { replay } from '../../src/lib/domain/reducer';
import { generateEasyPuzzle } from '../../src/lib/generator/generate-puzzle';
import { printablePuzzleLinks } from '../../src/lib/printing/printable-puzzle';
import { parseSharedPuzzlePayload } from '../../src/lib/sharing/puzzle-link';

const settings = {
  checkMistakes: false,
  autoRemoveNotes: true,
  showTimer: true,
  numberFirst: true,
  notesFirst: false
};

function gameFor(puzzle: PuzzleDefinition) {
  const event: SudokuEvent = {
    id: 'print-start',
    sequence: 1,
    gameId: 'print-game',
    occurredAt: '2026-09-17T12:00:00.000Z',
    elapsedMs: 0,
    schemaVersion: 1,
    reducerVersion: 1,
    type: 'game/started',
    payload: { gameId: 'print-game', puzzle, settings }
  };
  return replay([event]).games['print-game'];
}

describe('printable puzzle links', () => {
  it('pairs a clean puzzle link with a complete walkthrough-directed solution', () => {
    const puzzle = generateEasyPuzzle('print-links-seed').puzzle;
    const game = gameFor(puzzle);
    const patternCells = [...puzzle.givens]
      .flatMap((given, cell) => given === '.' ? [cell] : [])
      .slice(0, 3);
    game.patternCells = patternCells;
    const existingCell = patternCells[0];
    game.values[existingCell] = Number(puzzle.solution[existingCell]) as Digit;

    const links = printablePuzzleLinks('https://example.test/sudoku/?old=state#ignored', game);
    const puzzleUrl = new URL(links.puzzle);
    const walkthroughUrl = new URL(links.walkthrough);
    const clean = parseSharedPuzzlePayload(puzzleUrl.searchParams.get('p') ?? '');
    const walkthrough = parseSharedPuzzlePayload(walkthroughUrl.searchParams.get('p') ?? '');

    expect(puzzleUrl.origin + puzzleUrl.pathname).toBe('https://example.test/sudoku/');
    expect(puzzleUrl.searchParams.has('view')).toBe(false);
    expect(clean).toMatchObject({ givens: puzzle.givens, work: [], metadata: { patternCells } });
    expect(walkthroughUrl.searchParams.get('view')).toBe('walkthrough');
    expect(walkthrough.metadata).toEqual({ patternCells });
    expect(walkthrough.work).toEqual(links.sequence.map(({ targetCell, value }) => ({
      type: 'value', cell: targetCell, value
    })));

    const solved = [...puzzle.givens];
    walkthrough.work.forEach((action) => {
      if (action.type === 'value') solved[action.cell] = String(action.value);
    });
    expect(solved.join('')).toBe(puzzle.solution);
    expect(walkthrough.work).toHaveLength([...puzzle.givens].filter((given) => given === '.').length);
  });
});
