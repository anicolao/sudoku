import type { GameProjection, ImportedPuzzleMetadata, ImportedPuzzleWorkAction } from '$lib/domain/types';
import {
  buildHumanSolveSequence,
  buildHumanSolveSequenceAsync,
  type AsyncWalkthroughOptions,
  type NextSolveHint
} from '$lib/domain/walkthrough';
import { puzzleUrl, puzzleWorkFromNotes } from '$lib/sharing/puzzle-link';

export type PrintablePuzzleKind = 'givens' | 'candidates';

export interface PrintablePuzzleLinks {
  puzzle: string;
  walkthrough: string;
  sequence: NextSolveHint[];
}

export type PrintablePuzzleLinkVariants = Record<PrintablePuzzleKind, PrintablePuzzleLinks>;

export function printablePuzzleLinks(
  base: string | URL,
  game: GameProjection,
  kind: PrintablePuzzleKind = 'givens'
): PrintablePuzzleLinks {
  const sequence = buildHumanSolveSequence(game);
  return printablePuzzleLinksForSequence(base, game, sequence, kind);
}

export async function printablePuzzleLinksAsync(
  base: string | URL,
  game: GameProjection,
  options: AsyncWalkthroughOptions = {},
  kind: PrintablePuzzleKind = 'givens'
): Promise<PrintablePuzzleLinks> {
  const sequence = await buildHumanSolveSequenceAsync(game, options);
  return printablePuzzleLinksForSequence(base, game, sequence, kind);
}

export async function printablePuzzleLinkVariantsAsync(
  base: string | URL,
  game: GameProjection,
  options: AsyncWalkthroughOptions = {}
): Promise<PrintablePuzzleLinkVariants> {
  const sequence = await buildHumanSolveSequenceAsync(game, options);
  return {
    givens: printablePuzzleLinksForSequence(base, game, sequence, 'givens'),
    candidates: printablePuzzleLinksForSequence(base, game, sequence, 'candidates')
  };
}

function printablePuzzleLinksForSequence(
  base: string | URL,
  game: GameProjection,
  sequence: NextSolveHint[],
  kind: PrintablePuzzleKind
): PrintablePuzzleLinks {
  const work: ImportedPuzzleWorkAction[] = sequence.map(({ targetCell, value }) => ({
    type: 'value',
    cell: targetCell,
    value
  }));
  const metadata: ImportedPuzzleMetadata | null = game.patternCells.length
    ? { patternCells: [...game.patternCells] }
    : null;
  const compactCandidates = kind === 'candidates' && game.startingNotesMode === 'basic';
  const startingWork = kind === 'candidates' && !compactCandidates
    ? puzzleWorkFromNotes(game.startingNotes)
    : [];
  const puzzle = puzzleUrl(
    base,
    game.puzzle.givens,
    startingWork,
    metadata,
    game.puzzle,
    compactCandidates ? 'basic' : null
  );
  const walkthroughUrl = new URL(puzzleUrl(base, game.puzzle.givens, game.puzzle.variant === 'killer' ? [] : work, metadata, game.puzzle));
  walkthroughUrl.searchParams.set('view', 'walkthrough');
  return { puzzle, walkthrough: walkthroughUrl.toString(), sequence };
}
