<script lang="ts">
  import { resolve } from '$app/paths';
  import favicon from '#lib/assets/favicon.svg';
  import type { LayoutProps } from './$types';
  // The global stylesheet, imported exactly once here. Components get the token layer via Vite additionalData.
  import '#lib/styles/main.scss';

  let { children }: LayoutProps = $props();
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

<a class="skip style-label" href="#main">Skip to content</a>

<header class="header">
  <div class="container header-inner">
    <a class="brand style-body-strong" href={resolve('/')}>Discogs Bulk Shopper</a>
    <a
      class="style-caption link"
      href="https://www.discogs.com/mywantlist"
      target="_blank"
      rel="noopener noreferrer"
    >
      Wantlist on Discogs
    </a>
  </div>
</header>

<main id="main" class="container">
  {@render children()}
</main>

<footer class="footer">
  <p class="container style-caption">
    Runs locally. Listings are scraped from the Discogs marketplace, exchange rates come from the
    ECB via frankfurter.app. Not affiliated with Discogs.
  </p>
</footer>

<style lang="scss">
  .skip {
    position: absolute;
    top: $spacing-8;
    left: $spacing-8;
    z-index: $z-index-toast;
    padding: $spacing-8 $spacing-12;
    border-radius: $radius-md;
    background: $color-surface;
    color: $color-accent;
    transform: translateY(-200%);

    &:focus-visible {
      outline: 2px solid $color-focus;
      transform: none;
    }
  }

  .header {
    position: sticky;
    top: 0;
    z-index: $z-index-header;
    border-bottom: 1px solid $color-border;
    background: $color-surface;
  }

  .header-inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: $spacing-16;
    min-height: $layout-header-height;
  }

  .brand {
    color: $color-text;
    text-decoration: none;
    border-radius: $radius-sm;

    @include focus-ring;
  }

  .link {
    border-radius: $radius-sm;

    @include focus-ring;
  }

  .footer {
    padding-block: $spacing-24;
    border-top: 1px solid $color-border;
    color: $color-text-muted;
  }
</style>
