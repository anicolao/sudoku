<script lang="ts">
  import { dialogFocus } from '$lib/actions/dialog-focus';
  import { cagePossibilities } from '$lib/domain/killer';
  import { killerCellName, killerRelationships } from '$lib/domain/killer-analysis';
  import type { GameProjection } from '$lib/domain/types';
  let { game, cell, onclose }: { game: GameProjection; cell: number; onclose: () => void } = $props();
  const grid = $derived([...game.puzzle.givens].map((v,c) => v === '.' ? game.values[c] ?? 0 : Number(v)));
  const cage = $derived(game.puzzle.cages!.find((c) => c.cells.includes(cell))!);
  const possibilities = $derived(cagePossibilities(grid, cage));
  const remaining = $derived(cage.total - cage.cells.reduce((sum,c) => sum + grid[c], 0));
  const empty = $derived(cage.cells.filter((c) => !grid[c]).length);
  const relationship = $derived(killerRelationships(grid, game.puzzle.cages!).find((r) => r.cells.includes(cell)));
  let page = $state(0);
</script>
<div class="dialog-backdrop" role="presentation">
  <div use:dialogFocus class="hint-dialog" role="dialog" aria-modal="true" aria-labelledby="cage-title">
    <h2 id="cage-title">Cage total {cage.total}</h2>
    <p>{cage.cells.map(killerCellName).join(', ')} · no repeats</p>
    <p><strong>{remaining} remaining across {empty} empty {empty === 1 ? 'cell' : 'cells'}.</strong></p>
    {#if possibilities.combinations.length}
      <p>{possibilities.combinations.length} feasible digit {possibilities.combinations.length === 1 ? 'set' : 'sets'}, including placed digits:</p>
      <p class="cage-combinations">{possibilities.combinations.slice(page * 6, page * 6 + 6).map((digits) => `{${digits.join(', ')}}`).join(' · ')}</p>
      {#if possibilities.combinations.length > 6}<div class="cage-pages"><button onclick={() => page--} disabled={page === 0}>Previous sets</button><button onclick={() => page++} disabled={(page+1)*6 >= possibilities.combinations.length}>More sets</button></div>{/if}
    {:else}<p role="alert">No assignment fits this cage. Check the placed digits in this cage and its Sudoku peers.</p>{/if}
    {#if relationship}<p>{relationship.explanation} This is a sum relationship; repetition is excluded only by the cells' ordinary houses or original cages.</p>{/if}
    <p class="killer-rules">Sets are checked against placed digits, not your pencil marks. A set does not determine the order of its digits.</p>
    <button class="killer-start" onclick={onclose}>Back to puzzle</button>
  </div>
</div>
