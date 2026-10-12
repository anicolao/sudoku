import type { SharedPuzzleValidation } from './puzzle-link';
import type { StartingNotesMode } from '$lib/domain/types';

export function validateSharedPuzzleInWorker(
  payload: string,
  options: { signal?: AbortSignal; timeoutMs?: number; givensOption?: StartingNotesMode } = {}
): Promise<SharedPuzzleValidation> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new DOMException('Puzzle check cancelled', 'AbortError'));
      return;
    }
    const worker = new Worker(new URL('./puzzle-validator.worker.ts', import.meta.url), { type: 'module' });
    let settled = false;
    let ready = false;
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      options.signal?.removeEventListener('abort', abort);
      worker.terminate();
      callback();
    };
    const abort = (): void => finish(() =>
      reject(new DOMException('Puzzle check cancelled', 'AbortError'))
    );
    // Script fetching and worker startup are not Sudoku computation. Give them
    // their own bounded allowance, then start the validation budget at ready.
    let timeout = window.setTimeout(() => finish(() =>
      reject(new Error('The puzzle checker could not start. Please try again.'))
    ), 10_000);
    options.signal?.addEventListener('abort', abort, { once: true });
    worker.addEventListener('message', (event) => {
      if (settled) return;
      if (event.data.type === 'ready') {
        if (ready) return;
        ready = true;
        window.clearTimeout(timeout);
        timeout = window.setTimeout(() => finish(() =>
          reject(new Error('This puzzle could not be checked safely.'))
        ), options.timeoutMs ?? 2_000);
        worker.postMessage({ payload, givensOption: options.givensOption });
        return;
      }
      if (!ready) return;
      finish(() => {
        if (event.data.ok) resolve(event.data.result as SharedPuzzleValidation);
        else reject(new Error(event.data.message));
      });
    });
    worker.addEventListener('error', () => finish(() =>
      reject(new Error('This puzzle could not be checked safely.'))
    ));
  });
}
