<script lang="ts">
  import favicon from '#lib/assets/favicon.svg';
  import type { LayoutProps } from './$types';
  // The global stylesheet, imported exactly once here. Components get the token layer via Vite additionalData.
  import '#lib/styles/main.scss';

  let { children }: LayoutProps = $props();
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
