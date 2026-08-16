<script lang="ts">
  import { onMount } from 'svelte';
  import { buildLabel } from '$lib/app-meta';
  import SudokuBoard from '$lib/components/SudokuBoard.svelte';
  import type { AppProjection } from '$lib/domain/types';
  import { generateInWorker } from '$lib/generator/generation-service';
  import { emptyProjection } from '$lib/domain/reducer';
  import { EventStore } from '$lib/storage/event-store';

  type PersistenceStatus = 'checking' | 'local' | 'memory-only';
  type GenerationStatus = 'idle' | 'generating' | 'failed';

  class MemoryStorage implements Storage {
    private values = new Map<string, string>();
    get length() { return this.values.size; }
    clear() { this.values.clear(); }
    getItem(key: string) { return this.values.get(key) ?? null; }
    key(index: number) { return [...this.values.keys()][index] ?? null; }
    removeItem(key: string) { this.values.delete(key); }
    setItem(key: string, value: string) { this.values.set(key, value); }
  }

  const version = import.meta.env.VITE_APP_VERSION;
  const revision = import.meta.env.VITE_GIT_HASH;
  let persistenceStatus = $state<PersistenceStatus>('checking');
  let generationStatus = $state<GenerationStatus>('idle');
  let generationError = $state('');
  let store = $state<EventStore>();
  let projection = $state<AppProjection>(emptyProjection());
  const currentGame = $derived(
    projection.activeGameId ? projection.games[projection.activeGameId] : undefined
  );

  onMount(() => {
    try {
      localStorage.setItem('sudoku.storage-check', '1');
      localStorage.removeItem('sudoku.storage-check');
      store = new EventStore(localStorage);
      persistenceStatus = 'local';
    } catch {
      store = new EventStore(new MemoryStorage());
      persistenceStatus = 'memory-only';
    }
    projection = store.getProjection();

    if (import.meta.env.PROD && 'serviceWorker' in navigator) {
      document.documentElement.dataset.offlineReady = 'false';
      void navigator.serviceWorker.ready.then(() => {
        document.documentElement.dataset.offlineReady = 'true';
      });
    }
  });

  async function generatePuzzle(): Promise<void> {
    generationStatus = 'generating';
    generationError = '';
    try {
      const seed = import.meta.env.VITE_E2E_MODE === '1'
        ? 'walkthrough-seed'
        : crypto.randomUUID();
      const { puzzle } = await generateInWorker(seed);
      const eventId = import.meta.env.VITE_E2E_MODE === '1' ? 'event-1' : crypto.randomUUID();
      if (!store) throw new Error('Puzzle storage is not ready');
      const occurredAt = import.meta.env.VITE_E2E_MODE === '1'
        ? new Date('2026-08-16T12:00:00.000Z')
        : new Date();
      projection = store.startGame(puzzle, occurredAt, eventId);
      generationStatus = 'idle';
    } catch (error) {
      generationError = error instanceof Error ? error.message : 'Could not generate a puzzle yet';
      generationStatus = 'failed';
    }
  }
</script>

<svelte:head>
  <title>Sudoku — Local puzzle play</title>
</svelte:head>

<div
  class="app-shell"
  class:playing={currentGame}
  data-e2e-layout
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
    {#if currentGame}
      <section class="play-view" aria-labelledby="puzzle-title" data-e2e-no-clip>
        <div class="puzzle-heading">
          <div>
            <p class="eyebrow">Easy puzzle</p>
            <h1 id="puzzle-title">Ready when you are.</h1>
          </div>
          <div class="puzzle-facts" aria-label="Puzzle validation">
            <span>Unique solution</span>
            <span>{currentGame.puzzle.hardestTechnique.replaceAll('-', ' ')}</span>
          </div>
        </div>
        <SudokuBoard givens={currentGame.puzzle.givens} />
        <p class="board-caption">
          Generated and validated here · {currentGame.puzzle.id.replace('easy-v1-', '#')}
        </p>
      </section>
    {:else}
      <section class="hero-card" aria-labelledby="welcome-title" data-e2e-no-clip>
        <div class="puzzle-preview" aria-hidden="true">
          {#each Array(81) as _, cell}<span>{cell % 10 === 0 ? ((cell % 9) + 1) : ''}</span>{/each}
        </div>

        <div class="welcome-copy">
          <p class="eyebrow">Easy puzzles · generated here</p>
          <h1 id="welcome-title">A quiet place to solve.</h1>
          <p class="introduction">
            Sudoku creates and validates each puzzle entirely on this device. No account,
            tracking, or connection required.
          </p>

          <ul class="proof-list" aria-label="Puzzle promises">
            <li><span aria-hidden="true">✓</span> Unique solution</li>
            <li><span aria-hidden="true">✓</span> No guessing required</li>
            <li><span aria-hidden="true">✓</span> Ready for offline play</li>
          </ul>

          {#if generationStatus === 'generating'}
            <button class="primary-action" type="button" disabled aria-busy="true">
              Generating and validating…
            </button>
          {:else}
            <button class="primary-action" type="button" onclick={generatePuzzle}>
              {generationStatus === 'failed' ? 'Retry' : 'Generate Easy puzzle'}
            </button>
          {/if}
          {#if generationError}<p class="generation-error" role="alert">{generationError}</p>{/if}
          <p class="local-note">The puzzle and its solution never leave this browser.</p>
        </div>
      </section>
    {/if}
  </main>

  <nav class="primary-nav" aria-label="Primary navigation">
    <button type="button" aria-current="page"><span aria-hidden="true">▦</span>Play</button>
    <button type="button" disabled><span aria-hidden="true">☷</span>Puzzles</button>
    <button type="button" disabled><span aria-hidden="true">◷</span>History</button>
  </nav>

  <footer>
    <span data-testid="build-marker">{buildLabel(version, revision)}</span>
    <span>Private by design</span>
  </footer>
</div>
