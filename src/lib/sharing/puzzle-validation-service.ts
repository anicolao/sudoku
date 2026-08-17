import type { SharedPuzzleValidation } from './puzzle-link';

export function validateSharedPuzzleInWorker(
  givens: string,
  options: { signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<SharedPuzzleValidation> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./puzzle-validator.worker.ts', import.meta.url), { type: 'module' });
    let settled = false;
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      worker.terminate();
      callback();
    };
    const timeout = window.setTimeout(() => finish(() =>
      reject(new Error('This puzzle could not be checked safely.'))
    ), options.timeoutMs ?? 2_000);
    options.signal?.addEventListener('abort', () => finish(() =>
      reject(new DOMException('Puzzle check cancelled', 'AbortError'))
    ), { once: true });
    worker.addEventListener('message', (event) => finish(() => {
      if (event.data.ok) resolve(event.data.result as SharedPuzzleValidation);
      else reject(new Error(event.data.message));
    }));
    worker.addEventListener('error', () => finish(() =>
      reject(new Error('This puzzle could not be checked safely.'))
    ));
    worker.postMessage({ givens });
  });
}
