import type { GameProjection, ImportedPuzzleMetadata, ImportedPuzzleWorkAction } from '$lib/domain/types';
import {
  buildHumanSolveSequence,
  buildHumanSolveSequenceAsync,
  type AsyncWalkthroughOptions,
  type NextSolveHint
} from '$lib/domain/walkthrough';
import { puzzleUrl } from '$lib/sharing/puzzle-link';

export interface PrintablePuzzleLinks {
  puzzle: string;
  walkthrough: string;
  sequence: NextSolveHint[];
}

export function printablePuzzleLinks(base: string | URL, game: GameProjection): PrintablePuzzleLinks {
  const sequence = buildHumanSolveSequence(game);
  return printablePuzzleLinksForSequence(base, game, sequence);
}

export async function printablePuzzleLinksAsync(
  base: string | URL,
  game: GameProjection,
  options: AsyncWalkthroughOptions = {}
): Promise<PrintablePuzzleLinks> {
  const sequence = await buildHumanSolveSequenceAsync(game, options);
  return printablePuzzleLinksForSequence(base, game, sequence);
}

function printablePuzzleLinksForSequence(
  base: string | URL,
  game: GameProjection,
  sequence: NextSolveHint[]
): PrintablePuzzleLinks {
  const work: ImportedPuzzleWorkAction[] = sequence.map(({ targetCell, value }) => ({
    type: 'value',
    cell: targetCell,
    value
  }));
  const metadata: ImportedPuzzleMetadata | null = game.patternCells.length
    ? { patternCells: [...game.patternCells] }
    : null;
  const puzzle = puzzleUrl(base, game.puzzle.givens, [], metadata, game.puzzle);
  const walkthroughUrl = new URL(puzzleUrl(base, game.puzzle.givens, game.puzzle.variant === 'killer' ? [] : work, metadata, game.puzzle));
  walkthroughUrl.searchParams.set('view', 'walkthrough');
  return { puzzle, walkthrough: walkthroughUrl.toString(), sequence };
}
