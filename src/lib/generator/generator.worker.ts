/// <reference lib="webworker" />

import { generateEasyPuzzle } from './generate-puzzle';

self.addEventListener('message', (event: MessageEvent<{ seed: string; maxAttempts?: number }>) => {
  try {
    self.postMessage({ ok: true, result: generateEasyPuzzle(event.data.seed, event.data.maxAttempts) });
  } catch (error) {
    self.postMessage({
      ok: false,
      message: error instanceof Error ? error.message : 'Could not generate a puzzle yet'
    });
  }
});

export {};
