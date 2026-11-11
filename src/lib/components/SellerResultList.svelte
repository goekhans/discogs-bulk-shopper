<script lang="ts">
  import type { DataStore, SearchStore } from '#lib/stores/index.js';
  import Button from './base/Button.svelte';
  import Toggle from './base/Toggle.svelte';
  import LoadMoreButton from './LoadMoreButton.svelte';
  import SellerCard from './SellerCard.svelte';
  import StatePanel from './StatePanel.svelte';

  interface Props {
    search: SearchStore;
    data: DataStore;
  }

  let { search, data }: Props = $props();

  let expandAll = $state(false);

  /** No snapshot: known before any search from the summary, or reported by the search itself. */
  const noListings = $derived(
    (search.status === 'error' && search.error?.code === 'no-listings') ||
      (search.status === 'idle' &&
        data.listings === null &&
        !data.busy.listings &&
        !data.refreshing)
  );
  const loggedOut = $derived(data.session !== null && !data.session.loggedIn);
  const showList = $derived(
    search.results.length > 0 && (search.status === 'done' || search.status === 'loading-more')
  );
</script>

<section class="results" aria-label="Seller results">
  {#if loggedOut && search.status !== 'idle'}
    <p class="style-caption note" role="status">
      Not logged in to Discogs: shipping is quoted for your current location (by IP), so totals may
      differ from what you see after logging in.
    </p>
  {/if}

  {#if noListings}
    <StatePanel title="No listings fetched yet">
      Sellers are ranked from a local snapshot of the Discogs marketplace. Fetch the listings for
      your wantlist first; it takes a minute or two and runs in a Chrome window.
      {#snippet action()}
        <Button
          variant="primary"
          loading={data.refreshing}
          onclick={() => data.refreshListings(true)}
        >
          Refresh listings
        </Button>
      {/snippet}
    </StatePanel>
  {:else if search.status === 'idle'}
    <StatePanel title="Find the sellers worth a bulk order">
      Every seller offering items from your wantlist is ranked by how many you can get and what the
      lot costs with shipping. Narrow it down with the filters above, then search.
    </StatePanel>
  {:else if search.status === 'loading'}
    <div class="skeletons" role="status" aria-live="polite" aria-label="Searching sellers">
      <span class="sr-only">Searching sellers…</span>
      {#each [0, 1, 2] as i (i)}
        <div class="skeleton" aria-hidden="true">
          <span class="skeleton-line skeleton-line--title"></span>
          <span class="skeleton-line"></span>
          <span class="skeleton-line skeleton-line--short"></span>
        </div>
      {/each}
    </div>
  {:else if search.status === 'error'}
    <StatePanel title="Search failed" role="alert" tone="negative">
      {search.error?.message ?? 'Something went wrong.'}
      {#snippet action()}
        <Button variant="primary" onclick={() => search.search()}>Try again</Button>
      {/snippet}
    </StatePanel>
  {:else if search.total === 0}
    <StatePanel title="No sellers match">
      No seller offers enough of your wantlist with these filters. Lower the minimum items, loosen
      the grades, or drop a must-have title.
      {#snippet action()}
        <Button variant="secondary" onclick={() => search.reset()}>Reset filters</Button>
      {/snippet}
    </StatePanel>
  {/if}

  {#if showList}
    <div class="toolbar">
      <p class="style-caption muted" aria-live="polite">
        {search.total.toLocaleString('da-DK')}
        {search.total === 1 ? 'seller' : 'sellers'} ranked
        {#if search.dataStatus}
          · prices in {search.dataStatus.currency}
          {#if search.dataStatus.listingsStale}
            · <span class="warn">stale listings</span>
          {/if}
        {/if}
      </p>
      <Toggle label="Show items on every card" bind:checked={expandAll} />
    </div>
    <ol class="list">
      {#each search.results as result, i (result.sellerId)}
        <li>
          <SellerCard {result} rank={i + 1} expanded={expandAll} />
        </li>
      {/each}
    </ol>
    <LoadMoreButton
      shown={search.results.length}
      total={search.total}
      hasMore={search.hasMore}
      loading={search.status === 'loading-more'}
      pageSize={search.params.pageSize}
      onclick={() => search.loadMore()}
    />
  {/if}
</section>

<style lang="scss">
  .results {
    display: flex;
    flex-direction: column;
    gap: $spacing-16;
  }

  .note {
    padding: $spacing-8 $spacing-12;
    border-radius: $radius-md;
    background: $color-accent-subtle;
    color: $color-text;
  }

  .muted {
    color: $color-text-muted;
  }

  .warn {
    color: $color-negative;
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: $spacing-8;
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: $spacing-12;
    padding: 0;
    list-style: none;
  }

  .skeletons {
    display: flex;
    flex-direction: column;
    gap: $spacing-12;
  }

  .skeleton {
    display: flex;
    flex-direction: column;
    gap: $spacing-12;
    padding: $spacing-16;
    border: 1px solid $color-border;
    border-radius: $radius-lg;
    background: $color-surface;
  }

  .skeleton-line {
    display: block;
    height: 12px;
    width: 100%;
    border-radius: $radius-sm;
    background: $color-surface-strong;

    @include motion-ok {
      animation: pulse 1.2s ease-in-out infinite;
    }

    &--title {
      width: 40%;
      height: 16px;
    }

    &--short {
      width: 60%;
    }
  }

  @keyframes pulse {
    50% {
      opacity: 0.5;
    }
  }
</style>
