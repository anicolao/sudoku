/// <reference lib="webworker" />

import type { PuzzleDifficulty } from '$lib/domain/types';
import { generatePuzzle } from './generate-puzzle';

self.addEventListener('message', (event: MessageEvent<{
  difficulty: PuzzleDifficulty;
  seed: string;
  maxAttempts?: number;
}>) => {
  try {
    self.postMessage({
      ok: true,
      result: generatePuzzle(event.data.difficulty, event.data.seed, event.data.maxAttempts)
    });
  } catch (error) {
    self.postMessage({
      ok: false,
      message: error instanceof Error ? error.message : 'Could not generate a puzzle yet'
    });
  }
});

export {};
