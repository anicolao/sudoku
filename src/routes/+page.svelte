<script lang="ts">
  import { onMount } from 'svelte';
  import { buildLabel } from '$lib/app-meta';
  import SudokuBoard from '$lib/components/SudokuBoard.svelte';
  import { formatGameLog } from '$lib/domain/game-log';
  import { emptyProjection } from '$lib/domain/reducer';
  import type { AppProjection, Digit } from '$lib/domain/types';
  import { generateInWorker } from '$lib/generator/generation-service';
  import { EventStore, type EventMetadata } from '$lib/storage/event-store';

  type PersistenceStatus = 'checking' | 'local' | 'memory-only';
  type GenerationStatus = 'idle' | 'generating' | 'failed';
  type InputMode = 'number' | 'notes';

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
  let selectedCell = $state<number | null>(null);
  let inputMode = $state<InputMode>('number');
  let announcement = $state('');

  const currentGame = $derived(
    projection.activeGameId ? projection.games[projection.activeGameId] : undefined
  );
  const gameLog = $derived(
    store && currentGame ? formatGameLog(store.getDocument().events, currentGame.id) : []
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

  function metadata(): EventMetadata {
    if (!store) throw new Error('Puzzle storage is not ready');
    const sequence = store.getDocument().nextSequence;
    return {
      id: import.meta.env.VITE_E2E_MODE === '1' ? `event-${sequence}` : crypto.randomUUID(),
      occurredAt: import.meta.env.VITE_E2E_MODE === '1'
        ? new Date(Date.UTC(2026, 7, 16, 12, 0, sequence - 1))
        : new Date(),
      elapsedMs: 0
    };
  }

  async function generatePuzzle(): Promise<void> {
    generationStatus = 'generating';
    generationError = '';
    try {
      const seed = import.meta.env.VITE_E2E_MODE === '1' ? 'walkthrough-seed' : crypto.randomUUID();
      const { puzzle } = await generateInWorker(seed);
      if (!store) throw new Error('Puzzle storage is not ready');
      projection = store.startGame(puzzle, metadata());
      generationStatus = 'idle';
    } catch (error) {
      generationError = error instanceof Error ? error.message : 'Could not generate a puzzle yet';
      generationStatus = 'failed';
    }
  }

  function selectCell(cell: number): void {
    selectedCell = cell;
    const row = Math.floor(cell / 9) + 1;
    const column = (cell % 9) + 1;
    announcement = `Selected row ${row}, column ${column}`;
  }

  function enterDigit(value: Digit): void {
    if (!store || !currentGame || selectedCell === null) return;
    if (currentGame.puzzle.givens[selectedCell] !== '.') return;
    if (inputMode === 'notes') {
      const enabled = !currentGame.notes[selectedCell].includes(value);
      projection = store.toggleNote(currentGame.id, selectedCell, value, enabled, metadata());
      announcement = `${enabled ? 'Added' : 'Removed'} note ${value}`;
    } else {
      const next = store.enterValue(currentGame.id, selectedCell, value, metadata());
      projection = next;
      announcement = next.games[currentGame.id].conflicts.includes(selectedCell)
        ? `Entered ${value}, conflict`
        : `Entered ${value}`;
    }
  }

  function remaining(value: Digit): number {
    if (!currentGame) return 9;
    const board = [...currentGame.puzzle.givens].map((given, cell) =>
      given === '.' ? currentGame.values[cell] : Number(given)
    );
    return 9 - board.filter((entry) => entry === value).length;
  }
</script>

<svelte:head><title>Sudoku — Local puzzle play</title></svelte:head>

<div class="app-shell" class:playing={currentGame} data-e2e-layout data-app-ready={persistenceStatus !== 'checking'} data-persistence-status={persistenceStatus}>
  <header class="shell-header">
    <a class="brand" href="./" aria-label="Sudoku home">
      <span class="brand-mark" aria-hidden="true">{#each Array(9) as _}<i></i>{/each}</span>
      <span>Sudoku</span>
    </a>
    <div class="device-status" role="status"><span class:warning={persistenceStatus === 'memory-only'} aria-hidden="true"></span>{persistenceStatus === 'memory-only' ? 'Memory only' : 'On this device'}</div>
  </header>

  <main>
    {#if currentGame}
      <section class="play-view" aria-labelledby="puzzle-title">
        <div class="puzzle-heading">
          <div><p class="eyebrow">Easy puzzle</p><h1 id="puzzle-title">Ready when you are.</h1></div>
          <div class="puzzle-facts" aria-label="Puzzle validation"><span>Unique solution</span><span>{currentGame.puzzle.hardestTechnique.replaceAll('-', ' ')}</span></div>
        </div>

        <div class="game-workspace">
          <div class="board-column">
            <SudokuBoard game={currentGame} selected={selectedCell} onselect={selectCell} />
            <p class="board-caption">Generated and validated here · {currentGame.puzzle.id.replace('easy-v1-', '#')}</p>
          </div>

          <aside class="play-controls" aria-label="Puzzle controls">
            <div class="mode-switch" aria-label="Input mode">
              <button type="button" class:active={inputMode === 'number'} aria-pressed={inputMode === 'number'} onclick={() => inputMode = 'number'}>Number</button>
              <button type="button" class:active={inputMode === 'notes'} aria-pressed={inputMode === 'notes'} onclick={() => inputMode = 'notes'}>Notes</button>
            </div>
            <div class="number-pad" aria-label="Number pad">
              {#each [1,2,3,4,5,6,7,8,9] as value}
                <button type="button" onclick={() => enterDigit(value as Digit)} aria-label={`${value}, ${remaining(value as Digit)} remaining`}>
                  <strong>{value}</strong><small>{remaining(value as Digit)}</small>
                </button>
              {/each}
            </div>
            <div class="utility-actions">
              <button type="button" disabled>Undo</button><button type="button" disabled>Redo</button><button type="button" disabled>Erase</button><button type="button" disabled>Hint</button>
            </div>
            <section class="game-log" aria-labelledby="game-log-title">
              <div class="log-heading"><h2 id="game-log-title">Game log</h2><span>{gameLog.length} {gameLog.length === 1 ? 'event' : 'events'}</span></div>
              <ol>{#each gameLog as entry}<li data-event-type={entry.type}><span>{entry.text}</span></li>{/each}</ol>
            </section>
          </aside>
        </div>
      </section>
    {:else}
      <section class="hero-card" aria-labelledby="welcome-title" data-e2e-no-clip>
        <div class="puzzle-preview" aria-hidden="true">{#each Array(81) as _, cell}<span>{cell % 10 === 0 ? ((cell % 9) + 1) : ''}</span>{/each}</div>
        <div class="welcome-copy">
          <p class="eyebrow">Easy puzzles · generated here</p><h1 id="welcome-title">A quiet place to solve.</h1>
          <p class="introduction">Sudoku creates and validates each puzzle entirely on this device. No account, tracking, or connection required.</p>
          <ul class="proof-list" aria-label="Puzzle promises"><li><span aria-hidden="true">✓</span> Unique solution</li><li><span aria-hidden="true">✓</span> No guessing required</li><li><span aria-hidden="true">✓</span> Ready for offline play</li></ul>
          {#if generationStatus === 'generating'}
            <button class="primary-action" type="button" disabled aria-busy="true">Generating and validating…</button>
          {:else}
            <button class="primary-action" type="button" onclick={generatePuzzle}>{generationStatus === 'failed' ? 'Retry' : 'Generate Easy puzzle'}</button>
          {/if}
          {#if generationError}<p class="generation-error" role="alert">{generationError}</p>{/if}
          <p class="local-note">The puzzle and its solution never leave this browser.</p>
        </div>
      </section>
    {/if}
  </main>

  <p class="sr-live" aria-live="polite">{announcement}</p>
  <nav class="primary-nav" aria-label="Primary navigation"><button type="button" aria-current="page"><span aria-hidden="true">▦</span>Play</button><button type="button" disabled><span aria-hidden="true">☷</span>Puzzles</button><button type="button" disabled><span aria-hidden="true">◷</span>History</button></nav>
  <footer><span data-testid="build-marker">{buildLabel(version, revision)}</span><span>Private by design</span></footer>
</div>
