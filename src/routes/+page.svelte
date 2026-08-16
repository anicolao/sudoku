<script lang="ts">
  import { onMount } from 'svelte';
  import { buildLabel } from '$lib/app-meta';
  import SudokuBoard from '$lib/components/SudokuBoard.svelte';
  import { describeMove, formatGameLog } from '$lib/domain/game-log';
  import { emptyProjection } from '$lib/domain/reducer';
  import { elapsedAt, formatElapsed } from '$lib/domain/selectors';
  import type { AppProjection, Digit, ReversibleEvent } from '$lib/domain/types';
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
  let timerNow = $state(
    import.meta.env.VITE_E2E_MODE === '1' ? new Date('2026-08-16T12:00:00.000Z') : new Date()
  );

  const currentGame = $derived(
    projection.activeGameId ? projection.games[projection.activeGameId] : undefined
  );
  const gameLog = $derived(
    store && currentGame ? formatGameLog(store.getDocument().events, currentGame.id) : []
  );
  const events = $derived.by(() => {
    void projection;
    return store ? store.getDocument().events : [];
  });
  const undoMove = $derived(
    currentGame?.undoTargetId
      ? events.find((event) => event.id === currentGame.undoTargetId) as ReversibleEvent | undefined
      : undefined
  );
  const redoMove = $derived(
    currentGame?.redoTargetId
      ? events.find((event) => event.id === currentGame.redoTargetId) as ReversibleEvent | undefined
      : undefined
  );
  const canErase = $derived(
    !!currentGame && !currentGame.paused && selectedCell !== null && currentGame.puzzle.givens[selectedCell] === '.' &&
    (currentGame.values[selectedCell] !== null || currentGame.notes[selectedCell].length > 0)
  );
  const elapsedLabel = $derived(currentGame ? formatElapsed(elapsedAt(currentGame, timerNow)) : '00:00');

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
    if (import.meta.env.VITE_E2E_MODE === '1') {
      const latestTime = store.getDocument().events.at(-1)?.occurredAt;
      if (latestTime && Date.parse(latestTime) > timerNow.getTime()) timerNow = new Date(latestTime);
    }

    if (import.meta.env.PROD && 'serviceWorker' in navigator) {
      document.documentElement.dataset.offlineReady = 'false';
      void navigator.serviceWorker.ready.then(() => {
        document.documentElement.dataset.offlineReady = 'true';
      });
    }

    const updateE2EClock = (event: Event): void => {
      timerNow = new Date(timerNow.getTime() + (event as CustomEvent<number>).detail);
    };
    if (import.meta.env.VITE_E2E_MODE === '1') {
      window.addEventListener('sudoku:e2e-clock', updateE2EClock);
      return () => window.removeEventListener('sudoku:e2e-clock', updateE2EClock);
    }
    const timer = window.setInterval(() => timerNow = new Date(), 250);
    return () => window.clearInterval(timer);
  });

  function metadata(): EventMetadata {
    if (!store) throw new Error('Puzzle storage is not ready');
    const sequence = store.getDocument().nextSequence;
    const occurredAt = import.meta.env.VITE_E2E_MODE === '1' ? timerNow : new Date();
    return {
      id: import.meta.env.VITE_E2E_MODE === '1' ? `event-${sequence}` : crypto.randomUUID(),
      occurredAt,
      elapsedMs: currentGame ? elapsedAt(currentGame, occurredAt) : 0
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
    if (currentGame?.paused) return;
    selectedCell = cell;
    const row = Math.floor(cell / 9) + 1;
    const column = (cell % 9) + 1;
    announcement = `Selected row ${row}, column ${column}`;
  }

  function enterDigit(value: Digit): void {
    if (!store || !currentGame || currentGame.paused || selectedCell === null) return;
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

  function eraseCell(): void {
    if (!store || !currentGame || selectedCell === null || !canErase) return;
    projection = store.clearCell(currentGame.id, selectedCell, metadata());
    announcement = `Erased row ${Math.floor(selectedCell / 9) + 1}, column ${(selectedCell % 9) + 1}`;
  }

  function undo(): void {
    if (!store || !currentGame?.undoTargetId || currentGame.paused) return;
    projection = store.undo(currentGame.id, currentGame.undoTargetId, metadata());
    announcement = 'Undid last move';
  }

  function redo(): void {
    if (!store || !currentGame?.redoTargetId || currentGame.paused) return;
    projection = store.redo(currentGame.id, currentGame.redoTargetId, metadata());
    announcement = 'Redid last move';
  }

  function togglePause(): void {
    if (!store || !currentGame) return;
    if (currentGame.paused) {
      projection = store.resume(currentGame.id, metadata());
      announcement = 'Puzzle resumed';
    } else {
      projection = store.pause(currentGame.id, metadata());
      selectedCell = null;
      announcement = 'Puzzle paused';
    }
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
          <div><p class="eyebrow">Easy puzzle</p><h1 id="puzzle-title">{currentGame.paused ? 'Take your time.' : 'Ready when you are.'}</h1></div>
          <div class="session-status">
            <span class="timer" aria-label={`Elapsed time ${elapsedLabel}`}>{elapsedLabel}</span>
            <button type="button" class="pause-action" onclick={togglePause}>{currentGame.paused ? 'Resume' : 'Pause'}</button>
          </div>
        </div>

        <div class="game-workspace">
          <div class="board-column">
            {#if currentGame.paused}
              <div class="paused-cover" role="status" aria-label="Puzzle paused">
                <span aria-hidden="true">Ⅱ</span><strong>Puzzle paused</strong><small>Your active time is frozen.</small>
              </div>
            {:else}
              <SudokuBoard game={currentGame} selected={selectedCell} onselect={selectCell} />
            {/if}
            <span class="board-validation">Unique solution</span>
            <p class="board-caption">Generated and validated here · {currentGame.puzzle.id.replace('easy-v1-', '#')}</p>
          </div>

          <aside class="play-controls" aria-label="Puzzle controls">
            <div class="mode-switch" aria-label="Input mode">
              <button type="button" disabled={currentGame.paused} class:active={inputMode === 'number'} aria-pressed={inputMode === 'number'} onclick={() => inputMode = 'number'}>Number</button>
              <button type="button" disabled={currentGame.paused} class:active={inputMode === 'notes'} aria-pressed={inputMode === 'notes'} onclick={() => inputMode = 'notes'}>Notes</button>
            </div>
            <div class="number-pad" aria-label="Number pad">
              {#each [1,2,3,4,5,6,7,8,9] as value}
                <button type="button" disabled={currentGame.paused} onclick={() => enterDigit(value as Digit)} aria-label={`${value}, ${remaining(value as Digit)} remaining`}>
                  <strong>{value}</strong><small>{remaining(value as Digit)}</small>
                </button>
              {/each}
            </div>
            <div class="utility-actions">
              <button type="button" onclick={undo} disabled={!undoMove || currentGame.paused} aria-label={undoMove ? `Undo ${describeMove(undoMove)}` : 'Undo'}>Undo</button>
              <button type="button" onclick={redo} disabled={!redoMove || currentGame.paused} aria-label={redoMove ? `Redo ${describeMove(redoMove)}` : 'Redo'}>Redo</button>
              <button type="button" onclick={eraseCell} disabled={!canErase}>Erase</button>
              <button type="button" disabled>Hint</button>
            </div>
            <section class="game-log" aria-labelledby="game-log-title" class:covered={currentGame.paused}>
              <div class="log-heading"><h2 id="game-log-title">Game log</h2><span>{gameLog.length} {gameLog.length === 1 ? 'event' : 'events'}</span></div>
              {#if currentGame.paused}<p class="log-paused">Resume to inspect the game log.</p>{:else}<ol>{#each gameLog as entry}<li data-event-type={entry.type}><span>{entry.text}</span></li>{/each}</ol>{/if}
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
