import type { GenerationResult } from './generate-puzzle';

export function generateInWorker(
  seed: string,
  options: { maxAttempts?: number; signal?: AbortSignal } = {}
): Promise<GenerationResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./generator.worker.ts', import.meta.url), { type: 'module' });
    const stop = (): void => worker.terminate();
    options.signal?.addEventListener(
      'abort',
      () => {
        stop();
        reject(new DOMException('Generation cancelled', 'AbortError'));
      },
      { once: true }
    );
    worker.addEventListener('message', (event) => {
      stop();
      if (event.data.ok) resolve(event.data.result as GenerationResult);
      else reject(new Error(event.data.message));
    });
    worker.addEventListener('error', () => {
      stop();
      reject(new Error('Could not generate a puzzle yet'));
    });
    worker.postMessage({ seed, maxAttempts: options.maxAttempts });
  });
}
