<script lang="ts">
  let { givens }: { givens: string } = $props();
</script>

<div class="sudoku-board" role="grid" aria-label="Easy Sudoku puzzle" data-testid="sudoku-board">
  {#each [...givens] as value, cell}
    {@const row = Math.floor(cell / 9) + 1}
    {@const column = (cell % 9) + 1}
    <div
      class="sudoku-cell"
      class:given={value !== '.'}
      role="gridcell"
      aria-label={`Row ${row}, column ${column}, ${value === '.' ? 'editable, empty' : `fixed, ${value}`}`}
      data-cell={cell}
    >
      {value === '.' ? '' : value}
    </div>
  {/each}
</div>
