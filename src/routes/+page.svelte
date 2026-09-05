<script lang="ts">
  import { onMount, tick } from 'svelte';
  import QRCode from 'qrcode';
  import { buildLabel } from '$lib/app-meta';
  import { checkForShellUpdate } from '$lib/shell-update';
  import SudokuBoard from '$lib/components/SudokuBoard.svelte';
  import PhotoPuzzleImport from '$lib/components/PhotoPuzzleImport.svelte';
  import { DIFFICULTY_BY_ID, DIFFICULTY_LEVELS, difficultyLabel } from '$lib/domain/difficulty';
  import { describeMove, formatGameLog } from '$lib/domain/game-log';
  import { emptyProjection } from '$lib/domain/reducer';
  import { elapsedAt, formatElapsed, remainingDigit } from '$lib/domain/selectors';
  import type { AppProjection, Digit, GameSettings, PuzzleDifficulty, ReversibleEvent } from '$lib/domain/types';
  import {
    buildSolveWalkthroughAsync,
    countSolveWalkthroughPlacements,
    type SolveWalkthrough,
    type WalkthroughBuildProgress
  } from '$lib/domain/walkthrough';
  import { generateInWorker } from '$lib/generator/generation-service';
  import type { EventMetadata } from '$lib/storage/event-store';
  import {
    EVENT_CHANNEL_NAME,
    IndexedDbEventStore,
    loadIndexedDbEventStore,
    type CommitResult
  } from '$lib/storage/indexeddb-event-store';
  import {
    puzzleUrl,
    puzzleWorkFromGame,
    type SharedPuzzleValidation
  } from '$lib/sharing/puzzle-link';
  import { validateSharedPuzzleInWorker } from '$lib/sharing/puzzle-validation-service';

  type PersistenceStatus = 'checking' | 'local' | 'memory-only';
  type GenerationStatus = 'idle' | 'generating' | 'failed';
  type InputMode = 'number' | 'notes' | 'stripes';
  type StripeType = 'even' | 'odd';
  type View = 'play' | 'puzzles' | 'photo-import' | 'history' | 'walkthrough' | 'settings';
  type IncomingStatus = 'none' | 'checking' | 'ready' | 'invalid';
  type IncomingView = 'play' | 'walkthrough';
  type ShareStage = 'choose' | 'ready';
  type ShareKind = 'puzzle' | 'work';
  type WalkthroughStatus = 'idle' | 'loading' | 'ready' | 'failed';

  const digits: Digit[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  const version = import.meta.env.VITE_APP_VERSION;
  const revision = import.meta.env.VITE_GIT_HASH;
  let persistenceStatus = $state<PersistenceStatus>('checking');
  let generationStatus = $state<GenerationStatus>('idle');
  let generationError = $state('');
  let store = $state<IndexedDbEventStore>();
  let projection = $state<AppProjection>(emptyProjection());
  let selectedCell = $state<number | null>(null);
  let highlightAllNumberPeers = $state(false);
  let selectedDigit = $state<Digit | null>(null);
  let inputMode = $state<InputMode>('number');
  let evenStripeOrigin = $state<number | null>(null);
  let oddStripeOrigin = $state<number | null>(null);
  let nextStripeType = $state<StripeType>('even');
  let announcement = $state('');
  let view = $state<View>('play');
  let reviewedGameId = $state<string | null>(null);
  let hintDialogOpen = $state(false);
  let clearDialogOpen = $state(false);
  let historyPage = $state(0);
  let walkthroughGameId = $state<string | null>(null);
  let walkthroughIndex = $state(0);
  let walkthrough = $state<SolveWalkthrough | null>(null);
  let walkthroughStatus = $state<WalkthroughStatus>('idle');
  let walkthroughProgress = $state<WalkthroughBuildProgress>({ completed: 0, total: 0 });
  let walkthroughError = $state('');
  let walkthroughRequest = 0;
  let storageWarning = $state('');
  let tabGameId = $state<string | null>(null);
  let eventChannel: BroadcastChannel | null = null;
  let selectedDifficulty = $state<PuzzleDifficulty>('foundations');
  let incomingStatus = $state<IncomingStatus>('none');
  let incomingPuzzle = $state<SharedPuzzleValidation | null>(null);
  let incomingError = $state('');
  let incomingView = $state<IncomingView>('play');
  let shareDialogOpen = $state(false);
  let shareGameId = $state<string | null>(null);
  let shareStage = $state<ShareStage>('choose');
  let shareLink = $state('');
  let shareQr = $state('');
  let shareError = $state('');
  let shareKind = $state<ShareKind>('puzzle');
  let shareCopied = $state(false);
  let systemShareAvailable = $state(false);
  let timerNow = $state(
    import.meta.env.VITE_E2E_MODE === '1' ? new Date('2026-08-16T12:00:00.000Z') : new Date()
  );

  const activeGame = $derived(tabGameId ? projection.games[tabGameId] : undefined);
  const currentGame = $derived(reviewedGameId ? projection.games[reviewedGameId] : activeGame);
  const shareGame = $derived(shareGameId ? projection.games[shareGameId] : undefined);
  const isReadOnly = $derived(
    !currentGame || currentGame.status !== 'active' || reviewedGameId !== null
  );
  const gameLog = $derived(
    store && currentGame ? formatGameLog(store.getDocument().events, currentGame.id, currentGame) : []
  );
  const historyGames = $derived(Object.values(projection.games).reverse());
  const events = $derived.by(() => {
    void projection;
    return store ? store.getDocument().events : [];
  });
  const walkthroughStep = $derived(walkthrough?.steps[walkthroughIndex]);
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
    inputMode !== 'stripes' && !!currentGame && !isReadOnly && !currentGame.paused && selectedCell !== null && currentGame.puzzle.givens[selectedCell] === '.' &&
    (currentGame.values[selectedCell] !== null || currentGame.notes[selectedCell].length > 0)
  );
  const notesToFill = $derived.by((): Digit[] => {
    if (!currentGame || isReadOnly || currentGame.paused || selectedCell === null ||
      currentGame.puzzle.givens[selectedCell] !== '.' || currentGame.values[selectedCell] !== null) return [];
    return digits.filter((value) =>
      remainingDigit(currentGame, value) > 0 && !currentGame.notes[selectedCell as number].includes(value)
    );
  });
  const canFillAllNotes = $derived(notesToFill.length > 0);
  const elapsedLabel = $derived(currentGame ? formatElapsed(elapsedAt(currentGame, timerNow)) : '00:00');
  const selectedLevel = $derived(DIFFICULTY_BY_ID[selectedDifficulty]);

  onMount(() => {
    let disposed = false;
    const cleanup: Array<() => void> = [];
    if (import.meta.env.PROD && 'serviceWorker' in navigator) {
      document.documentElement.dataset.offlineReady = 'false';
      void navigator.serviceWorker.ready.then(async (registration) => {
        if (disposed) return;
        document.documentElement.dataset.offlineReady = 'true';
        const result = await checkForShellUpdate(revision, window.location.href, registration);
        if (disposed) return;

        const reloadKey = 'sudoku.shell-update-reload';
        if (result.status === 'current') {
          sessionStorage.removeItem(reloadKey);
          return;
        }
        if (result.status !== 'requested' || sessionStorage.getItem(reloadKey) === result.revision) return;

        let reloading = false;
        const reload = (): void => {
          if (disposed || reloading) return;
          reloading = true;
          sessionStorage.setItem(reloadKey, result.revision);
          window.location.reload();
        };
        navigator.serviceWorker.addEventListener('controllerchange', reload, { once: true });
        cleanup.push(() => navigator.serviceWorker.removeEventListener('controllerchange', reload));
        const fallback = window.setTimeout(reload, 2_000);
        cleanup.push(() => window.clearTimeout(fallback));
      });
    }

    const inspectFragment = (): void => { void inspectIncomingLink(); };
    window.addEventListener('hashchange', inspectFragment);
    cleanup.push(() => window.removeEventListener('hashchange', inspectFragment));
    const updateE2EClock = (event: Event): void => {
      timerNow = new Date(timerNow.getTime() + (event as CustomEvent<number>).detail);
    };
    if (import.meta.env.VITE_E2E_MODE === '1') {
      window.addEventListener('sudoku:e2e-clock', updateE2EClock);
      cleanup.push(() => window.removeEventListener('sudoku:e2e-clock', updateE2EClock));
    } else {
      const timer = window.setInterval(() => timerNow = new Date(), 250);
      cleanup.push(() => window.clearInterval(timer));
    }

    const refresh = (): void => { void refreshFromDatabase(); };
    window.addEventListener('focus', refresh);
    cleanup.push(() => window.removeEventListener('focus', refresh));

    void (async () => {
      const loaded = await loadIndexedDbEventStore(
        localStorage,
        indexedDB,
        timerNow,
        import.meta.env.VITE_E2E_MODE === '1'
      );
      if (disposed) return;
      store = loaded.store;
      storageWarning = loaded.warning;
      persistenceStatus = store.isPersistent() ? 'local' : 'memory-only';
      systemShareAvailable = typeof navigator.share === 'function';
      projection = store.getProjection();
      const selected = sessionStorage.getItem('sudoku.tab-game');
      selectTabGame(selected && projection.games[selected] ? selected : defaultGameId());
      if (import.meta.env.VITE_E2E_MODE === '1') {
        const latestTime = store.getDocument().events.at(-1)?.occurredAt;
        if (latestTime && Date.parse(latestTime) > timerNow.getTime()) timerNow = new Date(latestTime);
        (window as Window & { __sudokuReplaceEventDocument?: typeof store.replaceDocumentForTests }).__sudokuReplaceEventDocument =
          async (document) => {
            projection = await store!.replaceDocumentForTests(document);
            selectTabGame(projection.activeGameId);
            return projection;
          };
      }
      if ('BroadcastChannel' in window) {
        eventChannel = new BroadcastChannel(EVENT_CHANNEL_NAME);
        eventChannel.onmessage = () => {
          // A hidden Mobile Safari tab can be suspended before its IndexedDB
          // transaction commits, blocking every other tab on this database.
          // The focus listener above reloads the complete store when this tab
          // becomes active again, so a hidden tab never needs to read here.
          if (document.visibilityState === 'visible') refresh();
        };
      }
      await inspectIncomingLink();
    })();

    return () => {
      disposed = true;
      eventChannel?.close();
      eventChannel = null;
      cleanup.forEach((dispose) => dispose());
    };
  });

  function selectTabGame(gameId: string | null): void {
    if (tabGameId !== gameId) resetStripes();
    tabGameId = gameId;
    if (gameId) {
      sessionStorage.setItem('sudoku.tab-game', gameId);
      inputMode = projection.games[gameId]?.settings.notesFirst ? 'notes' : 'number';
    }
    else sessionStorage.removeItem('sudoku.tab-game');
  }

  function defaultGameId(): string | null {
    if (projection.activeGameId && projection.games[projection.activeGameId]?.status === 'active') return projection.activeGameId;
    return Object.values(projection.games).reverse().find((game) => game.status === 'active')?.id ?? null;
  }

  async function refreshFromDatabase(): Promise<void> {
    if (!store) return;
    projection = await store.reload();
    if (tabGameId && !projection.games[tabGameId]) selectTabGame(defaultGameId());
    syncStoreStatus();
  }

  function applyCommit(result: CommitResult, successMessage: string): boolean {
    projection = result.projection;
    syncStoreStatus();
    if (!result.committed) {
      announcement = 'That action overlapped another tab and was discarded. The latest puzzle state is shown.';
      return false;
    }
    eventChannel?.postMessage({ type: 'events-changed', gameId: result.gameId });
    announcement = successMessage;
    return true;
  }

  function syncStoreStatus(): void {
    if (!store) return;
    persistenceStatus = store.isPersistent() ? 'local' : 'memory-only';
    storageWarning = store.getWarning();
  }

  async function inspectIncomingLink(): Promise<void> {
    const url = new URL(window.location.href);
    const puzzles = url.searchParams.getAll('p');
    if (puzzles.length === 0) return;
    incomingView = 'play';
    if (puzzles.length !== 1) {
      incomingStatus = 'invalid';
      incomingError = 'This link is ambiguous because it contains more than one puzzle.';
      return;
    }
    const requestedViews = url.searchParams.getAll('view');
    if (requestedViews.length > 1 || (requestedViews[0] && requestedViews[0] !== 'walkthrough')) {
      incomingStatus = 'invalid';
      incomingError = 'This link requests an unsupported puzzle view.';
      return;
    }
    const requestedView: IncomingView = requestedViews[0] === 'walkthrough' ? 'walkthrough' : 'play';
    incomingStatus = 'checking';
    incomingError = '';
    try {
      incomingPuzzle = await validateSharedPuzzleInWorker(puzzles[0]);
      if (requestedView === 'walkthrough' &&
        !incomingPuzzle.work.some((action) => action.type === 'value')) {
        throw new Error('A walkthrough link must include at least one placement.');
      }
      incomingView = requestedView;
      incomingStatus = 'ready';
    } catch (error) {
      incomingStatus = 'invalid';
      incomingError = error instanceof Error ? error.message : 'This puzzle could not be checked safely.';
    }
  }

  function clearIncomingUrl(): void {
    const url = new URL(window.location.href);
    url.searchParams.delete('p');
    url.searchParams.delete('view');
    history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }

  function dismissIncoming(): void {
    clearIncomingUrl();
    incomingStatus = 'none';
    incomingPuzzle = null;
    incomingError = '';
    incomingView = 'play';
  }

  async function acceptIncoming(abandonCurrent = false): Promise<void> {
    if (!store || !incomingPuzzle) return;
    const destination = incomingView;
    if (activeGame?.status === 'active') {
      if (!abandonCurrent) return;
      const abandoned = await store.abandon(activeGame.id, metadata());
      if (!applyCommit(abandoned, 'Puzzle abandoned')) return;
    }
    const result = await store.importGame(
      incomingPuzzle.puzzle,
      metadata(false),
      { ...projection.settings, ...(incomingPuzzle.metadata?.settings ?? {}) },
      incomingPuzzle.work,
      incomingPuzzle.metadata ?? undefined,
      destination === 'walkthrough' ? 'walkthrough' : undefined
    );
    if (!applyCommit(result, 'Shared puzzle opened on this device')) return;
    selectTabGame(result.gameId);
    reviewedGameId = null;
    selectedCell = null;
    dismissIncoming();
    if (destination === 'walkthrough' && result.gameId) await openWalkthrough(result.gameId);
    else view = 'play';
  }

  function openShareDialog(gameId: string): void {
    if (!projection.games[gameId]) return;
    shareGameId = gameId;
    shareDialogOpen = true;
    shareStage = 'choose';
    shareLink = '';
    shareQr = '';
    shareError = '';
    shareCopied = false;
  }

  async function showShareLink(link: string, kind: ShareKind): Promise<void> {
    shareLink = link;
    shareKind = kind;
    shareCopied = false;
    shareError = '';
    try {
      shareQr = await QRCode.toDataURL(link, { errorCorrectionLevel: 'Q', margin: 4, width: 224 });
      shareStage = 'ready';
    } catch {
      shareError = 'The QR code could not be prepared on this device.';
    }
  }

  async function sharePuzzleOnly(): Promise<void> {
    if (!shareGame) return;
    await showShareLink(puzzleUrl(window.location.href, shareGame.puzzle.givens), 'puzzle');
  }

  async function sharePuzzleWork(): Promise<void> {
    if (!shareGame) return;
    await showShareLink(
      puzzleUrl(window.location.href, shareGame.puzzle.givens, puzzleWorkFromGame(shareGame), {
        elapsedMs: elapsedAt(shareGame, timerNow),
        ...(shareGame.hintedCells.length ? { hintedCells: [...shareGame.hintedCells] } : {}),
        mistakes: shareGame.mistakes,
        settings: { ...shareGame.settings }
      }),
      'work'
    );
    announcement = 'Puzzle work link ready';
  }

  async function copyShareLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(shareLink);
      shareCopied = true;
      announcement = 'Share link copied';
    } catch {
      shareError = 'Copying is unavailable in this browser. The QR code is still ready to scan.';
    }
  }

  async function openSystemShare(): Promise<void> {
    if (!navigator.share) return;
    try { await navigator.share({ title: 'Sudoku puzzle', url: shareLink }); }
    catch (error) { if ((error as DOMException).name !== 'AbortError') shareError = 'System sharing is unavailable.'; }
  }

  function metadata(trackElapsed = true, game = currentGame): EventMetadata {
    if (!store) throw new Error('Puzzle storage is not ready');
    const sequence = store.getDocument().nextSequence;
    const occurredAt = import.meta.env.VITE_E2E_MODE === '1' ? timerNow : new Date();
    return {
      id: import.meta.env.VITE_E2E_MODE === '1' ? `event-${sequence}` : crypto.randomUUID(),
      occurredAt,
      elapsedMs: trackElapsed && game ? elapsedAt(game, occurredAt) : 0
    };
  }

  async function generatePuzzle(): Promise<void> {
    generationStatus = 'generating';
    generationError = '';
    try {
      const seed = import.meta.env.VITE_E2E_MODE === '1' ? 'walkthrough-seed' : crypto.randomUUID();
      const { puzzle } = await generateInWorker(selectedDifficulty, seed);
      if (!store) throw new Error('Puzzle storage is not ready');
      const result = await store.startGame(puzzle, metadata(false));
      if (!applyCommit(result, 'New puzzle ready')) throw new Error('Puzzle generation overlapped another tab');
      selectTabGame(result.gameId);
      reviewedGameId = null;
      view = 'play';
      generationStatus = 'idle';
    } catch (error) {
      generationError = error instanceof Error ? error.message : 'Could not generate a puzzle yet';
      generationStatus = 'failed';
    }
  }

  async function startPhotoPuzzle(validation: SharedPuzzleValidation, abandonCurrent: boolean): Promise<void> {
    if (!store) return;
    if (activeGame?.status === 'active') {
      if (!abandonCurrent) return;
      const abandoned = await store.abandon(activeGame.id, metadata());
      if (!applyCommit(abandoned, 'Puzzle abandoned')) return;
    }
    const puzzle = {
      ...validation.puzzle,
      id: `photo-${validation.fingerprint.slice(0, 12)}`,
      provenance: {
        kind: 'camera-photo' as const,
        recognizerVersion: 1 as const,
        fingerprint: validation.fingerprint
      }
    };
    const result = await store.importGame(
      puzzle,
      metadata(false),
      projection.settings,
      [],
      undefined,
      undefined,
      'camera-photo'
    );
    if (!applyCommit(result, 'Photographed puzzle imported on this device')) return;
    selectTabGame(result.gameId);
    reviewedGameId = null;
    selectedCell = null;
    view = 'play';
  }

  function selectCell(cell: number): void {
    if (currentGame?.paused) return;
    if (inputMode === 'stripes') {
      selectedCell = cell;
      highlightAllNumberPeers = false;
      const stripeType = nextStripeType;
      if (stripeType === 'even') evenStripeOrigin = cell;
      else oddStripeOrigin = cell;
      nextStripeType = stripeType === 'even' ? 'odd' : 'even';
      const row = Math.floor(cell / 9) + 1;
      const column = (cell % 9) + 1;
      announcement = `${stripeType === 'even' ? 'Even' : 'Odd'} stripes mark the peers of row ${row}, column ${column}. ${nextStripeType === 'even' ? 'Even' : 'Odd'} stripes are next`;
      return;
    }
    const value = currentGame
      ? currentGame.puzzle.givens[cell] === '.'
        ? currentGame.values[cell]
        : Number(currentGame.puzzle.givens[cell])
      : null;
    if (selectedCell === cell && value !== null) {
      highlightAllNumberPeers = !highlightAllNumberPeers;
      announcement = highlightAllNumberPeers
        ? `Highlighted every ${value} and all of their peers`
        : `Highlighted row ${Math.floor(cell / 9) + 1}, column ${(cell % 9) + 1} peers`;
      return;
    }
    selectedCell = cell;
    highlightAllNumberPeers = false;
    const row = Math.floor(cell / 9) + 1;
    const column = (cell % 9) + 1;
    announcement = `Selected row ${row}, column ${column}`;
    if (selectedDigit && currentGame?.settings.numberFirst && currentGame.puzzle.givens[cell] === '.') {
      enterDigit(selectedDigit, cell);
    }
  }

  async function enterDigit(value: Digit, cellOverride: number | null = null): Promise<void> {
    if (!store || !currentGame || isReadOnly || currentGame.paused || inputMode === 'stripes') return;
    const cell = cellOverride ?? selectedCell;
    const canRemoveCompletedNote = inputMode === 'notes' && cell !== null &&
      currentGame.puzzle.givens[cell] === '.' && currentGame.values[cell] === null &&
      currentGame.notes[cell].includes(value);
    if (remaining(value) === 0 && !canRemoveCompletedNote) {
      if (selectedDigit === value) selectedDigit = null;
      announcement = `All ${value}s are already placed`;
      return;
    }
    if (cell === null) {
      if (currentGame.settings.numberFirst) {
        selectedDigit = value;
        announcement = `Selected number ${value}`;
      }
      return;
    }
    selectedCell = cell;
    if (currentGame.puzzle.givens[cell] !== '.') return;
    if (inputMode === 'notes') {
      const enabled = !currentGame.notes[cell].includes(value);
      const result = await store.toggleNote(currentGame.id, cell, value, enabled, metadata());
      applyCommit(result, `${enabled ? 'Added' : 'Removed'} note ${value}`);
    } else {
      const result = await store.enterValue(currentGame.id, cell, value, metadata());
      if (!applyCommit(result, `Entered ${value}`)) return;
      announcement = result.projection.games[currentGame.id].conflicts.includes(cell)
        ? `Entered ${value}, conflict`
        : `Entered ${value}`;
    }
    if (selectedDigit === value) selectedDigit = null;
  }

  function remaining(value: Digit): number {
    return currentGame ? remainingDigit(currentGame, value) : 9;
  }

  async function eraseCell(): Promise<void> {
    if (!store || !currentGame || selectedCell === null || !canErase) return;
    const value = currentGame.values[selectedCell];
    const sourceEventId = currentGame.valueSourceEventIds[selectedCell];
    const result = value !== null && sourceEventId
      ? await store.eraseValue(currentGame.id, selectedCell, value, sourceEventId, metadata())
      : await store.clearCell(currentGame.id, selectedCell, metadata());
    applyCommit(result, `Erased row ${Math.floor(selectedCell / 9) + 1}, column ${(selectedCell % 9) + 1}`);
  }

  async function eraseCellAt(cell: number): Promise<void> {
    selectedCell = cell;
    if (!store || !currentGame || isReadOnly || currentGame.paused || inputMode === 'stripes' || currentGame.puzzle.givens[cell] !== '.') return;
    if (currentGame.values[cell] === null && currentGame.notes[cell].length === 0) return;
    const value = currentGame.values[cell];
    const sourceEventId = currentGame.valueSourceEventIds[cell];
    const result = value !== null && sourceEventId
      ? await store.eraseValue(currentGame.id, cell, value, sourceEventId, metadata())
      : await store.clearCell(currentGame.id, cell, metadata());
    applyCommit(result, `Erased row ${Math.floor(cell / 9) + 1}, column ${(cell % 9) + 1}`);
  }

  function toggleNotesMode(): void {
    if (isReadOnly || currentGame?.paused) return;
    inputMode = inputMode === 'notes' ? 'number' : 'notes';
    announcement = `${inputMode === 'notes' ? 'Notes' : 'Number'} mode`;
  }

  function setInputMode(mode: InputMode): void {
    if (isReadOnly || currentGame?.paused) return;
    inputMode = mode;
    if (mode === 'stripes') {
      selectedDigit = null;
      highlightAllNumberPeers = false;
    }
    announcement = `${mode === 'number' ? 'Number' : mode === 'notes' ? 'Notes' : 'Stripes'} mode`;
  }

  function focusCell(cell: number): void {
    if (inputMode === 'stripes') {
      selectedCell = cell;
      highlightAllNumberPeers = false;
    } else selectCell(cell);
  }

  function resetStripes(announce = false): void {
    evenStripeOrigin = null;
    oddStripeOrigin = null;
    nextStripeType = 'even';
    if (announce) announcement = 'Stripes cleared. Even stripes are next';
  }

  async function fillAllNotes(): Promise<void> {
    if (!store || !currentGame || selectedCell === null || !canFillAllNotes) return;
    applyCommit(await store.fillNotes(currentGame.id, selectedCell, notesToFill, metadata()), 'Filled available notes');
  }

  function handleGlobalKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    if (hintDialogOpen) hintDialogOpen = false;
    else if (clearDialogOpen) clearDialogOpen = false;
    else if (shareDialogOpen) shareDialogOpen = false;
  }

  async function undo(): Promise<void> {
    if (!store || !currentGame?.undoTargetId || isReadOnly || currentGame.paused) return;
    applyCommit(await store.undo(currentGame.id, currentGame.undoTargetId, metadata()), 'Undid last move');
  }

  async function redo(): Promise<void> {
    if (!store || !currentGame?.redoTargetId || isReadOnly || currentGame.paused) return;
    applyCommit(await store.redo(currentGame.id, currentGame.redoTargetId, metadata()), 'Redid last move');
  }

  async function togglePause(): Promise<void> {
    if (!store || !currentGame || isReadOnly) return;
    if (currentGame.paused) {
      applyCommit(await store.resume(currentGame.id, metadata()), 'Puzzle resumed');
    } else {
      const result = await store.pause(currentGame.id, metadata());
      if (!applyCommit(result, 'Puzzle paused')) return;
      selectedCell = null;
    }
  }

  async function confirmHint(): Promise<void> {
    if (!store || !currentGame || isReadOnly || currentGame.paused) return;
    const cell = currentGame.values.findIndex((value, index) =>
      currentGame.puzzle.givens[index] === '.' && value === null
    );
    if (cell < 0) return;
    const value = Number(currentGame.puzzle.solution[cell]) as Digit;
    const result = await store.revealHint(currentGame.id, cell, value, metadata());
    if (!applyCommit(result, `Hint revealed ${value} in row ${Math.floor(cell / 9) + 1}, column ${(cell % 9) + 1}`)) return;
    selectedCell = cell;
    hintDialogOpen = false;
  }

  async function restartGame(): Promise<void> {
    if (!store || !currentGame || isReadOnly) return;
    if (!applyCommit(await store.restart(currentGame.id, metadata()), 'Puzzle restarted')) return;
    selectedCell = null;
    resetStripes();
  }

  async function abandonGame(): Promise<void> {
    if (!store || !currentGame || isReadOnly) return;
    if (!applyCommit(await store.abandon(currentGame.id, metadata()), 'Puzzle abandoned')) return;
    selectedCell = null;
    view = 'history';
  }

  async function startOver(gameId: string): Promise<void> {
    if (!store) return;
    const result = await store.startGame(projection.games[gameId].puzzle, metadata(false));
    if (!applyCommit(result, 'Started another attempt')) return;
    selectTabGame(result.gameId);
    reviewedGameId = null;
    selectedCell = null;
    view = 'play';
  }

  async function openWalkthrough(gameId: string): Promise<void> {
    const request = ++walkthroughRequest;
    const sourceEvents = [...events];
    const loadingStartedAt = performance.now();
    walkthroughGameId = gameId;
    walkthroughIndex = 0;
    walkthrough = null;
    walkthroughStatus = 'loading';
    walkthroughProgress = {
      completed: 0,
      total: countSolveWalkthroughPlacements(sourceEvents, gameId)
    };
    walkthroughError = '';
    reviewedGameId = null;
    view = 'walkthrough';
    announcement = 'Analyzing recorded placements for the solve walkthrough';
    await tick();
    try {
      const result = await buildSolveWalkthroughAsync(sourceEvents, gameId, {
        onProgress: (progress) => {
          if (request === walkthroughRequest) walkthroughProgress = progress;
        },
        yieldControl: () => new Promise((resolve) => requestAnimationFrame(() => resolve()))
      });
      const remainingDisplayTime = 250 - (performance.now() - loadingStartedAt);
      if (remainingDisplayTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, remainingDisplayTime));
      }
      if (request !== walkthroughRequest) return;
      walkthrough = result;
      walkthroughStatus = 'ready';
      announcement = result.steps.length
        ? `Walkthrough ready with ${result.steps.length} recorded placements`
        : 'This attempt has no recorded placements to walk through';
    } catch (error) {
      if (request !== walkthroughRequest) return;
      walkthroughStatus = 'failed';
      walkthroughError = error instanceof Error ? error.message : 'The walkthrough could not be analyzed.';
      announcement = 'Walkthrough analysis failed';
    }
  }

  function moveWalkthrough(offset: number): void {
    if (!walkthrough) return;
    walkthroughIndex = Math.max(0, Math.min(walkthrough.steps.length - 1, walkthroughIndex + offset));
    const step = walkthrough.steps[walkthroughIndex];
    if (step) announcement = `Walkthrough placement ${walkthroughIndex + 1} of ${walkthrough.steps.length}: ${step.ruleLabel}`;
  }

  function closeWalkthrough(): void {
    walkthroughRequest += 1;
    walkthroughGameId = null;
    walkthroughIndex = 0;
    walkthrough = null;
    walkthroughStatus = 'idle';
    walkthroughProgress = { completed: 0, total: 0 };
    walkthroughError = '';
    view = 'history';
    announcement = 'Returned to History';
  }

  function showView(next: View): void {
    view = next;
    if (next === 'history') historyPage = 0;
    if (next !== 'play') reviewedGameId = null;
    if (next !== 'walkthrough') {
      walkthroughRequest += 1;
      walkthroughGameId = null;
      walkthroughIndex = 0;
      walkthrough = null;
      walkthroughStatus = 'idle';
      walkthroughProgress = { completed: 0, total: 0 };
      walkthroughError = '';
    }
  }

  async function changeSetting(key: keyof GameSettings): Promise<void> {
    if (!store) return;
    applyCommit(await store.changeSettings({ [key]: !projection.settings[key] }, metadata(false)), 'Setting saved on this device');
  }

  async function clearAllData(): Promise<void> {
    if (!store) return;
    projection = await store.clearAll();
    eventChannel?.postMessage({ type: 'events-changed', gameId: null });
    selectTabGame(null);
    reviewedGameId = null;
    selectedCell = null;
    clearDialogOpen = false;
    view = 'play';
    storageWarning = '';
    announcement = 'All local Sudoku data cleared';
  }

  function reviewGame(gameId: string): void {
    resetStripes();
    if (projection.games[gameId].status === 'active') {
      selectTabGame(gameId);
      reviewedGameId = null;
    } else reviewedGameId = gameId;
    selectedCell = null;
    view = 'play';
  }

  function selectDifficulty(difficulty: PuzzleDifficulty): void {
    selectedDifficulty = difficulty;
    announcement = `${difficultyLabel(difficulty)} level selected`;
  }
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<svelte:head><title>Sudoku — Local puzzle play</title></svelte:head>

