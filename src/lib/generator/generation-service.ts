import type { KillerDifficulty } from '$lib/domain/killer-analysis';
import type { GenerationResult } from './generate-puzzle';
import type { PuzzleDifficulty } from '$lib/domain/types';

export function generateInWorker(
  difficulty: PuzzleDifficulty,
  seed: string,
  options: { maxAttempts?: number; variant?: 'classic' | 'killer'; killerDifficulty?: KillerDifficulty; signal?: AbortSignal } = {}
): Promise<GenerationResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./generator.worker.ts', import.meta.url), { type: 'module' });
    const stop = (): void => { window.clearTimeout(timeout); worker.terminate(); };
    const timeout = window.setTimeout(() => {
      stop(); reject(new Error('Generation reached its time limit. Try again with a new seed.'));
    }, 30_000);
    if (options.signal?.aborted) { stop(); reject(new DOMException('Generation cancelled', 'AbortError')); return; }
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
    worker.postMessage({ difficulty, seed, maxAttempts: options.maxAttempts, variant: options.variant, killerDifficulty: options.killerDifficulty });
  });
}
