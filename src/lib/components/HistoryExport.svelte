<script lang="ts">
  import { dialogFocus } from '$lib/actions/dialog-focus';
  import { serializeHistory } from '$lib/export/history-export';
  import type { IndexedDbEventStore } from '$lib/storage/indexeddb-event-store';

  let { store, version, revision, open = $bindable(true) }: { open?: boolean; store: IndexedDbEventStore | undefined; version: string; revision: string | undefined } = $props();
  let busy = $state(false);
  let message = $state('');
  let error = $state('');

  async function download(): Promise<void> {
    if (!store || busy) return;
    busy = true;
    error = '';
    message = '';
    try {
      const eventDocument = await store.snapshotForExport();
      const exportedAt = new Date();
      const json = serializeHistory(eventDocument, { exportedAt, appVersion: version, appRevision: revision ?? 'local', persistent: store.isPersistent() });
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `sudoku-history-${exportedAt.toISOString().replace(/[:.]/g, '-')}.json`;
      document.body.append(link);
      try { link.click(); } finally {
        link.remove();
        // Allow the browser to consume the URL before releasing the large snapshot.
        window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      }
      message = 'Download requested. Send the JSON file to your reviewer when ready.';
    } catch {
      error = 'Could not export history. Your history has not been changed. Try again.';
    } finally {
      busy = false;
    }
  }
</script>

<svelte:window onkeydown={(event) => { if (open && event.key === 'Escape' && !busy) open = false; }} />
{#if open}
  <div class="dialog-backdrop" role="presentation">
    <div use:dialogFocus class="history-export-dialog" role="dialog" aria-modal="true" aria-labelledby="history-export-title" aria-busy={busy}>
      <h2 id="history-export-title">Export entire history</h2>
      <p>Download all Classic and Killer attempts from this browser, including unfinished games.</p>
      <p>The file includes <strong>puzzle solutions</strong>, moves, notes, hints, settings and timestamps. Nothing is sent automatically.</p>
      {#if store && !store.isPersistent()}<p>Only the history still available in this memory-only session can be included.</p>{/if}
      {#if message}<p role="status">{message}</p>{/if}
      {#if error}<p role="alert">{error}</p>{/if}
      <div class="share-actions">
        <button class="confirm" type="button" disabled={busy} onclick={download}>{busy ? 'Preparing…' : 'Download JSON'}</button>
        <button type="button" disabled={busy} onclick={() => open = false}>Back to History</button>
      </div>
    </div>
  </div>
{/if}
