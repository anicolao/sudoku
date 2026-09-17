<script lang="ts">
  import { cageSegments } from '$lib/domain/killer';
  import type { KillerCage } from '$lib/domain/types';
  let { cages, selectedCell = null }: { cages: KillerCage[]; selectedCell?: number | null } = $props();
</script>
{#each cages as cage}
  {@const selected = selectedCell !== null && cage.cells.includes(selectedCell)}
  <g class="cage" class:cage-selected={selected} data-cage-total={cage.total}>
    {#each cageSegments(cage) as line}
      <line x1={line[0]} y1={line[1]} x2={line[2]} y2={line[3]} stroke={selected ? "#4654c7" : "#555"} stroke-width={selected ? ".04" : ".018"} stroke-dasharray=".055 .035" fill="none" />
    {/each}
    <rect x={cage.cells[0] % 9 + .10} y={Math.floor(cage.cells[0] / 9) + .04} width={cage.total > 9 ? '.34' : '.22'} height=".23" fill={selected ? "#e8ecff" : "white"} />
    <text x={cage.cells[0] % 9 + .12} y={Math.floor(cage.cells[0] / 9) + .235} font-size=".22" font-weight="700" fill="#20242b">{cage.total}</text>
  </g>
{/each}
