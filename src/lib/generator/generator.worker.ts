/// <reference lib="webworker" />

import type { PuzzleDifficulty } from '$lib/domain/types';
import { generateKillerPuzzle } from './killer-puzzle';
import { generatePuzzle } from './generate-puzzle';

self.addEventListener('message', (event: MessageEvent<{
  difficulty: PuzzleDifficulty;
  seed: string;
  maxAttempts?: number;
  variant?: 'classic' | 'killer';
}>) => {
  try {
    self.postMessage({
      ok: true,
      result: event.data.variant === 'killer' ? generateKillerPuzzle(event.data.seed) : generatePuzzle(event.data.difficulty, event.data.seed, event.data.maxAttempts)
    });
  } catch (error) {
    self.postMessage({
      ok: false,
      message: error instanceof Error ? error.message : 'Could not generate a puzzle yet'
    });
  }
});

export {};
