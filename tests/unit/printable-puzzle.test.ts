import { describe, expect, it } from 'vitest';
import type { Digit, PuzzleDefinition, SudokuEvent } from '../../src/lib/domain/types';
import { replay } from '../../src/lib/domain/reducer';
import { generateEasyPuzzle } from '../../src/lib/generator/generate-puzzle';
import {
  printablePuzzleLinks,
  printablePuzzleLinksAsync,
  printablePuzzleLinkVariantsAsync
} from '../../src/lib/printing/printable-puzzle';
import { parseSharedPuzzlePayload } from '../../src/lib/sharing/puzzle-link';
import { basicCandidateNotes, parseGrid } from '../../src/lib/domain/sudoku';

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

  it('can yield between placements while preparing links in the background', async () => {
    const game = gameFor(generateEasyPuzzle('async-print-links-seed').puzzle);
    let yields = 0;
    const links = await printablePuzzleLinksAsync('https://example.test/sudoku/', game, {
      yieldControl: async () => { yields += 1; }
    });

    expect(yields).toBe(links.sequence.length + 1);
    expect(new URL(links.walkthrough).searchParams.get('view')).toBe('walkthrough');
  });

  it('prepares both print variants from one yielded walkthrough analysis', async () => {
    const game = gameFor(generateEasyPuzzle('variant-print-links-seed').puzzle);
    let yields = 0;
    const variants = await printablePuzzleLinkVariantsAsync('https://example.test/sudoku/', game, {
      yieldControl: async () => { yields += 1; }
    });

    expect(yields).toBe(variants.givens.sequence.length + 1);
    expect(variants.candidates.sequence).toBe(variants.givens.sequence);
    expect(variants.candidates.walkthrough).toBe(variants.givens.walkthrough);
  });

  it('puts the immutable starting candidates, rather than current work, in a candidate-sheet QR', () => {
    const game = gameFor(generateEasyPuzzle('candidate-print-links-seed').puzzle);
    const editable = [...game.puzzle.givens].flatMap((given, cell) => given === '.' ? [cell] : []);
    const lastEditable = editable.at(-1) as number;
    game.startingNotes[editable[0]] = [1, 4, 9];
    game.startingNotes[editable[1]] = [2];
    game.startingNotes[lastEditable] = [3, 5, 6, 7, 8];
    game.notes = structuredClone(game.startingNotes);
    game.notes[editable[0]] = [1, 9];
    game.values[editable[1]] = Number(game.puzzle.solution[editable[1]]) as Digit;

    const candidateLinks = printablePuzzleLinks('https://example.test/sudoku/', game, 'candidates');
    const candidatePayload = parseSharedPuzzlePayload(new URL(candidateLinks.puzzle).searchParams.get('p') ?? '');
    const cleanPayload = parseSharedPuzzlePayload(new URL(
      printablePuzzleLinks('https://example.test/sudoku/', game).puzzle
    ).searchParams.get('p') ?? '');

    expect(candidatePayload.values.every((value) => value === null)).toBe(true);
    expect(candidatePayload.notes).toEqual(game.startingNotes);
    expect(candidatePayload.work).toEqual([
      { type: 'notes', cell: editable[0], values: [1, 4, 9], enabled: true },
      { type: 'notes', cell: editable[1], values: [2], enabled: true },
      { type: 'notes', cell: lastEditable, values: [3, 5, 6, 7, 8], enabled: true }
    ]);
    expect(cleanPayload.work).toEqual([]);
  });

  it('uses the compact option for a basic-candidate sheet QR', () => {
    const game = gameFor(generateEasyPuzzle('compact-candidate-print-seed').puzzle);
    game.startingNotes = basicCandidateNotes(parseGrid(game.puzzle.givens));
    game.startingNotesMode = 'basic';

    const link = new URL(printablePuzzleLinks('https://example.test/sudoku/', game, 'candidates').puzzle);
    expect(link.searchParams.get('p')).toBe(game.puzzle.givens);
    expect(link.searchParams.get('givens')).toBe('basic');
    expect(parseSharedPuzzlePayload(link.searchParams.get('p') ?? '', 'basic').notes).toEqual(game.startingNotes);
  });
});
