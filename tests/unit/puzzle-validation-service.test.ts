import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { validateSharedPuzzleInWorker } from '../../src/lib/sharing/puzzle-validation-service';

class WorkerDouble extends EventTarget {
  static instances: WorkerDouble[] = [];
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() { super(); WorkerDouble.instances.push(this); }
  message(data: unknown) { this.dispatchEvent(new MessageEvent('message', { data })); }
}
const worker = () => WorkerDouble.instances.at(-1)!;

beforeEach(() => {
  vi.useFakeTimers();
  WorkerDouble.instances = [];
  vi.stubGlobal('Worker', WorkerDouble);
  vi.stubGlobal('window', globalThis);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('shared-puzzle validation worker budgets', () => {
  it('allows slow startup without spending the two-second computation budget', async () => {
    const result = validateSharedPuzzleInWorker('puzzle', { givensOption: 'basic' });
    await vi.advanceTimersByTimeAsync(2_750);
    expect(worker().terminate).not.toHaveBeenCalled();
    expect(worker().postMessage).not.toHaveBeenCalled();
    worker().message({ type: 'ready' });
    expect(worker().postMessage).toHaveBeenCalledExactlyOnceWith({ payload: 'puzzle', givensOption: 'basic' });
    await vi.advanceTimersByTimeAsync(1_900);
    worker().message({ ok: true, result: { fingerprint: 'checked' } });
    await expect(result).resolves.toEqual({ fingerprint: 'checked' });
    expect(worker().terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('terminates a worker that never becomes ready', async () => {
    const rejected = expect(validateSharedPuzzleInWorker('puzzle')).rejects.toThrow('could not start');
    await vi.advanceTimersByTimeAsync(10_000);
    await rejected;
    expect(worker().terminate).toHaveBeenCalledOnce();
    expect(worker().postMessage).not.toHaveBeenCalled();
  });

  it('keeps the computation limit and does not reset it on duplicate ready messages', async () => {
    const rejected = expect(validateSharedPuzzleInWorker('puzzle')).rejects.toThrow('could not be checked safely');
    worker().message({ type: 'ready' });
    await vi.advanceTimersByTimeAsync(1_900);
    worker().message({ type: 'ready' });
    await vi.advanceTimersByTimeAsync(100);
    await rejected;
    expect(worker().postMessage).toHaveBeenCalledOnce();
    expect(worker().terminate).toHaveBeenCalledOnce();
  });

  it('preserves caller-specified computation budgets', async () => {
    const rejected = expect(validateSharedPuzzleInWorker('puzzle', { timeoutMs: 50 })).rejects.toThrow('could not be checked safely');
    await vi.advanceTimersByTimeAsync(500);
    worker().message({ type: 'ready' });
    await vi.advanceTimersByTimeAsync(50);
    await rejected;
  });

  it('cancels during startup and ignores late readiness', async () => {
    const controller = new AbortController();
    const rejected = expect(validateSharedPuzzleInWorker('puzzle', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await rejected;
    worker().message({ type: 'ready' });
    expect(worker().postMessage).not.toHaveBeenCalled();
    expect(worker().terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
