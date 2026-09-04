import { describe, expect, it, vi } from 'vitest';
import { checkForShellUpdate } from './shell-update';

const pageUrl = 'https://example.test/sudoku/pr6/?p=shared#section';

describe('shell update checks', () => {
  it('checks the deployment-local manifest with an internal cache buster', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ revision: 'abc123' })));
    const update = vi.fn(async () => undefined);

    await expect(checkForShellUpdate('abc123', pageUrl, { update }, fetcher, 42)).resolves.toEqual({
      status: 'current',
      revision: 'abc123'
    });
    expect(fetcher).toHaveBeenCalledWith(
      new URL('https://example.test/sudoku/pr6/version.json?update=42'),
      { cache: 'no-store', credentials: 'same-origin' }
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('asks the browser to update the worker when the deployed revision changes', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ revision: 'def456' })));
    const update = vi.fn(async () => undefined);

    await expect(checkForShellUpdate('abc123', pageUrl, { update }, fetcher, 42)).resolves.toEqual({
      status: 'requested',
      revision: 'def456'
    });
    expect(update).toHaveBeenCalledOnce();
  });

  it.each([
    ['offline', async () => { throw new TypeError('offline'); }],
    ['invalid JSON', async () => new Response('not json')],
    ['invalid revision', async () => new Response(JSON.stringify({ revision: '../escape' }))],
    ['failed response', async () => new Response('', { status: 503 })]
  ])('keeps the current shell when the manifest is %s', async (_label, fetcher) => {
    const update = vi.fn(async () => undefined);

    await expect(checkForShellUpdate('abc123', pageUrl, { update }, fetcher as typeof fetch, 42))
      .resolves.toEqual({ status: 'unavailable' });
    expect(update).not.toHaveBeenCalled();
  });
});
