<script lang="ts">
  let { prerequisites = [], explanation }: { prerequisites?: string[]; explanation: string } = $props();
  let index = $state(0);
  const steps = $derived([...prerequisites, explanation]);
</script>
<div class="killer-reasoning" aria-label="Deduction reasoning">
  <p class="walkthrough-explanation" aria-live="polite">{steps[index]}</p>
  {#if steps.length > 1}
    <p>Reason {index + 1} of {steps.length}</p>
    <div class="cage-pages">
      <button type="button" disabled={index === 0} onclick={() => index--}>Previous reason</button>
      <button type="button" disabled={index === steps.length - 1} onclick={() => index++}>Next reason</button>
    </div>
  {/if}
</div>
