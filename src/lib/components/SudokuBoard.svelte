<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { Digit, GameProjection } from '$lib/domain/types';
  import type { SolveHintVisualization } from '$lib/domain/walkthrough';
  import { PEERS } from '$lib/domain/sudoku';
  import { difficultyLabel } from '$lib/domain/difficulty';
  import { recognizeStylusDigit, type StylusPoint, type StylusStroke } from '$lib/input/stylus-digit-recognizer';

  let {
    game,
    selected,
    highlightAllNumberPeers,
    highlightMatchingNotes,
    notesBold,
    notesLarge,
    stripeMode,
    evenStripeOrigin,
    oddStripeOrigin,
    walkthroughTarget = null,
    patternCells = [],
    visualHint = null,
    interactive = true,
    onselect,
    onfocuscell,
    onnumber,
    ontoggleNotes,
    onerase,
    onundo,
    onredo
  }: {
    game: GameProjection;
    selected: number | null;
    highlightAllNumberPeers: boolean;
    highlightMatchingNotes: boolean;
    notesBold: boolean;
    notesLarge: boolean;
    stripeMode: boolean;
    evenStripeOrigin: number | null;
    oddStripeOrigin: number | null;
    walkthroughTarget?: number | null;
    patternCells?: number[];
    visualHint?: SolveHintVisualization | null;
    interactive?: boolean;
    onselect: (cell: number) => void;
    onfocuscell: (cell: number) => void;
    onnumber: (cell: number, value: Digit) => void;
    ontoggleNotes: () => void;
    onerase: (cell: number) => void;
    onundo: () => void;
    onredo: () => void;
  } = $props();

  const rovingCell = $derived(selected ?? 0);
  const evenStripeCells = $derived(new Set(evenStripeOrigin === null ? [] : PEERS[evenStripeOrigin]));
  const oddStripeCells = $derived(new Set(oddStripeOrigin === null ? [] : PEERS[oddStripeOrigin]));
  const visualPatternCells = $derived(new Set(visualHint?.patternCells ?? []));
  const visualExclusionCells = $derived(new Set(visualHint?.exclusionCells ?? []));
  const visualCandidateCells = $derived(new Map(
    (visualHint?.candidateCells ?? []).map((candidate) => [candidate.cell, candidate])
  ));
  let stylusCell = $state<number | null>(null);
  let stylusStrokes = $state<StylusStroke[]>([]);
  let stylusFeedback = $state<{ cell: number; digit: Digit | null } | null>(null);
  let stylusAnnouncement = $state('');
  let activeStylusPointer: number | null = null;
  let activeStylusStroke = -1;
  let activeCellBounds: DOMRect | null = null;
  let recognitionTimer: ReturnType<typeof setTimeout> | null = null;
  let feedbackTimer: ReturnType<typeof setTimeout> | null = null;
  let suppressPenClickCell: number | null = null;
  let suppressPenClickUntil = 0;

  const selectedValue = $derived(
    selected === null || stripeMode
      ? null
      : game.puzzle.givens[selected] === '.'
        ? game.values[selected]
        : Number(game.puzzle.givens[selected])
  );
  const matchingCells = $derived.by(() => selectedValue === null
    ? []
    : Array.from({ length: 81 }, (_, cell) => cell).filter((cell) => {
        const given = game.puzzle.givens[cell];
        const value = given === '.' ? game.values[cell] : Number(given);
        return value === selectedValue;
      }));
  const matchingPeers = $derived.by(() => new Set(matchingCells.flatMap((cell) => PEERS[cell])));

  function label(cell: number): string {
    const given = game.puzzle.givens[cell];
    const value = given === '.' ? game.values[cell] : Number(given);
    const notes = game.notes[cell];
    const visualCandidates = visualCandidateCells.get(cell);
    return [
      `Row ${Math.floor(cell / 9) + 1}, column ${(cell % 9) + 1}`,
      given === '.' ? 'editable' : 'fixed',
      value ? String(value) : 'empty',
      notes.length ? `notes ${notes.join(' ')}` : '',
      game.hintedCells.includes(cell) ? 'revealed by hint' : '',
      game.conflicts.includes(cell) ? 'conflict' : '',
      game.mistakeCells.includes(cell) ? 'mistake' : '',
      evenStripeCells.has(cell) ? 'even stripe' : '',
      oddStripeCells.has(cell) ? 'odd stripe' : '',
      evenStripeOrigin === cell ? 'even stripe source' : '',
      oddStripeOrigin === cell ? 'odd stripe source' : '',
      walkthroughTarget === cell ? 'walkthrough target' : '',
      patternCells.includes(cell) ? 'rule pattern' : '',
      visualHint?.targetCell === cell ? 'visual hint destination' : '',
      visualPatternCells.has(cell) ? 'visual hint pattern' : '',
      visualExclusionCells.has(cell) ? 'visual hint exclusion' : '',
      visualCandidates?.emphasized.length ? `emphasized candidates ${visualCandidates.emphasized.join(' ')}` : '',
      visualCandidates?.endpoints.length ? `chain endpoint candidates ${visualCandidates.endpoints.join(' ')}` : '',
      visualCandidates?.colors.length ? `simple colors ${visualCandidates.colors.map(({ value, parity }) => `${value} ${parity}`).join(', ')}` : '',
      visualCandidates?.excluded.length ? `excluded candidates ${visualCandidates.excluded.join(' ')}` : '',
      !stripeMode && selected === cell ? 'selected' : ''
    ].filter(Boolean).join(', ');
  }

  function moveFocus(cell: number): void {
    onfocuscell(cell);
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-cell="${cell}"]`)?.focus();
    });
  }

  function clearTimer(timer: ReturnType<typeof setTimeout> | null): void {
    if (timer !== null) clearTimeout(timer);
  }

  function stylusPoint(event: PointerEvent): StylusPoint | null {
    if (!activeCellBounds) return null;
    return {
      x: Math.max(0, Math.min(1, (event.clientX - activeCellBounds.left) / activeCellBounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - activeCellBounds.top) / activeCellBounds.height))
    };
  }

  function appendStylusPoints(event: PointerEvent): void {
    if (activeStylusStroke < 0) return;
    const samples = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [event];
    for (const sample of samples.length ? samples : [event]) {
      const point = stylusPoint(sample);
      if (!point) continue;
      const stroke = stylusStrokes[activeStylusStroke];
      const previous = stroke.at(-1);
      if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) >= .008) stroke.push(point);
    }
  }

  function clearStylusInk(): void {
    stylusCell = null;
    stylusStrokes = [];
    stylusFeedback = null;
  }

  function recognizeStylusInk(): void {
    recognitionTimer = null;
    if (stylusCell === null) return;
    const cell = stylusCell;
    const recognition = recognizeStylusDigit(stylusStrokes);
    stylusFeedback = { cell, digit: recognition.digit };
    if (recognition.digit !== null) {
      stylusAnnouncement = `Handwritten ${recognition.digit} recognized in row ${Math.floor(cell / 9) + 1}, column ${(cell % 9) + 1}`;
      onnumber(cell, recognition.digit);
    } else {
      stylusAnnouncement = `Handwriting was not recognized in row ${Math.floor(cell / 9) + 1}, column ${(cell % 9) + 1}. Try the digit again`;
    }
    clearTimer(feedbackTimer);
    feedbackTimer = setTimeout(clearStylusInk, recognition.digit === null ? 900 : 550);
  }

  function handleStylusDown(event: PointerEvent): void {
    if (event.pointerType !== 'pen' || !interactive || stripeMode) return;
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-cell]') : null;
    const cell = Number(target?.dataset.cell);
    if (!target || !Number.isInteger(cell) || game.puzzle.givens[cell] !== '.' || game.paused) return;
    event.preventDefault();
    event.stopPropagation();
    clearTimer(recognitionTimer);
    clearTimer(feedbackTimer);
    if (stylusCell !== cell || stylusFeedback) stylusStrokes = [];
    stylusCell = cell;
    stylusFeedback = null;
    activeStylusPointer = event.pointerId;
    activeCellBounds = target.getBoundingClientRect();
    activeStylusStroke = stylusStrokes.length;
    stylusStrokes.push([]);
    appendStylusPoints(event);
    suppressPenClickCell = cell;
    suppressPenClickUntil = performance.now() + 600;
    try {
      (event.currentTarget as HTMLElement | null)?.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic pointer events and a few older pen implementations do not support capture.
    }
  }

  function handleStylusMove(event: PointerEvent): void {
    if (event.pointerType !== 'pen' || event.pointerId !== activeStylusPointer) return;
    event.preventDefault();
    appendStylusPoints(event);
  }

  function handleStylusUp(event: PointerEvent): void {
    if (event.pointerType !== 'pen' || event.pointerId !== activeStylusPointer) return;
    event.preventDefault();
    appendStylusPoints(event);
    activeStylusPointer = null;
    activeStylusStroke = -1;
    activeCellBounds = null;
    try {
      (event.currentTarget as HTMLElement | null)?.releasePointerCapture(event.pointerId);
    } catch {
      // The pointer may already have lost capture.
    }
    clearTimer(recognitionTimer);
    recognitionTimer = setTimeout(recognizeStylusInk, 320);
  }

  function handleStylusCancel(event: PointerEvent): void {
    if (event.pointerId !== activeStylusPointer) return;
    activeStylusPointer = null;
    activeStylusStroke = -1;
    activeCellBounds = null;
    clearTimer(recognitionTimer);
    clearStylusInk();
  }

  function handleCellClick(event: MouseEvent, cell: number): void {
    if (suppressPenClickCell === cell && performance.now() < suppressPenClickUntil) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (interactive) onselect(cell);
  }

  onDestroy(() => {
    clearTimer(recognitionTimer);
    clearTimer(feedbackTimer);
  });

  function hintArrowX(cell: number, value?: Digit): number {
    return (cell % 9) + (value === undefined ? .5 : ((value - 1) % 3 + .5) / 3);
  }

  function hintArrowY(cell: number, value?: Digit): number {
    return Math.floor(cell / 9) + (value === undefined ? .5 : (Math.floor((value - 1) / 3) + .5) / 3);
  }

  function handleKeydown(event: KeyboardEvent, cell: number): void {
    let target: number | null = null;
    if (event.key === 'ArrowLeft') target = cell % 9 === 0 ? cell : cell - 1;
    else if (event.key === 'ArrowRight') target = cell % 9 === 8 ? cell : cell + 1;
    else if (event.key === 'ArrowUp') target = cell < 9 ? cell : cell - 9;
    else if (event.key === 'ArrowDown') target = cell >= 72 ? cell : cell + 9;
    else if (event.key === 'Home') target = Math.floor(cell / 9) * 9;
    else if (event.key === 'End') target = Math.floor(cell / 9) * 9 + 8;
    if (target !== null) {
      event.preventDefault();
      moveFocus(target);
      return;
    }
    if (/^[1-9]$/.test(event.key)) {
      event.preventDefault();
      if (!stripeMode) onnumber(cell, Number(event.key) as Digit);
    } else if (event.key.toLowerCase() === 'n') {
      event.preventDefault();
      ontoggleNotes();
    } else if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      if (!stripeMode) onerase(cell);
    } else if (event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) onredo(); else onundo();
    }
  }
</script>

<div
  class="sudoku-board"
  role="grid"
  tabindex="-1"
  aria-label={`${difficultyLabel(game.puzzle.difficulty)} Sudoku puzzle, stylus handwriting enabled`}
  data-testid="sudoku-board"
  data-notes-bold={notesBold}
  data-notes-large={notesLarge}
  onpointerdown={handleStylusDown}
  onpointermove={handleStylusMove}
  onpointerup={handleStylusUp}
  onpointercancel={handleStylusCancel}
>
  {#each Array(9) as _, row}
    <div class="sudoku-row" role="row">
    {#each Array(9) as _, column}
      {@const cell = row * 9 + column}
      {@const given = game.puzzle.givens[cell]}
      {@const value = given === '.' ? game.values[cell] : Number(given)}
      {@const isPeer = !stripeMode && !highlightAllNumberPeers && selected !== null && PEERS[selected].includes(cell)}
      {@const matches = !stripeMode && !highlightAllNumberPeers && selectedValue !== null && value === selectedValue}
      {@const isNumberPeer = highlightAllNumberPeers && matchingPeers.has(cell)}
      {@const isNumberMatch = highlightAllNumberPeers && selectedValue !== null && value === selectedValue}
      {@const visualCandidates = visualCandidateCells.get(cell)}
      <button
        type="button"
        class="sudoku-cell"
        class:given={given !== '.'}
        class:selected={!stripeMode && selected === cell}
        class:peer={isPeer}
        class:matching={matches}
        class:number-peer={isNumberPeer}
        class:number-match={isNumberMatch}
        class:conflict={game.conflicts.includes(cell)}
        class:mistake={game.mistakeCells.includes(cell)}
        class:hinted={game.hintedCells.includes(cell)}
        class:stripe-even={evenStripeCells.has(cell)}
        class:stripe-odd={oddStripeCells.has(cell)}
        class:walkthrough-target={walkthroughTarget === cell}
        class:walkthrough-context={patternCells.includes(cell)}
        class:visual-hint-target={visualHint?.targetCell === cell}
        class:visual-hint-pattern={visualPatternCells.has(cell)}
        class:box-right={column === 2 || column === 5}
        class:box-bottom={row === 2 || row === 5}
        class:last-column={column === 8}
        class:last-row={row === 8}
        role="gridcell"
        aria-label={label(cell)}
        aria-selected={stripeMode ? undefined : selected === cell}
        aria-readonly={!interactive || given !== '.'}
        disabled={!interactive}
        tabindex={interactive && rovingCell === cell ? 0 : -1}
        data-cell={cell}
        data-stripes={`${evenStripeCells.has(cell) ? 'even' : ''}${evenStripeCells.has(cell) && oddStripeCells.has(cell) ? ' ' : ''}${oddStripeCells.has(cell) ? 'odd' : ''}` || undefined}
        data-stripe-source={evenStripeOrigin === cell && oddStripeOrigin === cell ? 'even odd' : evenStripeOrigin === cell ? 'even' : oddStripeOrigin === cell ? 'odd' : undefined}
        data-highlight={isNumberMatch ? 'number-match' : isNumberPeer ? 'number-peer' : matches ? 'matching' : isPeer ? 'peer' : undefined}
        data-visual-hint-target={visualHint?.targetCell === cell ? 'true' : undefined}
        data-visual-hint-pattern={visualPatternCells.has(cell) ? 'true' : undefined}
        data-visual-hint-exclusion={visualExclusionCells.has(cell) ? 'true' : undefined}
        data-e2e-board-cell
        onclick={(event) => handleCellClick(event, cell)}
        onkeydown={(event) => { if (interactive) handleKeydown(event, cell); }}
      >
        {#if evenStripeOrigin === cell}<span class="stripe-source-mark even" aria-hidden="true">E</span>{/if}
        {#if oddStripeOrigin === cell}<span class="stripe-source-mark odd" aria-hidden="true">O</span>{/if}
        {#if value}
          <span class="cell-value">{value}</span>
        {:else if visualCandidates || game.notes[cell].length}
          <span class="cell-notes" class:visual-candidates={visualCandidates !== undefined} aria-hidden="true">
            {#each Array(9) as _, note}
              {@const noteValue = (note + 1) as Digit}
              {@const noteIsPresent = visualCandidates
                ? visualCandidates.values.includes(noteValue)
                : game.notes[cell].includes(noteValue)}
              {@const noteMatches = highlightMatchingNotes && selectedValue === noteValue && noteIsPresent}
              {@const visuallyEmphasized = visualCandidates?.emphasized.includes(noteValue) ?? false}
              {@const visuallyEndpoint = visualCandidates?.endpoints.includes(noteValue) ?? false}
              {@const visualColor = visualCandidates?.colors.find(({ value }) => value === noteValue)?.parity}
              {@const visuallyExcluded = visualCandidates?.excluded.includes(noteValue) ?? false}
              <i
                class:matching-note={noteMatches}
                class:visual-emphasis={visuallyEmphasized}
                class:visual-endpoint={visuallyEndpoint}
                class:visual-color-even={visualColor === 'even'}
                class:visual-color-odd={visualColor === 'odd'}
                class:visual-excluded={visuallyExcluded}
                data-highlight={noteMatches ? 'matching-note' : undefined}
                data-visual-candidate={visuallyExcluded ? 'excluded' : visualColor ?? (visuallyEndpoint ? 'endpoint' : visuallyEmphasized ? 'emphasized' : undefined)}
              >{noteIsPresent ? noteValue : ''}</i>
            {/each}
          </span>
        {/if}
        {#if game.conflicts.includes(cell)}<span class="conflict-mark" aria-hidden="true">!</span>{/if}
        {#if game.mistakeCells.includes(cell) && !game.conflicts.includes(cell)}<span class="mistake-mark" aria-hidden="true">×</span>{/if}
        {#if game.hintedCells.includes(cell)}<span class="hint-mark" aria-hidden="true">◆</span>{/if}
        {#if stylusFeedback?.cell === cell}
          <span class:rejected={stylusFeedback.digit === null} class="stylus-result-mark" aria-hidden="true">{stylusFeedback.digit ?? '?'}</span>
        {/if}
      </button>
    {/each}
    </div>
  {/each}
  <svg class="stripe-overlay" data-testid="stripe-overlay" viewBox="0 0 9 9" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <pattern id="sudoku-even-stripes" width=".24" height=".24" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="-.24" x2="0" y2=".48" stroke="#4654a3" stroke-opacity=".55" stroke-width="1" vector-effect="non-scaling-stroke" />
      </pattern>
      <pattern id="sudoku-odd-stripes" width=".24" height=".24" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1=".12" y1="-.24" x2=".12" y2=".48" stroke="#b7791f" stroke-opacity=".55" stroke-width="1" vector-effect="non-scaling-stroke" />
      </pattern>
    </defs>
    {#each Array(81) as _, cell}
      {@const row = Math.floor(cell / 9)}
      {@const column = cell % 9}
      {#if evenStripeCells.has(cell)}
        <rect x={column} y={row} width="1" height="1" fill="url(#sudoku-even-stripes)" data-stripe-cell={cell} data-stripe-kind="even" />
      {/if}
      {#if oddStripeCells.has(cell)}
        <rect x={column} y={row} width="1" height="1" fill="url(#sudoku-odd-stripes)" data-stripe-cell={cell} data-stripe-kind="odd" />
      {/if}
    {/each}
  </svg>
  {#if visualHint}
    <svg class="hint-visual-overlay" data-testid="visual-hint-overlay" viewBox="0 0 9 9" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <marker id="visual-hint-arrowhead" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L5,2.5 L0,5 z" />
        </marker>
        <marker id="visual-hint-exclusion-arrowhead" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto" markerUnits="strokeWidth">
          <path class="exclusion-arrowhead" d="M0,0 L5,2.5 L0,5 z" />
        </marker>
      </defs>
      {#each visualHint.exclusionCells as cell}
        <rect
          class="hint-exclusion-area"
          x={cell % 9}
          y={Math.floor(cell / 9)}
          width="1"
          height="1"
          data-hint-exclusion={cell}
        />
      {/each}
      {#each visualHint.arrows as arrow}
        <line
          class="hint-arrow"
          class:candidate-arrow={arrow.fromValue !== undefined && arrow.toValue !== undefined}
          class:conjugate-link={arrow.kind === 'conjugate'}
          class:elimination-link={arrow.kind === 'elimination'}
          x1={hintArrowX(arrow.fromCell, arrow.fromValue)}
          y1={hintArrowY(arrow.fromCell, arrow.fromValue)}
          x2={hintArrowX(arrow.toCell, arrow.toValue)}
          y2={hintArrowY(arrow.toCell, arrow.toValue)}
          marker-end={arrow.kind === 'elimination'
            ? 'url(#visual-hint-exclusion-arrowhead)'
            : 'url(#visual-hint-arrowhead)'}
          data-hint-arrow={`${arrow.fromCell}:${arrow.fromValue ?? ''}-${arrow.toCell}:${arrow.toValue ?? ''}`}
        />
      {/each}
    </svg>
  {/if}
  {#if stylusCell !== null && stylusStrokes.length}
    {@const inkCell = stylusCell}
    <svg
      class:rejected={stylusFeedback?.digit === null}
      class:recognized={stylusFeedback?.digit !== null && stylusFeedback !== null}
      class="stylus-overlay"
      data-testid="stylus-overlay"
      viewBox="0 0 9 9"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {#each stylusStrokes as stroke}
        {#if stroke.length}
          <polyline
            points={stroke.map(({ x, y }) => `${(inkCell % 9) + x},${Math.floor(inkCell / 9) + y}`).join(' ')}
          />
        {/if}
      {/each}
    </svg>
  {/if}
</div>
<span class="sr-live" role="status" aria-live="polite">{stylusAnnouncement}</span>
