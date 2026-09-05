<script lang="ts">
  import { difficultyLabel } from '$lib/domain/difficulty';
  import type { Digit } from '$lib/domain/types';
  import {
    recognizeSudokuPhoto,
    type PhotoRecognitionPhase,
    type PhotoRecognitionProgress
  } from '$lib/photo/photo-recognition';
  import { preparePhotoReview } from '$lib/photo/photo-review';
  import type { SharedPuzzleValidation } from '$lib/sharing/puzzle-link';
  import { validateSharedPuzzleInWorker } from '$lib/sharing/puzzle-validation-service';

  type Stage = 'choose' | 'recognizing' | 'review' | 'validating';

  let {
    hasActiveGame,
    onclose,
    onstart
  }: {
    hasActiveGame: boolean;
    onclose: () => void;
    onstart: (validation: SharedPuzzleValidation, abandonCurrent: boolean) => Promise<void>;
  } = $props();

  let fileInput = $state<HTMLInputElement>();
  let stage = $state<Stage>('choose');
  let values = $state<Array<Digit | null>>(Array(81).fill(null));
  let uncertainCells = $state<number[]>([]);
  let detectedCellCount = $state(0);
  let selectedCell = $state<number | null>(null);
  let previewDataUrl = $state('');
  let validation = $state<SharedPuzzleValidation | null>(null);
  let error = $state('');
  let progress = $state<PhotoRecognitionProgress>({ phase: 'preparing', completed: 0, total: 1 });

  const clueCount = $derived(values.filter((value) => value !== null).length);
  const progressPercent = $derived.by(() => {
    if (progress.phase === 'preparing') return 5;
    if (progress.phase === 'finding-grid') return 16;
    if (progress.phase === 'loading-reader') return 28;
    if (progress.phase === 'checking-puzzle') return 98;
    return 28 + Math.round((progress.completed / Math.max(1, progress.total)) * 67);
  });
  const progressLabel = $derived(progressText(progress.phase));

  function progressText(phase: PhotoRecognitionPhase): string {
    if (phase === 'preparing') return 'Preparing photo…';
    if (phase === 'finding-grid') return 'Finding and straightening the grid…';
    if (phase === 'loading-reader') return 'Loading the on-device digit reader…';
    if (phase === 'checking-puzzle') return 'Checking the confident givens…';
    return `Reading printed digits ${progress.completed} of ${progress.total}…`;
  }

  async function choosePhoto(event: Event): Promise<void> {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    stage = 'recognizing';
    error = '';
    validation = null;
    selectedCell = null;
    try {
      const result = await recognizeSudokuPhoto(file, (next) => progress = next);
      progress = { phase: 'checking-puzzle', completed: 0, total: 1 };
      const review = await preparePhotoReview(result, validateSharedPuzzleInWorker);
      values = review.values;
      uncertainCells = review.uncertainCells;
      validation = review.validation;
      detectedCellCount = result.detectedCellCount;
      previewDataUrl = result.previewDataUrl;
      selectedCell = review.uncertainCells[0] ?? review.values.findIndex((value) => value !== null);
      stage = 'review';
    } catch (recognitionError) {
      error = recognitionError instanceof Error ? recognitionError.message : 'This puzzle could not be recognized.';
      stage = 'choose';
    } finally {
      if (fileInput) fileInput.value = '';
    }
  }

  function editCell(cell: number): void {
    selectedCell = cell;
  }

  function setDigit(value: Digit | null): void {
    if (selectedCell === null) return;
    values[selectedCell] = value;
    values = [...values];
    uncertainCells = uncertainCells.filter((cell) => cell !== selectedCell);
    validation = null;
    error = '';
  }

  function handleGridKeydown(event: KeyboardEvent, cell: number): void {
    let target = cell;
    if (event.key === 'ArrowLeft') target = Math.max(0, cell - 1);
    else if (event.key === 'ArrowRight') target = Math.min(80, cell + 1);
    else if (event.key === 'ArrowUp') target = Math.max(0, cell - 9);
    else if (event.key === 'ArrowDown') target = Math.min(80, cell + 9);
    else if (event.key === 'Home') target = Math.floor(cell / 9) * 9;
    else if (event.key === 'End') target = Math.floor(cell / 9) * 9 + 8;
    else if (/^[1-9]$/.test(event.key)) {
      selectedCell = cell;
      setDigit(Number(event.key) as Digit);
      event.preventDefault();
      return;
    } else if (event.key === 'Backspace' || event.key === 'Delete') {
      selectedCell = cell;
      setDigit(null);
      event.preventDefault();
      return;
    } else return;
    event.preventDefault();
    selectedCell = target;
    queueMicrotask(() => document.querySelector<HTMLElement>(`[data-photo-cell="${target}"]`)?.focus());
  }

  async function checkPuzzle(): Promise<void> {
    stage = 'validating';
    validation = null;
    error = '';
    try {
      const givens = values.map((value) => value ?? '.').join('');
      validation = await validateSharedPuzzleInWorker(givens);
      stage = 'review';
    } catch (validationError) {
      error = validationError instanceof Error ? validationError.message : 'This puzzle could not be validated.';
      stage = 'review';
    }
  }

  function startAgain(): void {
    stage = 'choose';
    values = Array(81).fill(null);
    uncertainCells = [];
    detectedCellCount = 0;
    selectedCell = null;
    previewDataUrl = '';
    validation = null;
    error = '';
  }

  async function startValidatedPuzzle(): Promise<void> {
    if (validation) await onstart(validation, hasActiveGame);
  }
