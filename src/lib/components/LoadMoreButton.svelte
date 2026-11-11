<script lang="ts">
  import Button from './base/Button.svelte';

  interface Props {
    shown: number;
    total: number;
    hasMore: boolean;
    loading?: boolean;
    pageSize?: number;
    onclick: () => void;
  }

  let { shown, total, hasMore, loading = false, pageSize = 10, onclick }: Props = $props();

  const next = $derived(Math.min(pageSize, total - shown));
</script>

<div class="more">
  <p class="style-caption count" aria-live="polite">
    Showing <span class="tabular-nums">{shown}</span> of
    <span class="tabular-nums">{total}</span>
    {total === 1 ? 'seller' : 'sellers'}
  </p>
  {#if hasMore}
    <Button variant="secondary" {loading} {onclick}>
      Load {next} more
    </Button>
  {/if}
</div>

<style lang="scss">
  .more {
    display: flex;
    flex-direction: column;
    gap: $spacing-12;
    align-items: center;
    padding-block: $spacing-16;
  }

  .count {
    color: $color-text-muted;
  }
</style>
