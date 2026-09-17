import type { GameProjection, ImportedPuzzleMetadata, ImportedPuzzleWorkAction } from '$lib/domain/types';
import { buildHumanSolveSequence, type NextSolveHint } from '$lib/domain/walkthrough';
import { puzzleUrl } from '$lib/sharing/puzzle-link';

export interface PrintablePuzzleLinks {
  puzzle: string;
  walkthrough: string;
  sequence: NextSolveHint[];
}

export function printablePuzzleLinks(base: string | URL, game: GameProjection): PrintablePuzzleLinks {
  const sequence = buildHumanSolveSequence(game);
  const work: ImportedPuzzleWorkAction[] = sequence.map(({ targetCell, value }) => ({
    type: 'value',
    cell: targetCell,
    value
  }));
  const metadata: ImportedPuzzleMetadata | null = game.patternCells.length
    ? { patternCells: [...game.patternCells] }
    : null;
  const puzzle = puzzleUrl(base, game.puzzle.givens, [], metadata);
  const walkthroughUrl = new URL(puzzleUrl(base, game.puzzle.givens, work, metadata));
  walkthroughUrl.searchParams.set('view', 'walkthrough');
  return { puzzle, walkthrough: walkthroughUrl.toString(), sequence };
}
