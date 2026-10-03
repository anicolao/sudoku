/// <reference lib="webworker" />

import { SharedPuzzleError, validateSharedPuzzle } from './puzzle-link';
import type { StartingNotesMode } from '$lib/domain/types';

self.addEventListener('message', (event: MessageEvent<{ payload: string; walkthrough?: boolean; givensOption?: StartingNotesMode }>) => {
  void validateSharedPuzzle(event.data.payload, { walkthrough: event.data.walkthrough, givensOption: event.data.givensOption }).then(
    (result) => self.postMessage({ ok: true, result }),
    (error: unknown) => self.postMessage({
      ok: false,
      code: error instanceof SharedPuzzleError ? error.code : 'format',
      message: error instanceof Error ? error.message : 'This puzzle could not be checked safely.'
    })
  );
});

export {};
