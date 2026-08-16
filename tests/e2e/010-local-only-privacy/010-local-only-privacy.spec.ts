import { expect, test, type Request } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';

test('ordinary play makes only same-origin GET requests', async ({ page }, testInfo) => {
  const steps = new TestStepHelper(page, testInfo);
  steps.setMetadata(
    'Keep every puzzle and action on this device',
    'The browser observes the complete runtime request surface while the player generates, enters a value, opens and cancels a hint, visits History and Settings, cancels deletion, and reloads. Only bundled same-origin GET assets are allowed.'
  );
  const observed: Array<{ method: string; url: string }> = [];
  const record = (request: Request) => observed.push({ method: request.method(), url: request.url() });
  page.on('request', record);
  await page.addInitScript(() => {
    Object.defineProperty(window, '__sudokuOutboundAttempts', { value: [], configurable: false });
    const attempts = (window as unknown as { __sudokuOutboundAttempts: string[] }).__sudokuOutboundAttempts;
    const originalFetch = window.fetch.bind(window);
    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      attempts.push(`fetch:${init?.method ?? (input instanceof Request ? input.method : 'GET')}:${String(input)}`);
      return originalFetch(input, init);
    }) as typeof window.fetch;
    const originalOpen = XMLHttpRequest.prototype.open;
    const callOpen = originalOpen as unknown as (
      this: XMLHttpRequest,
      method: string,
      url: string | URL,
      async: boolean,
      username: string | null,
      password: string | null
    ) => void;
    XMLHttpRequest.prototype.open = function (method: string, url: string | URL, async = true, username?: string | null, password?: string | null): void {
      attempts.push(`xhr:${method}:${String(url)}`);
      const asyncFlag = typeof async === 'boolean' ? async : true;
      callOpen.call(this, method, url, asyncFlag, username ?? null, password ?? null);
    };
    const OriginalWebSocket = window.WebSocket;
    window.WebSocket = class extends OriginalWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        attempts.push(`websocket:${String(url)}`);
        super(url, protocols);
      }
    } as typeof WebSocket;
    const OriginalEventSource = window.EventSource;
    window.EventSource = class extends OriginalEventSource {
      constructor(url: string | URL, options?: EventSourceInit) {
        attempts.push(`eventsource:${String(url)}`);
        super(url, options);
      }
    } as typeof EventSource;
    const originalBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = ((url: string | URL, data?: BodyInit | null) => {
      attempts.push(String(url));
      return originalBeacon(url, data);
    }) as typeof navigator.sendBeacon;
  });
  const assertPrivate = async (): Promise<void> => {
    expect(observed.length).toBeGreaterThan(0);
    for (const request of observed) {
      expect(request.method).toBe('GET');
      expect(new URL(request.url).origin).toBe('http://127.0.0.1:4177');
    }
    expect(await page.evaluate(() => (window as unknown as { __sudokuOutboundAttempts: string[] }).__sudokuOutboundAttempts)).toEqual([]);
    expect(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')).toContain("connect-src 'self'");
  };

  await page.goto('/');
  await steps.step('private-welcome-ready', {
    description: 'The local-only welcome view loads from bundled same-origin assets',
    verifications: [{ spec: 'Observed requests are same-origin GETs and CSP restricts connections to self', check: assertPrivate }]
  });
  await page.getByRole('button', { name: 'Generate Easy puzzle' }).click();
  await steps.step('private-puzzle-generated', {
    description: 'The player generates and validates a puzzle locally',
    verifications: [{ spec: 'Generation adds no external request or beacon', check: assertPrivate }]
  });
  const editable = await page.getByRole('gridcell', { name: /editable, empty/ }).first().getAttribute('data-cell');
  await page.locator(`[data-cell="${editable}"]`).click();
  await steps.step('private-cell-selected', {
    description: 'The player selects an editable cell',
    verifications: [{ spec: 'Selection stays ephemeral and makes no request', check: async () => {
      await expect(page.locator(`[data-cell="${editable}"]`)).toHaveAttribute('aria-selected', 'true');
      await assertPrivate();
    } }]
  });
  const value = await page.evaluate((cell) => {
    const start = JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '').events[0];
    return Number(start.payload.puzzle.solution[Number(cell)]);
  }, editable);
  await page.getByRole('button', { name: new RegExp(`^${value},`) }).click();
  await steps.step('private-value-entered', {
    description: 'The player records a value only in the local event stream',
    verifications: [{ spec: 'cell/value-entered is local and no runtime request follows it', check: async () => {
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '').events.at(-1).type)).toBe('cell/value-entered');
      await assertPrivate();
    } }]
  });
  await page.getByRole('button', { name: 'Hint' }).click();
  await steps.step('private-hint-opened', {
    description: 'The player opens the local hint confirmation',
    verifications: [{ spec: 'The dialog requires consent without contacting a service', check: async () => {
      await expect(page.getByRole('dialog', { name: 'Reveal one cell?' })).toBeVisible();
      await assertPrivate();
    } }]
  });
  await page.getByRole('button', { name: 'Cancel' }).click();
  await steps.step('private-hint-cancelled', {
    description: 'The player cancels without adding an event',
    verifications: [{ spec: 'The dialog closes and the request surface remains local', check: async () => {
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await assertPrivate();
    } }]
  });
  await page.getByRole('button', { name: 'History' }).click();
  await steps.step('private-history-opened', {
    description: 'History reconstructs the active game locally',
    verifications: [{ spec: 'One in-progress card appears without a data request', check: async () => {
      await expect(page.locator('.history-card')).toContainText('In progress');
      await assertPrivate();
    } }]
  });
  await page.getByRole('button', { name: 'Settings' }).click();
  await steps.step('private-settings-opened', {
    description: 'The player opens device-local settings',
    verifications: [{ spec: 'Settings render from replayed local state only', check: assertPrivate }]
  });
  await page.getByRole('button', { name: 'Clear all local Sudoku data' }).click();
  await steps.step('private-clear-dialog-opened', {
    description: 'The player inspects the precise clear-data confirmation',
    verifications: [{ spec: 'No deletion or network action occurs before confirmation', check: async () => {
      await expect(page.getByRole('dialog', { name: 'Clear all local data?' })).toBeVisible();
      await assertPrivate();
    } }]
  });
  await page.getByRole('button', { name: 'Cancel' }).click();
  await steps.step('private-clear-cancelled', {
    description: 'The player cancels data deletion',
    verifications: [{ spec: 'The canonical local event store remains and no request occurs', check: async () => {
      expect(await page.evaluate(() => localStorage.getItem('sudoku.event-store.v1'))).not.toBeNull();
      await assertPrivate();
    } }]
  });
  await page.reload();
  await steps.step('private-state-reloaded', {
    description: 'A reload reconstructs the same local game without a data API',
    verifications: [{ spec: 'The event stream survives and every observed request is still a same-origin GET', check: async () => {
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sudoku.event-store.v1') ?? '').events.length)).toBe(2);
      await assertPrivate();
    } }]
  });
  page.off('request', record);
  steps.generateDocs();
});
