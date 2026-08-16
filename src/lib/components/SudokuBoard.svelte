<script lang="ts">
  import type { Digit, GameProjection } from '$lib/domain/types';
  import { PEERS } from '$lib/domain/sudoku';

  let {
    game,
    selected,
    onselect
  }: {
    game: GameProjection;
    selected: number | null;
    onselect: (cell: number) => void;
  } = $props();

  const selectedValue = $derived(
    selected === null
      ? null
      : game.puzzle.givens[selected] === '.'
        ? game.values[selected]
        : Number(game.puzzle.givens[selected])
  );

  function label(cell: number): string {
    const given = game.puzzle.givens[cell];
    const value = given === '.' ? game.values[cell] : Number(given);
    const notes = game.notes[cell];
    return [
      `Row ${Math.floor(cell / 9) + 1}, column ${(cell % 9) + 1}`,
      given === '.' ? 'editable' : 'fixed',
      value ? String(value) : 'empty',
      notes.length ? `notes ${notes.join(' ')}` : '',
      game.hintedCells.includes(cell) ? 'revealed by hint' : '',
      game.conflicts.includes(cell) ? 'conflict' : '',
      game.mistakeCells.includes(cell) ? 'mistake' : '',
      selected === cell ? 'selected' : ''
    ].filter(Boolean).join(', ');
  }
</script>

<div class="sudoku-board" role="grid" aria-label="Easy Sudoku puzzle" data-testid="sudoku-board">
  {#each Array(81) as _, cell}
    {@const given = game.puzzle.givens[cell]}
    {@const value = given === '.' ? game.values[cell] : Number(given)}
    {@const isPeer = selected !== null && PEERS[selected].includes(cell)}
    {@const matches = selectedValue !== null && value === selectedValue}
    <button
      type="button"
      class="sudoku-cell"
      class:given={given !== '.'}
      class:selected={selected === cell}
      class:peer={isPeer}
      class:matching={matches}
      class:conflict={game.conflicts.includes(cell)}
      class:mistake={game.mistakeCells.includes(cell)}
      class:hinted={game.hintedCells.includes(cell)}
      role="gridcell"
      aria-label={label(cell)}
      aria-selected={selected === cell}
      tabindex={selected === cell ? 0 : -1}
      data-cell={cell}
      data-e2e-board-cell
      onclick={() => onselect(cell)}
    >
      {#if value}
        <span class="cell-value">{value}</span>
      {:else if game.notes[cell].length}
        <span class="cell-notes" aria-hidden="true">
          {#each Array(9) as _, note}<i>{game.notes[cell].includes((note + 1) as Digit) ? note + 1 : ''}</i>{/each}
        </span>
      {/if}
      {#if game.conflicts.includes(cell)}<span class="conflict-mark" aria-hidden="true">!</span>{/if}
      {#if game.mistakeCells.includes(cell) && !game.conflicts.includes(cell)}<span class="mistake-mark" aria-hidden="true">×</span>{/if}
      {#if game.hintedCells.includes(cell)}<span class="hint-mark" aria-hidden="true">◆</span>{/if}
    </button>
  {/each}
</div>
