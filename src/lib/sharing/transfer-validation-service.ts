import type { ValidatedTransfer } from './transfer-codec';

interface WorkerResult {
  ok: boolean;
  validation?: ValidatedTransfer;
  message?: string;
}

export function validateTransferInWorker(encoded: string, timeoutMs = 4_000): Promise<ValidatedTransfer> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./transfer-validator.worker.ts', import.meta.url), { type: 'module' });
    const timeout = window.setTimeout(() => {
      worker.terminate();
      reject(new Error('This transfer could not be checked safely.'));
    }, timeoutMs);
    const finish = (): void => {
      window.clearTimeout(timeout);
      worker.terminate();
    };
    worker.onmessage = (event: MessageEvent<WorkerResult>) => {
      finish();
      if (event.data.ok && event.data.validation) resolve(event.data.validation);
      else reject(new Error(event.data.message ?? 'This transfer could not be checked safely.'));
    };
    worker.onerror = () => {
      finish();
      reject(new Error('This transfer could not be checked safely.'));
    };
    worker.postMessage(encoded);
  });
}
