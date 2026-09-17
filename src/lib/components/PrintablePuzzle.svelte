<script lang="ts">
  import CageOverlay from './CageOverlay.svelte';
  import { difficultyLabel } from '$lib/domain/difficulty';
  import type { GameProjection } from '$lib/domain/types';
  import type { PrintablePuzzleKind } from '$lib/printing/printable-puzzle';

  let { game, puzzleQr, walkthroughQr, puzzleQrSize = 144, walkthroughQrSize = 144, kind }: {
    game: GameProjection;
    puzzleQr: string;
    walkthroughQr: string;
    kind: PrintablePuzzleKind;
    puzzleQrSize?: number;
    walkthroughQrSize?: number;
  } = $props();

  const killer = $derived(game.puzzle.variant === 'killer');
  const boardX = $derived(killer ? 108 : 98.4);
  const boardY = 160;
  const boardSize = $derived(killer ? 600 : 619.2);
  const cellSize = $derived(boardSize / 9);
</script>

{#snippet publisherBrand()}
  <g class="print-brand">
    <!-- Original publisher mark shared with the Anna's Dad Press site. -->
    <g class="print-brand-mark" transform="translate(397.76 992) scale(.32)">
      <path d="M8 12c8-2 16 0 24 5 8-5 16-7 24-5v35c-9-1-17 1-24 6-7-5-15-7-24-6V12Z" />
      <path d="M32 17v36M4 17v35c10-1 19 1 28 7 9-6 18-8 28-7V17M14 22c4 0 8 1 12 3m-12 5c4 0 8 1 12 3m-12 5 7 1M38 25c4-2 8-3 12-3m-12 11c4-2 8-3 12-3m-7 9 7-1" />
    </g>
    <text class="print-brand-copy" x="408" y="1033">Anna's Dad Press · Sudoku Learner's Library</text>
  </g>
{/snippet}

<div class="print-pages" aria-hidden="true">
  <section class="print-page print-puzzle-page" data-print-kind={kind}>
    <svg class="print-sheet" viewBox="0 0 816 1056" role="img" aria-label={kind === 'candidates' ? 'Printable Sudoku puzzle with starting candidates' : 'Printable unsolved Sudoku puzzle'}>
      <rect class="print-paper" width="816" height="1056" />
      <text class="print-kicker" x="61" y="58">{game.puzzle.variant === 'killer' ? 'KILLER SUDOKU' : 'SUDOKU'}</text>
      <text class="print-title" x="61" y="96">Solve this puzzle</text>
      <rect class="print-difficulty-pill" x="650" y="72" width="105" height="30" rx="15" />
      <text class="print-difficulty" x="702.5" y="91">{game.puzzle.variant === 'killer' ? 'Killer' : difficultyLabel(game.puzzle.difficulty)}</text>
      <line class="print-heading-rule" x1="61" y1="115" x2="755" y2="115" />

      <g class="print-board-svg">
        {#each Array(81) as _, cell}
          {@const given = game.puzzle.givens[cell]}
          {@const x = boardX + (cell % 9) * cellSize}
          {@const y = boardY + Math.floor(cell / 9) * cellSize}
          <rect class:pattern={game.patternCells.includes(cell)} x={x} y={y} width={cellSize} height={cellSize} />
          {#if given !== '.'}
            <text class="print-digit given" x={x + cellSize / 2} y={y + cellSize / 2 + (killer ? 7 : 1)}>{given}</text>
          {:else if kind === 'candidates'}
            {#each game.startingNotes[cell] as candidate}
              <text
                class="print-candidate"
                data-cell={cell}
                data-candidate={candidate}
                x={x + ((candidate - 1) % 3 + 0.5) * cellSize / 3}
                y={y + (Math.floor((candidate - 1) / 3) + 0.5) * cellSize / 3}
              >{candidate}</text>
            {/each}
          {/if}
        {/each}
        {#each Array(10) as _, index}
          <line class:box-line={index % 3 === 0} x1={boardX + index * cellSize} y1={boardY} x2={boardX + index * cellSize} y2={boardY + boardSize} />
          <line class:box-line={index % 3 === 0} x1={boardX} y1={boardY + index * cellSize} x2={boardX + boardSize} y2={boardY + index * cellSize} />
        {/each}
      </g>

      {#if killer}
      {#if game.puzzle.variant === 'killer'}
        <g class="print-cages" transform={`translate(${boardX} ${boardY}) scale(${cellSize})`}><CageOverlay cages={game.puzzle.cages ?? []} /></g>
      {/if}
      <rect class="print-scan-card" x="98" y={killer ? 770 : 826} width="620" height={killer ? 216 : 158} rx="8" />
      <image class="print-qr" href={puzzleQr} x={killer ? 102 : 122} y={killer ? 774 : 833} width={puzzleQrSize} height={puzzleQrSize} />
      <text class="print-scan-title" x={killer ? 308 : 280} y="906">Continue on a screen</text>
      <text class="print-scan-copy" x={killer ? 308 : 280} y="932">{killer ? 'Scan to open this Killer, including every cage.' : 'Scan to open a fresh copy of this puzzle in Sudoku.'}</text>
      <text class="print-scan-copy" x={killer ? 308 : 280} y="958">{killer ? 'No solution is encoded on this page.' : 'Work at your own pace; no solution is encoded on this page.'}</text>
      {:else}
      <rect class="print-scan-card" x="98" y={kind === 'candidates' ? 807 : 826} width="620" height={kind === 'candidates' ? 177 : 158} rx="8" />
      <image class="print-qr" href={puzzleQr} x={kind === 'candidates' ? 110 : 122} y={kind === 'candidates' ? 812 : 833} width={kind === 'candidates' ? 168 : 144} height={kind === 'candidates' ? 168 : 144} />
      <text class="print-scan-title" x={kind === 'candidates' ? 296 : 280} y={kind === 'candidates' ? 895 : 906}>Continue on a screen</text>
      {#if kind === 'candidates'}
        <text class="print-scan-copy" x="296" y="921">Scan to open a fresh copy with these starting candidates.</text>
      {:else}
        <text class="print-scan-copy" x="280" y="932">Scan to open a fresh copy of this puzzle in Sudoku.</text>
      {/if}
      <text class="print-scan-copy" x={kind === 'candidates' ? 296 : 280} y={kind === 'candidates' ? 947 : 958}>Work at your own pace; no solution is encoded on this page.</text>
      {/if}
      {@render publisherBrand()}
    </svg>
  </section>

  <section class="print-page print-solution-page">
    <svg class="print-sheet" viewBox="0 0 816 1056" role="img" aria-label="Printable solved Sudoku puzzle">
      <rect class="print-paper" width="816" height="1056" />
      <text class="print-kicker" x="61" y="58">{game.puzzle.variant === 'killer' ? 'KILLER SUDOKU' : 'SUDOKU'}</text>
      <text class="print-title" x="61" y="96">Solution &amp; walkthrough</text>
      <rect class="print-difficulty-pill" x="650" y="72" width="105" height="30" rx="15" />
      <text class="print-difficulty" x="702.5" y="91">{game.puzzle.variant === 'killer' ? 'Killer' : difficultyLabel(game.puzzle.difficulty)}</text>
      <line class="print-heading-rule" x1="61" y1="115" x2="755" y2="115" />

      <g class="print-board-svg">
        {#each Array(81) as _, cell}
          {@const given = game.puzzle.givens[cell]}
          {@const x = boardX + (cell % 9) * cellSize}
          {@const y = boardY + Math.floor(cell / 9) * cellSize}
          <rect x={x} y={y} width={cellSize} height={cellSize} />
          <text class:given={given !== '.'} class:answer={given === '.'} class="print-digit" x={x + cellSize / 2} y={y + cellSize / 2 + (game.puzzle.variant === 'killer' ? 7 : 1)}>{game.puzzle.solution[cell]}</text>
        {/each}
        {#each Array(10) as _, index}
          <line class:box-line={index % 3 === 0} x1={boardX + index * cellSize} y1={boardY} x2={boardX + index * cellSize} y2={boardY + boardSize} />
          <line class:box-line={index % 3 === 0} x1={boardX} y1={boardY + index * cellSize} x2={boardX + boardSize} y2={boardY + index * cellSize} />
        {/each}
      </g>

      {#if game.puzzle.variant === 'killer'}
        <g class="print-cages" transform={`translate(${boardX} ${boardY}) scale(${cellSize})`}><CageOverlay cages={game.puzzle.cages ?? []} /></g>
      {/if}
      <rect class="print-scan-card" x="98" y={killer ? 770 : 826} width="620" height={killer ? 216 : 158} rx="8" />
      <image class="print-qr" href={walkthroughQr} x={killer ? 102 : 122} y={killer ? 774 : 833} width={walkthroughQrSize} height={walkthroughQrSize} />
      <text class="print-scan-title" x={killer ? 308 : 280} y="894">Open the walkthrough</text>
      <text class="print-scan-copy" x={killer ? 308 : 280} y="920">{killer ? 'Scan to derive an explained solve on your device,' : 'Scan to replay from step 1, with the simplest available rule'}</text>
      <text class="print-scan-copy" x={killer ? 308 : 280} y="943">{killer ? 'with cages highlighted at each placement.' : 'and its pattern highlighted at each placement.'}</text>
      {#if killer}
        <text class="print-scan-copy" x="308" y="968">Every cage uses distinct digits.</text>
      {:else}
      <rect class="print-given-key" x="280" y="957" width="13" height="13" />
      <text class="print-legend-copy" x="300" y="968">Original givens are bold.</text>
      <rect class="print-answer-key" x="476" y="957" width="13" height="13" />
      <text class="print-legend-copy" x="496" y="968">Solved entries are lighter.</text>
      {/if}
      {@render publisherBrand()}
    </svg>
  </section>
</div>
