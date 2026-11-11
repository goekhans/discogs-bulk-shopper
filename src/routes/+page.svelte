<script lang="ts">
  import { onMount } from 'svelte';
  import DataStatusBar from '#lib/components/DataStatusBar.svelte';
  import SearchForm from '#lib/components/SearchForm.svelte';
  import SellerResultList from '#lib/components/SellerResultList.svelte';
  import {
    getDataStore,
    getSearchStore,
    type DataStore,
    type SearchStore
  } from '#lib/stores/index.js';

  // The stores touch localStorage and EventSource, so they only exist in the browser.
  let search = $state.raw<SearchStore | null>(null);
  let data = $state.raw<DataStore | null>(null);

  onMount(() => {
    const dataStore = getDataStore();
    search = getSearchStore();
    data = dataStore;
    void dataStore.loadAll();
    return () => dataStore.disconnect();
  });
</script>

<svelte:head>
  <title>Discogs Bulk Shopper</title>
</svelte:head>

<div class="page">
  <section class="intro">
    <h1 class="style-h1">Discogs Bulk Shopper</h1>
    <p class="style-body tagline">
      Ranks Discogs sellers by how many of your wantlist items you can get from each, at the lowest
      total including shipping.
    </p>
  </section>

  {#if search && data}
    <DataStatusBar {data} />
    <SearchForm {search} {data} />
    <SellerResultList {search} {data} />
  {:else}
    <p class="style-body loading" role="status">Loading…</p>
  {/if}
</div>

<style lang="scss">
  .page {
    display: flex;
    flex-direction: column;
    gap: $spacing-24;
    padding-block: $spacing-24 $spacing-64;

    @include breakpoint('medium') {
      padding-block-start: $spacing-32;
    }
  }

  .intro {
    display: flex;
    flex-direction: column;
    gap: $spacing-8;
  }

  .tagline {
    max-width: 56ch;
    color: $color-text-muted;
  }

  .loading {
    color: $color-text-muted;
  }
</style>
