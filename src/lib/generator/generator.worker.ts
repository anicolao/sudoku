import type { KillerDifficulty } from '$lib/domain/killer-analysis';
/// <reference lib="webworker" />

import type { PuzzleDifficulty } from '$lib/domain/types';
import { generateKillerPuzzle } from './killer-puzzle';
import { generatePuzzle } from './generate-puzzle';

self.addEventListener('message', (event: MessageEvent<{
  difficulty: PuzzleDifficulty;
  seed: string;
  maxAttempts?: number;
  variant?: 'classic' | 'killer';
  killerDifficulty?: KillerDifficulty;
}>) => {
  try {
    self.postMessage({
      ok: true,
      result: event.data.variant === 'killer' ? generateKillerPuzzle(event.data.seed, event.data.killerDifficulty, event.data.maxAttempts) : generatePuzzle(event.data.difficulty, event.data.seed, event.data.maxAttempts)
    });
  } catch (error) {
    self.postMessage({
      ok: false,
      message: error instanceof Error ? error.message : 'Could not generate a puzzle yet'
    });
  }
});

export {};
