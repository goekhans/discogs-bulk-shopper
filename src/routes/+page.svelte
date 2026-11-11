<svelte:head>
  <title>Discogs Bulk Shopper</title>
</svelte:head>

<main class="container container-medium page">
  <h1 class="style-h1">Discogs Bulk Shopper</h1>
  <p class="style-body tagline">
    Ranks Discogs sellers by how many of your wantlist items you can get from each, at the lowest
    total including shipping.
  </p>
</main>

<style lang="scss">
  .page {
    display: flex;
    flex-direction: column;
    gap: $spacing-12;
    padding-block: $spacing-48;
  }

  .tagline {
    color: $color-text-muted;
    max-width: 48ch;
  }
</style>