</script>

<section class="photo-import" aria-labelledby="photo-import-title" data-e2e-no-clip>
  <header>
    <div><p class="eyebrow">On-device recognition</p><h1 id="photo-import-title">Import from a photo</h1></div>
    <button type="button" class="close-action" onclick={onclose}>Back to Puzzles</button>
  </header>

  {#if stage === 'choose'}
    <div class="capture-card">
      <span class="camera-symbol" aria-hidden="true">▣</span>
      <h2>Photograph a printed Sudoku</h2>
      <p>Fill the frame with one straight, well-lit 9×9 grid. Printed digits work best; handwriting may need correction.</p>
      <button type="button" class="capture-action" onclick={() => fileInput?.click()}>Take or choose photo</button>
      <input bind:this={fileInput} class="file-input" type="file" accept="image/*" capture="environment" onchange={choosePhoto} aria-label="Choose Sudoku photo" />
      <small>The photo and digit recognition stay entirely on this device.</small>
      {#if error}<p class="photo-error" role="alert">{error}</p>{/if}
    </div>
  {:else if stage === 'recognizing'}
    <div class="recognition-card" role="status" aria-live="polite">
      <span class="camera-symbol scanning" aria-hidden="true">▦</span>
      <h2>Reading your puzzle</h2>
      <div class="photo-progress" role="progressbar" aria-label="Photo recognition progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progressPercent}><span style={`width:${progressPercent}%`}></span></div>
      <p>{progressLabel}</p>
      <small>This can take a moment the first time the on-device reader opens.</small>
    </div>
  {:else}
    <div class="review-workspace">
      <div class="review-board-wrap">
        <div class="photo-grid" aria-label="Recognized Sudoku givens">
          {#each values as value, cell}
            <button
              type="button"
              data-photo-cell={cell}
              data-e2e-board-cell
              class:selected={selectedCell === cell}
              class:uncertain={uncertainCells.includes(cell)}
              class:box-right={(cell + 1) % 3 === 0 && (cell + 1) % 9 !== 0}
              class:box-bottom={Math.floor(cell / 9) % 3 === 2 && cell < 72}
              aria-label={`Row ${Math.floor(cell / 9) + 1}, column ${(cell % 9) + 1}, ${value ? `given ${value}` : 'empty'}${uncertainCells.includes(cell) ? ', check recognition' : ''}`}
              aria-pressed={selectedCell === cell}
              tabindex={selectedCell === cell || (selectedCell === null && cell === 0) ? 0 : -1}
              onclick={() => editCell(cell)}
              onkeydown={(event) => handleGridKeydown(event, cell)}
            >{value ?? ''}</button>
          {/each}
        </div>
        <p><strong>{clueCount} givens</strong>{#if uncertainCells.length} · <span>{uncertainCells.length} {uncertainCells.length === 1 ? 'cell needs' : 'cells need'} a closer look</span>{/if}</p>
      </div>

      <aside class="review-controls">
        <div>
          <p class="eyebrow">Check recognition</p>
          <h2>{validation ? 'Puzzle ready' : 'Correct any digit'}</h2>
          {#if validation}
            <p class="validation-success">✓ One unique solution · {difficultyLabel(validation.puzzle.difficulty)}</p>
          {:else}
            <p>Compare the grid with the photo. Amber cells were difficult to read.</p>
          {/if}
        </div>
        <div class="photo-number-pad" aria-label="Given digit pad">
          {#each [1, 2, 3, 4, 5, 6, 7, 8, 9] as digit}
            <button type="button" onclick={() => setDigit(digit as Digit)} disabled={selectedCell === null}>{digit}</button>
          {/each}
          <button type="button" class="clear-digit" onclick={() => setDigit(null)} disabled={selectedCell === null}>Clear</button>
        </div>
        {#if error}<p class="photo-error" role="alert">{error}</p>{/if}
        {#if validation && hasActiveGame}
          <p class="active-warning"><strong>A puzzle is already in progress.</strong> Starting this one will keep the current attempt in History as abandoned.</p>
        {/if}
        <div class="review-actions">
          <button type="button" onclick={startAgain}>Use another photo</button>
          {#if validation}
            <button type="button" class="confirm" onclick={startValidatedPuzzle}>{hasActiveGame ? 'Abandon current and start' : 'Start photographed puzzle'}</button>
          {:else}
            <button type="button" class="confirm" onclick={checkPuzzle} disabled={stage === 'validating'}>{stage === 'validating' ? 'Checking solution…' : 'Check puzzle'}</button>
          {/if}
        </div>
        {#if previewDataUrl}<details><summary>View straightened photo</summary><img src={previewDataUrl} alt="Straightened grayscale Sudoku used for recognition" /></details>{/if}
        <small class="detected-note">Detected ink in {detectedCellCount} cells. Nothing is saved until you start the puzzle.</small>
      </aside>
    </div>
  {/if}
</section>

<style>
  .photo-import { width: min(100%, 960px); height: 100%; min-height: 0; display: grid; grid-template-rows: auto minmax(0, 1fr); gap: 18px; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 18px; }
  h1 { font-size: clamp(2rem, 5vw, 3.15rem); }
  h2 { margin: 0; font-size: clamp(1.25rem, 4vw, 1.7rem); }
  p { margin: 0; color: #62656b; line-height: 1.4; }
  button { cursor: pointer; }
  button:disabled { cursor: progress; opacity: .55; }
  .close-action { flex: 0 0 auto; min-height: 44px; padding: 7px 12px; border: 1px solid #c8c7c2; border-radius: 8px; color: #4654a3; background: #fffdf8; font-weight: 700; }
  .capture-card, .recognition-card { width: min(100%, 560px); align-self: start; justify-self: center; display: grid; justify-items: center; gap: 13px; margin-top: clamp(12px, 5vh, 48px); padding: clamp(24px, 6vw, 42px); border: 1px solid #d7d5cd; border-radius: 18px; background: #fffdf8; text-align: center; }
  .capture-card > p { max-width: 42ch; }
  .camera-symbol { width: 54px; height: 54px; display: grid; place-items: center; border-radius: 50%; color: #303a7d; background: #e1e4f7; font-size: 1.55rem; }
  .camera-symbol.scanning { animation: pulse 1.4s ease-in-out infinite; }
  @keyframes pulse { 50% { box-shadow: 0 0 0 10px #e1e4f766; } }
  .capture-action { width: min(100%, 320px); min-height: 50px; border: 0; border-radius: 11px; color: #fff; background: #4654a3; font-weight: 700; }
  .file-input { position: fixed; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
  small { color: #777a80; font-size: .78rem; }
  .photo-error { width: 100%; padding: 9px; border-radius: 8px; color: #9b2c24; background: #fff0ee; font-size: .84rem; text-align: left; }
  .photo-progress { width: 100%; height: 10px; overflow: hidden; border-radius: 999px; background: #e2e1dc; }
  .photo-progress span { height: 100%; display: block; border-radius: inherit; background: #4654a3; transition: width .2s ease; }
  .review-workspace { min-height: 0; display: grid; grid-template-columns: minmax(0, 600px) minmax(260px, 310px); gap: 24px; align-items: start; justify-content: center; }
  .review-board-wrap { min-width: 0; display: grid; justify-items: center; gap: 8px; }
  .review-board-wrap > p { font-size: .82rem; }
  .review-board-wrap > p span { color: #8a5818; }
  .photo-grid { width: min(100%, 600px); aspect-ratio: 1; display: grid; grid-template-columns: repeat(9, minmax(0, 1fr)); grid-template-rows: repeat(9, minmax(0, 1fr)); border: 3px solid #343840; background: #fff; }
  .photo-grid button { min-width: 0; padding: 0; border: 0; border-right: 1px solid #c8c7c2; border-bottom: 1px solid #c8c7c2; border-radius: 0; color: #20242b; background: #fffdf8; font-size: clamp(1rem, 4vw, 2rem); font-weight: 700; }
  .photo-grid button:nth-child(9n) { border-right: 0; }
  .photo-grid button:nth-child(n+73) { border-bottom: 0; }
  .photo-grid button.box-right { border-right: 3px solid #343840; }
  .photo-grid button.box-bottom { border-bottom: 3px solid #343840; }
  .photo-grid button.uncertain { color: #754c16; background: #fff0cf; }
  .photo-grid button.selected { z-index: 1; background: #eceefa; box-shadow: inset 0 0 0 3px #4654a3; }
  .photo-grid button.uncertain.selected { background: #fff0cf; box-shadow: inset 0 0 0 3px #b7791f; }
  .review-controls { min-width: 0; display: grid; gap: 10px; padding: 16px; border: 1px solid #d7d5cd; border-radius: 14px; background: #fffdf8; }
  .review-controls > div:first-child { display: grid; gap: 5px; }
  .review-controls > div:first-child > p:last-child { font-size: .84rem; }
  .validation-success { padding: 8px; border-radius: 8px; color: #257653 !important; background: #e4f4ec; font-weight: 700; }
  .photo-number-pad { display: grid; grid-template-columns: repeat(5, 1fr); gap: 5px; }
  .photo-number-pad button { min-width: 44px; min-height: 46px; padding: 0; border: 1px solid #c8c7c2; border-radius: 8px; color: #4654a3; background: #fff; font-size: 1.15rem; font-weight: 700; }
  .photo-number-pad .clear-digit { grid-column: 5; color: #9b2c24; font-size: .8rem; }
  .active-warning { padding: 9px; border-radius: 8px; color: #754c16; background: #fff0cf; font-size: .8rem; }
  .review-actions { display: grid; grid-template-columns: 1fr 1.2fr; gap: 6px; }
  .review-actions button { min-height: 48px; padding: 6px; border: 1px solid #c8c7c2; border-radius: 8px; color: #4654a3; background: #fff; font-size: .82rem; font-weight: 700; }
  .review-actions button.confirm { border-color: #4654a3; color: #fff; background: #4654a3; }
  details { min-width: 0; color: #62656b; font-size: .8rem; }
  summary { min-height: 32px; cursor: pointer; }
  details img { width: min(100%, 240px); display: block; margin: 5px auto 0; border: 1px solid #c8c7c2; }
  .detected-note { text-align: center; }

  @media (max-width: 599px) {
    .photo-import { gap: 9px; }
    header .eyebrow { display: none; }
    header h1 { font-size: 1.45rem; }
    .review-workspace { grid-template-columns: 1fr; gap: 7px; }
    .photo-grid { width: min(100%, 390px, 43svh); }
    .review-board-wrap { gap: 3px; }
    .review-controls { gap: 6px; padding: 9px; }
    .review-controls h2 { font-size: 1.15rem; }
    .review-controls > div:first-child > p:not(.eyebrow, .validation-success) { display: none; }
    .review-controls .eyebrow { margin-bottom: 0; }
    .photo-number-pad button { min-height: 44px; }
    details, .detected-note { display: none; }
  }

  @media (max-height: 650px) {
    .photo-import { gap: 5px; }
    header .eyebrow { display: none; }
    header h1 { font-size: 1.35rem; }
    .capture-card, .recognition-card { gap: 7px; margin-top: 0; padding: 12px; }
  }

  @media (min-width: 600px) and (max-height: 650px) {
    .review-workspace { grid-template-columns: minmax(0, 1fr) 280px; gap: 12px; }
    .photo-grid { width: min(100%, calc(100svh - 120px)); }
    .review-controls { gap: 5px; padding: 9px; }
    details, .detected-note { display: none; }
  }
</style>
