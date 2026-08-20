<script lang="ts">
  import type { Digit, GameProjection } from '$lib/domain/types';
  import { PEERS } from '$lib/domain/sudoku';
  import { difficultyLabel } from '$lib/domain/difficulty';

  let {
    game,
    selected,
    highlightAllNumberPeers,
    notesBold,
    notesLarge,
    onselect,
    onnumber,
    ontoggleNotes,
    onerase,
    onundo,
    onredo
  }: {
    game: GameProjection;
    selected: number | null;
    highlightAllNumberPeers: boolean;
    notesBold: boolean;
    notesLarge: boolean;
    onselect: (cell: number) => void;
    onnumber: (cell: number, value: Digit) => void;
    ontoggleNotes: () => void;
    onerase: (cell: number) => void;
    onundo: () => void;
    onredo: () => void;
  } = $props();

  const rovingCell = $derived(selected ?? 0);

  const selectedValue = $derived(
    selected === null
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

  function moveFocus(cell: number): void {
    onselect(cell);
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-cell="${cell}"]`)?.focus();
    });
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
      onnumber(cell, Number(event.key) as Digit);
    } else if (event.key.toLowerCase() === 'n') {
      event.preventDefault();
      ontoggleNotes();
    } else if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      onerase(cell);
    } else if (event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) onredo(); else onundo();
    }
  }
</script>

<div class="sudoku-board" role="grid" aria-label={`${difficultyLabel(game.puzzle.difficulty)} Sudoku puzzle`} data-testid="sudoku-board" data-notes-bold={notesBold} data-notes-large={notesLarge}>
  {#each Array(9) as _, row}
    <div class="sudoku-row" role="row">
    {#each Array(9) as _, column}
      {@const cell = row * 9 + column}
      {@const given = game.puzzle.givens[cell]}
      {@const value = given === '.' ? game.values[cell] : Number(given)}
      {@const isPeer = !highlightAllNumberPeers && selected !== null && PEERS[selected].includes(cell)}
      {@const matches = !highlightAllNumberPeers && selectedValue !== null && value === selectedValue}
      {@const isNumberPeer = highlightAllNumberPeers && matchingPeers.has(cell)}
      {@const isNumberMatch = highlightAllNumberPeers && selectedValue !== null && value === selectedValue}
      <button
        type="button"
        class="sudoku-cell"
        class:given={given !== '.'}
        class:selected={selected === cell}
        class:peer={isPeer}
        class:matching={matches}
        class:number-peer={isNumberPeer}
        class:number-match={isNumberMatch}
        class:conflict={game.conflicts.includes(cell)}
        class:mistake={game.mistakeCells.includes(cell)}
        class:hinted={game.hintedCells.includes(cell)}
        class:box-right={column === 2 || column === 5}
        class:box-bottom={row === 2 || row === 5}
        class:last-column={column === 8}
        class:last-row={row === 8}
        role="gridcell"
        aria-label={label(cell)}
        aria-selected={selected === cell}
        aria-readonly={given !== '.'}
        tabindex={rovingCell === cell ? 0 : -1}
        data-cell={cell}
        data-highlight={isNumberMatch ? 'number-match' : isNumberPeer ? 'number-peer' : matches ? 'matching' : isPeer ? 'peer' : undefined}
        data-e2e-board-cell
        onclick={() => onselect(cell)}
        onkeydown={(event) => handleKeydown(event, cell)}
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
  {/each}
</div>
