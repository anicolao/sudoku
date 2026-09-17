/// <reference lib="webworker" />

import { SharedPuzzleError, validateSharedPuzzle } from './puzzle-link';

self.addEventListener('message', (event: MessageEvent<{ payload: string; walkthrough?: boolean }>) => {
  void validateSharedPuzzle(event.data.payload, { walkthrough: event.data.walkthrough }).then(
    (result) => self.postMessage({ ok: true, result }),
    (error: unknown) => self.postMessage({
      ok: false,
      code: error instanceof SharedPuzzleError ? error.code : 'format',
      message: error instanceof Error ? error.message : 'This puzzle could not be checked safely.'
    })
  );
});

export {};
