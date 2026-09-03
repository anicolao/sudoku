/// <reference lib="webworker" />

import { SharedPuzzleError, validateSharedPuzzle } from './puzzle-link';

self.addEventListener('message', (event: MessageEvent<{ payload: string }>) => {
  void validateSharedPuzzle(event.data.payload).then(
    (result) => self.postMessage({ ok: true, result }),
    (error: unknown) => self.postMessage({
      ok: false,
      code: error instanceof SharedPuzzleError ? error.code : 'format',
      message: error instanceof Error ? error.message : 'This puzzle could not be checked safely.'
    })
  );
});

export {};
