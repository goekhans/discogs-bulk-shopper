<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    /** Spoken by screen readers as soon as it appears. */
    role?: 'status' | 'alert';
    tone?: 'neutral' | 'negative';
    children?: Snippet;
    /** One call to action. */
    action?: Snippet;
  }

  let { title, role = 'status', tone = 'neutral', children, action }: Props = $props();
</script>

<div class="panel" class:is-negative={tone === 'negative'} {role}>
  <h2 class="style-h3">{title}</h2>
  {#if children}
    <div class="body style-body">{@render children()}</div>
  {/if}
  {#if action}
    <div class="action">{@render action()}</div>
  {/if}
</div>

<style lang="scss">
  .panel {
    display: flex;
    flex-direction: column;
    gap: $spacing-12;
    padding: $spacing-24 $spacing-16;
    border: 1px dashed $color-border;
    border-radius: $radius-lg;
    text-align: center;
    align-items: center;

    &.is-negative {
      border-color: $color-negative;
      border-style: solid;
      background: $color-negative-subtle;
    }
  }

  .body {
    max-width: 48ch;
    color: $color-text-muted;
  }

  .action {
    display: flex;
    gap: $spacing-8;
  }
</style>
