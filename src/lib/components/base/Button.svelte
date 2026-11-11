<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';

  type Variant = 'primary' | 'secondary' | 'ghost';
  type Size = 'sm' | 'md';

  interface Props {
    variant?: Variant;
    size?: Size;
    /** Shows a spinner and disables the control. */
    loading?: boolean;
    disabled?: boolean;
    /** When set, renders an <a> instead of a <button>. */
    href?: string;
    target?: HTMLAnchorAttributes['target'];
    rel?: HTMLAnchorAttributes['rel'];
    type?: HTMLButtonAttributes['type'];
    onclick?: (event: MouseEvent) => void;
    class?: string;
    children: Snippet;
    [key: `aria-${string}`]: string | undefined;
  }

  let {
    variant = 'secondary',
    size = 'md',
    loading = false,
    disabled = false,
    href,
    target,
    rel,
    type = 'button',
    onclick,
    class: className = '',
    children,
    ...rest
  }: Props = $props();

  const inactive = $derived(disabled || loading);
  const classes = $derived(
    ['button', `button--${variant}`, `button--${size}`, loading && 'is-loading', className]
      .filter(Boolean)
      .join(' ')
  );
</script>

{#if href && !inactive}
  <!-- The href is whatever the caller resolved; the component cannot know if it is internal. -->
  <!-- eslint-disable svelte/no-navigation-without-resolve -->
  <a
    {href}
    {target}
    rel={rel ?? (target === '_blank' ? 'noopener noreferrer' : undefined)}
    class={classes}
    {onclick}
    {...rest}
  >
    {@render children()}
  </a>
  <!-- eslint-enable svelte/no-navigation-without-resolve -->
{:else}
  <button
    {type}
    class={classes}
    disabled={inactive}
    aria-busy={loading || undefined}
    {onclick}
    {...rest}
  >
    {#if loading}
      <span class="spinner" aria-hidden="true"></span>
    {/if}
    <span class="label">{@render children()}</span>
  </button>
{/if}

<style lang="scss">
  .button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: $spacing-8;
    min-height: 40px;
    padding: $spacing-8 $spacing-16;
    border: 1px solid transparent;
    border-radius: $radius-md;
    font-weight: 500;
    font-size: 15px;
    line-height: 1.3;
    text-decoration: none;
    white-space: nowrap;
    transition: background-color $duration-fast $ease-out;

    @include focus-ring;

    &:disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }
  }

  .button--sm {
    min-height: 32px;
    padding: $spacing-4 $spacing-12;
    font-size: 13px;
  }

  .button--primary {
    background: $color-accent;
    color: $color-on-accent;

    &:hover:not(:disabled) {
      background: $color-accent-hover;
    }
  }

  .button--secondary {
    background: $color-surface;
    border-color: $color-control-border;
    color: $color-text;

    &:hover:not(:disabled) {
      background: $color-surface-hover;
    }
  }

  .button--ghost {
    background: transparent;
    color: $color-accent;

    &:hover:not(:disabled) {
      background: $color-accent-subtle;
    }
  }

  .is-loading .label {
    opacity: 0.8;
  }

  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid currentcolor;
    border-right-color: transparent;
    border-radius: $radius-pill;

    @include motion-ok {
      animation: spin 0.8s linear infinite;
    }
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
