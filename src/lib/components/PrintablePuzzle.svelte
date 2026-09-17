<script lang="ts">
  import { difficultyLabel } from '$lib/domain/difficulty';
  import type { GameProjection } from '$lib/domain/types';

  let { game, puzzleQr, walkthroughQr }: {
    game: GameProjection;
    puzzleQr: string;
    walkthroughQr: string;
  } = $props();

  const boardX = 98.4;
  const boardY = 160;
  const boardSize = 619.2;
  const cellSize = boardSize / 9;
</script>

<div class="print-pages" aria-hidden="true">
  <section class="print-page print-puzzle-page">
    <svg class="print-sheet" viewBox="0 0 816 1056" role="img" aria-label="Printable unsolved Sudoku puzzle">
      <rect class="print-paper" width="816" height="1056" />
      <text class="print-kicker" x="61" y="58">SUDOKU</text>
      <text class="print-title" x="61" y="96">Solve this puzzle</text>
      <rect class="print-difficulty-pill" x="650" y="72" width="105" height="30" rx="15" />
      <text class="print-difficulty" x="702.5" y="91">{difficultyLabel(game.puzzle.difficulty)}</text>
      <line class="print-heading-rule" x1="61" y1="115" x2="755" y2="115" />

      <g class="print-board-svg">
        {#each Array(81) as _, cell}
          {@const given = game.puzzle.givens[cell]}
          {@const x = boardX + (cell % 9) * cellSize}
          {@const y = boardY + Math.floor(cell / 9) * cellSize}
          <rect class:pattern={game.patternCells.includes(cell)} x={x} y={y} width={cellSize} height={cellSize} />
          {#if given !== '.'}
            <text class="print-digit given" x={x + cellSize / 2} y={y + cellSize / 2 + 1}>{given}</text>
          {/if}
        {/each}
        {#each Array(10) as _, index}
          <line class:box-line={index % 3 === 0} x1={boardX + index * cellSize} y1={boardY} x2={boardX + index * cellSize} y2={boardY + boardSize} />
          <line class:box-line={index % 3 === 0} x1={boardX} y1={boardY + index * cellSize} x2={boardX + boardSize} y2={boardY + index * cellSize} />
        {/each}
      </g>

      <rect class="print-scan-card" x="98" y="826" width="620" height="158" rx="8" />
      <image class="print-qr" href={puzzleQr} x="122" y="833" width="144" height="144" />
      <text class="print-scan-title" x="280" y="906">Continue on a screen</text>
      <text class="print-scan-copy" x="280" y="932">Scan to open a fresh copy of this puzzle in Sudoku.</text>
      <text class="print-footer-copy" x="408" y="1023">Work at your own pace. No solution is encoded on this page.</text>
    </svg>
  </section>

  <section class="print-page print-solution-page">
    <svg class="print-sheet" viewBox="0 0 816 1056" role="img" aria-label="Printable solved Sudoku puzzle">
      <rect class="print-paper" width="816" height="1056" />
      <text class="print-kicker" x="61" y="58">SUDOKU</text>
      <text class="print-title" x="61" y="96">Solution &amp; walkthrough</text>
      <rect class="print-difficulty-pill" x="650" y="72" width="105" height="30" rx="15" />
      <text class="print-difficulty" x="702.5" y="91">{difficultyLabel(game.puzzle.difficulty)}</text>
      <line class="print-heading-rule" x1="61" y1="115" x2="755" y2="115" />

      <g class="print-board-svg">
        {#each Array(81) as _, cell}
          {@const given = game.puzzle.givens[cell]}
          {@const x = boardX + (cell % 9) * cellSize}
          {@const y = boardY + Math.floor(cell / 9) * cellSize}
          <rect x={x} y={y} width={cellSize} height={cellSize} />
          <text class:given={given !== '.'} class:answer={given === '.'} class="print-digit" x={x + cellSize / 2} y={y + cellSize / 2 + 1}>{game.puzzle.solution[cell]}</text>
        {/each}
        {#each Array(10) as _, index}
          <line class:box-line={index % 3 === 0} x1={boardX + index * cellSize} y1={boardY} x2={boardX + index * cellSize} y2={boardY + boardSize} />
          <line class:box-line={index % 3 === 0} x1={boardX} y1={boardY + index * cellSize} x2={boardX + boardSize} y2={boardY + index * cellSize} />
        {/each}
      </g>

      <rect class="print-scan-card" x="98" y="826" width="620" height="158" rx="8" />
      <image class="print-qr" href={walkthroughQr} x="122" y="833" width="144" height="144" />
      <text class="print-scan-title" x="280" y="894">Open the walkthrough</text>
      <text class="print-scan-copy" x="280" y="920">Scan to replay from step 1, with the simplest available rule</text>
      <text class="print-scan-copy" x="280" y="943">and its pattern highlighted at each placement.</text>
      <rect class="print-given-key" x="250" y="1010" width="13" height="13" />
      <text class="print-legend-copy" x="270" y="1021">Original givens are bold.</text>
      <rect class="print-answer-key" x="468" y="1010" width="13" height="13" />
      <text class="print-legend-copy" x="488" y="1021">Solved entries are lighter.</text>
    </svg>
  </section>
</div>
