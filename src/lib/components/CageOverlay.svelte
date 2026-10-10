<script lang="ts">
  import { CAGE_TOP_INSET, cagePaths } from '$lib/rendering/cage-geometry';
  import type { KillerCage } from '$lib/domain/types';
  let { cages, selectedCell = null }: { cages: KillerCage[]; selectedCell?: number | null } = $props();
  const id = $props.id();
  const geometry = $derived(cages.map(cage => ({ cage, ...cagePaths(cage.cells) })));
</script>
{#each geometry as { cage, outline, corners }, index}
  {@const selected = selectedCell !== null && cage.cells.includes(selectedCell)}
  {@const anchor = Math.min(...cage.cells)}
  {@const labelWidth = cage.total > 9 ? .38 : .25}
  {@const labelX = anchor % 9 + .17}
  {@const labelY = Math.floor(anchor / 9)}
  <g class="cage" class:cage-selected={selected} data-cage-total={cage.total}>
    <defs>
      <mask id={`${id}-sum-${index}`} maskUnits="userSpaceOnUse" x="0" y="0" width="9" height="9">
        <rect width="9" height="9" fill="white" />
        <rect x={labelX} y={labelY} width={labelWidth} height=".24" fill="black" />
      </mask>
    </defs>
    <g mask={`url(#${id}-sum-${index})`} fill="none" stroke={selected ? '#4654c7' : '#647080'} stroke-width={selected ? '.032' : '.019'} stroke-linecap="round" stroke-linejoin="round">
      <path class="cage-outline" d={outline} stroke-dasharray=".055 .045" />
      <path class="cage-corners" d={corners} />
    </g>
    <text class="cage-sum" x={labelX + labelWidth / 2} y={labelY + CAGE_TOP_INSET + .07} text-anchor="middle" font-size=".21" font-weight="400" style="font-variant-numeric: tabular-nums" fill={selected ? '#3542aa' : '#303947'}>{cage.total}</text>
  </g>
{/each}
