<script lang="ts">
  import { onMount } from 'svelte';
  import { buildLabel } from '$lib/app-meta';

  type PersistenceStatus = 'checking' | 'local' | 'memory-only';

  const previewRows = [
    ['5', '', '', '', '7', '', '', '', '2'],
    ['', '7', '', '1', '', '5', '', '4', ''],
    ['1', '', '8', '', '4', '', '5', '', '7'],
    ['', '5', '', '7', '', '1', '', '', '3'],
    ['4', '', '6', '', '5', '', '7', '', '1'],
    ['7', '', '', '9', '', '4', '', '5', ''],
    ['9', '', '1', '', '3', '', '2', '', '8'],
    ['', '8', '', '2', '', '1', '', '5', ''],
    ['3', '', '5', '', '8', '', '6', '', '9']
  ];

  const version = import.meta.env.VITE_APP_VERSION;
  const revision = import.meta.env.VITE_GIT_HASH;
  let persistenceStatus = $state<PersistenceStatus>('checking');

  onMount(() => {
    try {
      localStorage.setItem('sudoku.storage-check', '1');
      localStorage.removeItem('sudoku.storage-check');
      persistenceStatus = 'local';
    } catch {
      persistenceStatus = 'memory-only';
    }

    if (import.meta.env.PROD && 'serviceWorker' in navigator) {
      document.documentElement.dataset.offlineReady = 'false';
      void navigator.serviceWorker.ready.then(() => {
        document.documentElement.dataset.offlineReady = 'true';
      });
    }
  });
</script>

<svelte:head>
  <title>Sudoku — Local puzzle play</title>
</svelte:head>

<div
  class="app-shell"
  data-e2e-layout
  data-e2e-viewport
  data-app-ready={persistenceStatus !== 'checking'}
  data-persistence-status={persistenceStatus}
>
  <header class="shell-header">
    <a class="brand" href="./" aria-label="Sudoku home">
      <span class="brand-mark" aria-hidden="true">
        {#each Array(9) as _}<i></i>{/each}
      </span>
      <span>Sudoku</span>
    </a>
    <div class="device-status" role="status">
      <span class:warning={persistenceStatus === 'memory-only'} aria-hidden="true"></span>
      {persistenceStatus === 'memory-only' ? 'Memory only' : 'On this device'}
    </div>
  </header>

  <main>
    <section class="hero-card" aria-labelledby="welcome-title" data-e2e-no-clip>
      <div class="puzzle-preview" aria-hidden="true">
        {#each previewRows as row}
          <div class="preview-row">
            {#each row as value}<span>{value}</span>{/each}
          </div>
        {/each}
      </div>

      <div class="welcome-copy">
        <p class="eyebrow">Easy puzzles · generated here</p>
        <h1 id="welcome-title">A quiet place to solve.</h1>
        <p class="introduction">
          Sudoku will create and validate each puzzle entirely on this device. No account,
          tracking, or connection required.
        </p>

        <ul class="proof-list" aria-label="Puzzle promises">
          <li><span aria-hidden="true">✓</span> Unique solution</li>
          <li><span aria-hidden="true">✓</span> No guessing required</li>
          <li><span aria-hidden="true">✓</span> Ready for offline play</li>
        </ul>

        <button class="primary-action" type="button" disabled>
          Generate Easy puzzle
        </button>
        <p class="coming-soon">The generator arrives in the next vertical slice.</p>
      </div>
    </section>
  </main>

  <nav class="primary-nav" aria-label="Primary navigation">
    <button type="button" aria-current="page">
      <span class="nav-icon grid-icon" aria-hidden="true"></span>
      Play
    </button>
    <button type="button" disabled>
      <span class="nav-icon list-icon" aria-hidden="true"></span>
      Puzzles
    </button>
    <button type="button" disabled>
      <span class="nav-icon history-icon" aria-hidden="true"></span>
      History
    </button>
  </nav>

  <footer>
    <span data-testid="build-marker">{buildLabel(version, revision)}</span>
    <span>Private by design</span>
  </footer>
</div>