<div class="app-shell" class:playing={currentGame || view === 'walkthrough'} data-e2e-layout data-app-ready={persistenceStatus !== 'checking'} data-persistence-status={persistenceStatus}>
  <header class="shell-header">
    <a class="brand" href="./" aria-label="Sudoku home">
      <span class="brand-mark" aria-hidden="true">{#each Array(9) as _}<i></i>{/each}</span>
      <span>Sudoku</span>
    </a>
    <div class="device-status" role="status"><span class:warning={persistenceStatus === 'memory-only'} aria-hidden="true"></span>{persistenceStatus === 'memory-only' ? 'Memory only' : 'On this device'}</div>
  </header>

  {#if storageWarning}
    <div class="app-warning" role="status">
      <strong>Storage notice</strong>
      <span>{storageWarning}</span>
    </div>
  {/if}

  <main>
    {#if incomingStatus !== 'none'}
      <section class="incoming-card" aria-labelledby="incoming-title" data-e2e-no-clip>
        {#if incomingStatus === 'checking'}
          <p class="dialog-symbol" aria-hidden="true">◇</p><p class="eyebrow">Shared puzzle</p><h1 id="incoming-title">Checking shared puzzle…</h1><p>Proving its solution and checking every field locally.</p>
        {:else if incomingStatus === 'invalid'}
          <p class="dialog-symbol invalid" aria-hidden="true">!</p><p class="eyebrow">Shared puzzle</p><h1 id="incoming-title">This puzzle cannot be opened.</h1><p role="alert">{incomingError}</p><button type="button" class="primary-action" onclick={dismissIncoming}>Return to Sudoku</button>
        {:else if incomingPuzzle}
          <p class="dialog-symbol valid" aria-hidden="true">✓</p><p class="eyebrow">Shared puzzle</p><h1 id="incoming-title">Shared puzzle ready</h1><p>The puzzle has one unique solution and was checked entirely on this device.</p>{#if incomingView === 'walkthrough'}<p>Opening it will analyze the shared placements and begin at placement 1.</p>{/if}
          <dl class="incoming-facts" class:work-facts={incomingPuzzle.work.length > 0 || incomingPuzzle.metadata !== null}><div><dt>Rating</dt><dd>{difficultyLabel(incomingPuzzle.puzzle.difficulty)}</dd></div><div><dt>Givens</dt><dd>{incomingPuzzle.clueCount}</dd></div>{#if incomingPuzzle.work.length > 0}<div><dt>Filled</dt><dd>{incomingPuzzle.filledCount}</dd></div><div><dt>Notes</dt><dd>{incomingPuzzle.notedCellCount}</dd></div>{/if}{#if incomingPuzzle.metadata}<div><dt>Time</dt><dd>{formatElapsed(incomingPuzzle.metadata.elapsedMs ?? 0)}</dd></div><div><dt>Hints</dt><dd>{incomingPuzzle.metadata.hintedCells?.length ?? 0}</dd></div><div><dt>Mistakes</dt><dd>{incomingPuzzle.metadata.mistakes ?? 0}</dd></div>{/if}<div><dt>Identity</dt><dd>#{incomingPuzzle.fingerprint.slice(0, 8)}</dd></div></dl>
          {#if activeGame?.status === 'active'}
            <p class="incoming-warning"><strong>A puzzle is already in progress.</strong> Opening this one will keep the current attempt in History as abandoned.</p>
            <div class="incoming-actions"><button type="button" onclick={dismissIncoming}>Keep current puzzle</button><button type="button" class="confirm" onclick={() => acceptIncoming(true)}>Abandon current and open {incomingView === 'walkthrough' ? 'walkthrough' : 'shared puzzle'}</button></div>
          {:else}
            <div class="incoming-actions"><button type="button" onclick={dismissIncoming}>Cancel</button><button type="button" class="confirm" onclick={() => acceptIncoming()}>{incomingView === 'walkthrough' ? 'Open walkthrough' : incomingPuzzle.work.length > 0 || incomingPuzzle.metadata ? 'Open shared work' : 'Start this puzzle'}</button></div>
          {/if}
        {/if}
      </section>
    {:else if view === 'settings'}
      <section class="library-view settings-view" aria-labelledby="settings-title">
        <div class="library-heading"><p class="eyebrow">On this device</p><h1 id="settings-title">Settings</h1><p>Puzzle preferences apply to new puzzles. Note appearance updates immediately. Everything stays in this browser.</p></div>
        <div class="settings-list">
          <button type="button" role="switch" aria-checked={projection.settings.checkMistakes} onclick={() => changeSetting('checkMistakes')}><span><strong>Check mistakes</strong><small>Mark entries that do not match the solution.</small></span><i aria-hidden="true"></i></button>
          <button type="button" role="switch" aria-checked={projection.settings.autoRemoveNotes} onclick={() => changeSetting('autoRemoveNotes')}><span><strong>Remove matching notes</strong><small>Clear a digit from peers after placing it.</small></span><i aria-hidden="true"></i></button>
          <button type="button" role="switch" aria-checked={projection.settings.showTimer} onclick={() => changeSetting('showTimer')}><span><strong>Show timer</strong><small>Display active solving time while you play.</small></span><i aria-hidden="true"></i></button>
          <button type="button" role="switch" aria-checked={projection.settings.numberFirst} onclick={() => changeSetting('numberFirst')}><span><strong>Number-first input</strong><small>Allow choosing a number before choosing its cell.</small></span><i aria-hidden="true"></i></button>
          <button type="button" role="switch" aria-checked={projection.settings.notesFirst} onclick={() => changeSetting('notesFirst')}><span><strong>Start in Notes mode</strong><small>Open new puzzles ready for pencil marks.</small></span><i aria-hidden="true"></i></button>
          <button type="button" role="switch" aria-checked={projection.settings.highlightMatchingNotes !== false} onclick={() => changeSetting('highlightMatchingNotes')}><span><strong>Highlight matching notes</strong><small>Emphasize candidates for the selected digit.</small></span><i aria-hidden="true"></i></button>
          <button type="button" role="switch" aria-checked={projection.settings.notesBold !== false} onclick={() => changeSetting('notesBold')}><span><strong>Bold notes</strong><small>Use heavier pencil-mark digits.</small></span><i aria-hidden="true"></i></button>
          <button type="button" role="switch" aria-checked={projection.settings.notesLarge !== false} onclick={() => changeSetting('notesLarge')}><span><strong>Large notes</strong><small>Fill each candidate slot for maximum legibility.</small></span><i aria-hidden="true"></i></button>
        </div>
        <section class="privacy-card" aria-labelledby="local-data-title"><div><h2 id="local-data-title">Local Sudoku data</h2><p>Delete every puzzle, event, preference, and recovery copy from this browser. This cannot be undone.</p></div><button type="button" onclick={() => clearDialogOpen = true}>Clear all local Sudoku data</button></section>
        <p class="settings-build" data-testid="build-marker">{buildLabel(version, revision)}</p>
      </section>
    {:else if view === 'history'}
      <section class="library-view" aria-labelledby="history-title">
        <div class="library-heading"><p class="eyebrow">On this device</p><h1 id="history-title">History</h1><p>Every attempt is reconstructed from its local event stream.</p></div>
        {#if historyGames.length === 0}
          <div class="empty-library"><strong>No puzzles yet</strong><span>Your completed and abandoned games will appear here.</span></div>
        {:else}
          <div class="history-list">
            {#each historyGames.slice(historyPage, historyPage + 1) as game}
              <article class="history-card" data-game-id={game.id}>
                <div><span class={`history-state ${game.status}`}>{game.status === 'complete' ? 'Solved' : game.status === 'abandoned' ? 'Abandoned' : 'In progress'}</span><h2>{difficultyLabel(game.puzzle.difficulty)} #{game.puzzle.id.slice(-8)}</h2></div>
                <dl><div><dt>Time</dt><dd>{formatElapsed(elapsedAt(game, timerNow))}</dd></div><div><dt>Mistakes</dt><dd>{game.mistakes}</dd></div><div><dt>Hints</dt><dd>{game.hints}</dd></div></dl>
                <div class="card-actions"><button type="button" onclick={() => reviewGame(game.id)}>{game.status === 'active' ? 'Open puzzle' : 'Review board'}</button>{#if game.status !== 'active'}<button type="button" onclick={() => startOver(game.id)}>Start over</button>{/if}<button type="button" onclick={() => openShareDialog(game.id)}>Share</button><button type="button" onclick={() => openWalkthrough(game.id)}>Walkthrough</button></div>
              </article>
            {/each}
          </div>
          {#if historyGames.length > 1}
            <nav class="history-pages" aria-label="History pages">
              <button type="button" onclick={() => historyPage -= 1} disabled={historyPage === 0}>Newer</button>
              <span>Attempt {historyPage + 1} of {historyGames.length}</span>
              <button type="button" onclick={() => historyPage += 1} disabled={historyPage === historyGames.length - 1}>Older</button>
            </nav>
          {/if}
        {/if}
      </section>
    {:else if view === 'walkthrough'}
      <section class="walkthrough-view" aria-labelledby="walkthrough-title">
        <div class="walkthrough-heading">
          <div><p class="eyebrow">Solve walkthrough</p><h1 id="walkthrough-title">Learn from this solve</h1></div>
          <button type="button" onclick={closeWalkthrough}>Back to History</button>
        </div>
        {#if walkthroughStatus === 'loading'}
          <div class="walkthrough-loading" role="status" aria-live="polite">
            <p class="eyebrow">Analyzing solve</p>
            <h2>Matching placements to book rules…</h2>
            <div class="walkthrough-progress" role="progressbar" aria-label="Walkthrough analysis progress" aria-valuemin="0" aria-valuemax={walkthroughProgress.total} aria-valuenow={walkthroughProgress.completed}>
              <span style={`width: ${walkthroughProgress.total ? (walkthroughProgress.completed / walkthroughProgress.total) * 100 : 0}%`}></span>
            </div>
            <p>{walkthroughProgress.total
              ? `Checked ${walkthroughProgress.completed} of ${walkthroughProgress.total} placements`
              : 'Looking for recorded placements…'}</p>
          </div>
        {:else if walkthroughStatus === 'ready' && walkthrough && walkthroughStep}
          <div class="walkthrough-workspace">
            <div class="walkthrough-board">
              <SudokuBoard
                game={walkthroughStep.game}
                selected={null}
                highlightAllNumberPeers={false}
                highlightMatchingNotes={walkthroughStep.game.settings.highlightMatchingNotes !== false}
                notesBold={walkthroughStep.game.settings.notesBold !== false}
                notesLarge={walkthroughStep.game.settings.notesLarge !== false}
                stripeMode={false}
                evenStripeOrigin={null}
                oddStripeOrigin={null}
                walkthroughTarget={walkthroughStep.targetCell}
                walkthroughContext={walkthroughStep.contextCells}
                interactive={false}
                onselect={() => {}}
                onfocuscell={() => {}}
                onnumber={() => {}}
                ontoggleNotes={() => {}}
                onerase={() => {}}
                onundo={() => {}}
                onredo={() => {}}
              />
              <div class="walkthrough-legend" aria-label="Walkthrough highlights"><span><i class="target"></i>Placement</span><span><i class="context"></i>Rule pattern</span></div>
            </div>
            <aside class="walkthrough-panel" aria-live="polite">
              <div class="walkthrough-progress" role="progressbar" aria-label="Walkthrough progress" aria-valuemin="1" aria-valuemax={walkthrough.steps.length} aria-valuenow={walkthroughIndex + 1}>
                <span style={`width: ${((walkthroughIndex + 1) / walkthrough.steps.length) * 100}%`}></span>
              </div>
              <p class="walkthrough-count">Placement {walkthroughIndex + 1} of {walkthrough.steps.length} · {formatElapsed(walkthroughStep.elapsedMs)}</p>
              <p class={`walkthrough-rule rule-${walkthroughStep.rule}`}>{walkthroughStep.ruleLabel}</p>
              <h2>{walkthroughStep.action}</h2>
              <p class="walkthrough-explanation">{walkthroughStep.explanation}</p>
              <p class="walkthrough-note">Each placement is checked against the book rules in order. The first rule that proves the move is shown; otherwise it is marked Unknown rule.</p>
              <div class="walkthrough-actions">
                <button type="button" onclick={() => moveWalkthrough(-1)} disabled={walkthroughIndex === 0}>Previous placement</button>
                <button type="button" class="next" onclick={() => moveWalkthrough(1)} disabled={walkthroughIndex === walkthrough.steps.length - 1}>Next placement</button>
              </div>
            </aside>
          </div>
        {:else if walkthroughStatus === 'failed'}
          <div class="walkthrough-empty" role="alert"><h2>Walkthrough unavailable</h2><p>{walkthroughError}</p></div>
        {:else}
          <div class="walkthrough-empty"><h2>No placements to replay</h2><p>This attempt does not contain any recorded value placements.</p></div>
        {/if}
      </section>
    {:else if view === 'photo-import'}
      <PhotoPuzzleImport
        hasActiveGame={activeGame?.status === 'active'}
        onclose={() => showView('puzzles')}
        onstart={startPhotoPuzzle}
      />
    {:else if view === 'puzzles'}
      <section class="library-view" aria-labelledby="puzzles-title">
        <div class="library-heading"><p class="eyebrow">Generated here</p><h1 id="puzzles-title">Puzzles</h1><p>Choose any chapter level. Every puzzle is generated and rated entirely on this device.</p></div>
        <div class="generation-panel" data-e2e-no-clip>
            <fieldset class="difficulty-picker"><legend>Puzzle level</legend><div>{#each DIFFICULTY_LEVELS as level}<button type="button" aria-pressed={selectedDifficulty === level.id} onclick={() => selectDifficulty(level.id)}><strong>{level.label}</strong><small>Chapter {level.chapter}</small></button>{/each}</div></fieldset>
            <p class="level-summary" aria-live="polite"><strong>{selectedLevel.label}</strong> · {selectedLevel.summary}</p>
            <button class="primary-action compact" type="button" onclick={generatePuzzle} disabled={generationStatus === 'generating'}>{generationStatus === 'generating' ? 'Generating and rating…' : `Generate ${selectedLevel.label} puzzle`}</button>
            {#if generationError}<p class="generation-error" role="alert">{generationError}</p>{/if}
            {#if activeGame?.status === 'active'}<p class="local-note">Generating another puzzle keeps this one available in History.</p>{/if}
        </div>
        <section class="photo-import-card" aria-labelledby="photo-option-title" data-e2e-no-clip>
          <div><p class="eyebrow">From paper</p><h2 id="photo-option-title">Have a puzzle in front of you?</h2><p>Take a photo and recognize its printed givens without sending the image anywhere.</p></div>
          <button type="button" onclick={() => showView('photo-import')}>Import from photo</button>
        </section>
      </section>
    {:else if currentGame}
      <section class="play-view" aria-labelledby="puzzle-title">
        <div class="puzzle-heading">
          <div><p class="eyebrow">{difficultyLabel(currentGame.puzzle.difficulty)} puzzle</p><h1 id="puzzle-title">{currentGame.status === 'complete' ? 'Puzzle complete' : currentGame.status === 'abandoned' ? 'Past attempt' : currentGame.paused ? 'Take your time.' : 'Ready when you are.'}</h1></div>
          <div class="session-status">
            {#if currentGame.settings.showTimer}<span class="timer" aria-label={`Elapsed time ${elapsedLabel}`}>{elapsedLabel}</span>{/if}
            {#if currentGame.status === 'active' && !reviewedGameId}<button type="button" class="pause-action" onclick={togglePause}>{currentGame.paused ? 'Resume' : 'Pause'}</button>{/if}
          </div>
        </div>

        <div class="game-workspace">
          <div class="board-column">
            {#if currentGame.paused && currentGame.status === 'active'}
              <button type="button" class="paused-cover" aria-label="Continue paused puzzle" onclick={togglePause} disabled={isReadOnly}>
                <span class="pause-icon" aria-hidden="true">Ⅱ</span><strong>Puzzle paused</strong><small role="status" aria-label="Puzzle paused">Tap anywhere to resume. Your active time is frozen.</small>
              </button>
            {:else}
              <SudokuBoard game={currentGame} selected={selectedCell} {highlightAllNumberPeers} highlightMatchingNotes={projection.settings.highlightMatchingNotes !== false} notesBold={projection.settings.notesBold !== false} notesLarge={projection.settings.notesLarge !== false} stripeMode={inputMode === 'stripes'} {evenStripeOrigin} {oddStripeOrigin} onselect={selectCell} onfocuscell={focusCell} onnumber={(cell, value) => enterDigit(value, cell)} ontoggleNotes={toggleNotesMode} onerase={eraseCellAt} onundo={undo} onredo={redo} />
            {/if}
            <span class="board-validation">Unique solution</span>
            <p class="board-caption">{currentGame.puzzle.provenance?.kind === 'camera-photo' ? 'Recognized and validated here' : currentGame.puzzle.provenance?.kind === 'puzzle-link' || currentGame.puzzle.provenance?.kind === 'progress-transfer' ? 'Validated here' : 'Generated and rated here'} · #{currentGame.puzzle.id.slice(-8)}</p>
          </div>

          <aside class="play-controls" aria-label="Puzzle controls">
            <div class="mode-switch" aria-label="Input mode">
              <button type="button" disabled={currentGame.paused || isReadOnly} class:active={inputMode === 'number'} aria-pressed={inputMode === 'number'} onclick={() => setInputMode('number')}>Number</button>
              <button type="button" disabled={currentGame.paused || isReadOnly} class:active={inputMode === 'notes'} aria-pressed={inputMode === 'notes'} onclick={() => setInputMode('notes')}>Notes</button>
              <button type="button" disabled={currentGame.paused || isReadOnly} class:active={inputMode === 'stripes'} aria-pressed={inputMode === 'stripes'} onclick={() => setInputMode('stripes')}>Stripes</button>
            </div>
            {#if inputMode === 'stripes'}
              <div class="stripe-tools" aria-label="Stripe controls">
                <div class="stripe-status">
                  <span class:even={nextStripeType === 'even'} class:odd={nextStripeType === 'odd'} aria-hidden="true"></span>
                  <p><strong>{nextStripeType === 'even' ? 'Even' : 'Odd'} stripes next</strong><small>Tap a cell to mark all 20 peers.</small></p>
                </div>
                <button type="button" onclick={() => resetStripes(true)} disabled={evenStripeOrigin === null && oddStripeOrigin === null}>Clear stripes</button>
              </div>
            {:else}
            <div class="number-pad" aria-label="Number pad">
              {#each digits as value}
                {@const count = remaining(value)}
                {@const removableNote = inputMode === 'notes' && selectedCell !== null && currentGame.notes[selectedCell].includes(value)}
                <button type="button" disabled={currentGame.paused || isReadOnly || (count === 0 && !removableNote)} class:complete-number={count === 0} class:selected-number={selectedDigit === value} aria-pressed={selectedDigit === value} onclick={() => enterDigit(value)} aria-label={`${value}, ${count} remaining`}>
                  <strong>{value}</strong><small>{count}</small>
                </button>
              {/each}
              {#if inputMode === 'notes'}<button type="button" class="all-notes" onclick={fillAllNotes} disabled={!canFillAllNotes} aria-label="All notes"><strong>All</strong></button>{/if}
            </div>
            {/if}
            <div class="utility-actions">
              <button type="button" onclick={undo} disabled={!undoMove || currentGame.paused} aria-label={undoMove ? `Undo ${describeMove(undoMove)}` : 'Undo'}>Undo</button>
              <button type="button" onclick={redo} disabled={!redoMove || currentGame.paused} aria-label={redoMove ? `Redo ${describeMove(redoMove)}` : 'Redo'}>Redo</button>
              <button type="button" onclick={eraseCell} disabled={!canErase}>Erase</button>
              <button type="button" onclick={() => hintDialogOpen = true} disabled={currentGame.paused || isReadOnly}>Hint</button>
            </div>
            {#if currentGame.status === 'active' && !reviewedGameId}<div class="game-management"><button type="button" onclick={() => openShareDialog(currentGame.id)}>Share</button><button type="button" onclick={restartGame}>Restart</button><button type="button" onclick={abandonGame}>Abandon</button></div>{/if}
            {#if currentGame.status === 'complete'}
              <section class="completion-panel" aria-labelledby="complete-title"><h2 id="complete-title">Puzzle complete</h2><p>{difficultyLabel(currentGame.puzzle.difficulty)} · {elapsedLabel} · {currentGame.mistakes} {currentGame.mistakes === 1 ? 'mistake' : 'mistakes'} · {currentGame.hints} {currentGame.hints === 1 ? 'hint' : 'hints'}</p><div><button type="button" onclick={() => showView('history')}>View history</button><button type="button" onclick={() => showView('puzzles')}>Choose another puzzle</button></div></section>
            {/if}
            <section class="game-log" aria-labelledby="game-log-title" class:covered={currentGame.paused && currentGame.status === 'active'}>
              <div class="log-heading"><h2 id="game-log-title">Game log</h2><span>{gameLog.length} {gameLog.length === 1 ? 'event' : 'events'}</span></div>
              {#if currentGame.paused && currentGame.status === 'active'}<p class="log-paused">Resume to inspect the game log.</p>{:else}<ol>{#each gameLog as entry}<li data-event-type={entry.type}><span>{entry.text}</span></li>{/each}</ol>{/if}
            </section>
          </aside>
        </div>
      </section>
    {:else}
      <section class="hero-card" aria-labelledby="welcome-title" data-e2e-no-clip>
        <div class="puzzle-preview" aria-hidden="true">{#each Array(81) as _, cell}<span>{cell % 10 === 0 ? ((cell % 9) + 1) : ''}</span>{/each}</div>
        <div class="welcome-copy">
          <p class="eyebrow">Five chapter levels · generated here</p><h1 id="welcome-title">A quiet place to solve.</h1>
          <p class="introduction">Sudoku creates and validates each puzzle entirely on this device. No account, tracking, or connection required.</p>
          <ul class="proof-list" aria-label="Puzzle promises"><li><span aria-hidden="true">✓</span> Unique solution</li><li><span aria-hidden="true">✓</span> No guessing required</li><li><span aria-hidden="true">✓</span> Ready for offline play</li></ul>
          <fieldset class="difficulty-picker"><legend>Puzzle level</legend><div>{#each DIFFICULTY_LEVELS as level}<button type="button" aria-pressed={selectedDifficulty === level.id} onclick={() => selectDifficulty(level.id)}><strong>{level.label}</strong><small>Chapter {level.chapter}</small></button>{/each}</div></fieldset>
          <p class="level-summary" aria-live="polite"><strong>{selectedLevel.label}</strong> · {selectedLevel.summary}</p>
          {#if generationStatus === 'generating'}
            <button class="primary-action" type="button" disabled aria-busy="true">Generating and validating…</button>
          {:else}
            <button class="primary-action" type="button" onclick={generatePuzzle}>{generationStatus === 'failed' ? `Retry ${selectedLevel.label}` : `Generate ${selectedLevel.label} puzzle`}</button>
          {/if}
          {#if generationError}<p class="generation-error" role="alert">{generationError}</p>{/if}
          <p class="local-note">The puzzle and its solution never leave this browser.</p>
        </div>
      </section>
    {/if}
  </main>

  {#if shareDialogOpen}
    <div class="dialog-backdrop" role="presentation">
      <div class="share-dialog" role="dialog" aria-modal="true" aria-labelledby="share-title" data-e2e-no-clip>
        {#if shareStage === 'choose'}
          <p class="dialog-symbol" aria-hidden="true">↗</p><h2 id="share-title">Share this puzzle</h2><p>Choose what the link should carry to another device.</p>
          <div class="share-choices">
            <button type="button" onclick={sharePuzzleOnly}><strong>Share puzzle only</strong><small>The recipient starts with an empty board.</small></button>
            <button type="button" class="confirm" onclick={sharePuzzleWork}><strong>Share puzzle with work</strong><small>Includes values, notes, time, stats, and settings in a readable link.</small></button>
          </div>
          {#if shareError}<p class="share-error" role="alert">{shareError}</p>{/if}
          <button type="button" class="text-action" onclick={() => shareDialogOpen = false}>Cancel</button>
        {:else}
          <p class="eyebrow">{shareKind === 'work' ? 'Puzzle with work' : 'Puzzle link'}</p><h2 id="share-title">Scan on the other device</h2>
          <img class="share-qr" data-testid="share-qr" src={shareQr} alt={shareKind === 'work' ? 'QR code for opening this puzzle with its current work' : 'QR code for opening this puzzle'} />
          <p class="share-link-status" data-testid="share-link" data-link={shareLink}>Local link ready · {shareLink.length} characters</p>
          {#if shareKind === 'work'}<p class="transfer-note">The current values, candidates, time, hints, mistakes, and settings are readable in the link.</p>{:else}<p class="transfer-note">The other device will validate the puzzle before asking to start it.</p>{/if}
          {#if shareError}<p class="share-error" role="alert">{shareError}</p>{/if}
          <div class="share-actions"><button type="button" class="confirm" onclick={copyShareLink}>{shareCopied ? 'Link copied' : 'Copy link'}</button>{#if systemShareAvailable}<button type="button" onclick={openSystemShare}>Share link…</button>{/if}<button type="button" onclick={() => shareDialogOpen = false}>Done</button></div>
        {/if}
      </div>
    </div>
  {/if}

  {#if hintDialogOpen}
    <div class="dialog-backdrop" role="presentation">
      <div class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="hint-title">
        <p class="dialog-symbol" aria-hidden="true">◆</p><h2 id="hint-title">Reveal one cell?</h2><p>This will be recorded in your game summary.</p><div><button type="button" onclick={() => hintDialogOpen = false}>Cancel</button><button type="button" class="confirm" onclick={confirmHint}>Reveal one cell</button></div>
      </div>
    </div>
  {/if}

  {#if clearDialogOpen}
    <div class="dialog-backdrop" role="presentation">
      <div class="confirm-dialog danger-dialog" role="dialog" aria-modal="true" aria-labelledby="clear-title">
        <p class="dialog-symbol" aria-hidden="true">!</p><h2 id="clear-title">Clear all local data?</h2><p>Every puzzle, move, preference, and recovery copy will be permanently deleted.</p><div><button type="button" onclick={() => clearDialogOpen = false}>Cancel</button><button type="button" class="danger" onclick={clearAllData}>Clear everything</button></div>
      </div>
    </div>
  {/if}

  <p class="sr-live" aria-live="polite">{announcement}</p>
  <nav class="primary-nav" aria-label="Primary navigation"><button type="button" aria-current={view === 'play' ? 'page' : undefined} onclick={() => { reviewedGameId = null; showView('play'); }}><span aria-hidden="true">▦</span>Play</button><button type="button" aria-current={view === 'puzzles' || view === 'photo-import' ? 'page' : undefined} onclick={() => showView('puzzles')}><span aria-hidden="true">☷</span>Puzzles</button><button type="button" aria-current={view === 'history' || view === 'walkthrough' ? 'page' : undefined} onclick={() => showView('history')}><span aria-hidden="true">◷</span>History</button><button type="button" aria-current={view === 'settings' ? 'page' : undefined} onclick={() => showView('settings')}><span aria-hidden="true">⚙</span>Settings</button></nav>
  <footer><span>Private by design</span></footer>
</div>
