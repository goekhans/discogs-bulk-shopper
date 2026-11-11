<script lang="ts">
  import type { DataStore } from '#lib/stores/index.js';
  import Button from './base/Button.svelte';
  import { describeScrapeProgress, scrapeProgressFraction } from './progress.js';
  import { formatRelativeTime } from './relative-time.js';

  interface Props {
    data: DataStore;
  }

  let { data }: Props = $props();

  // Re-rendered every minute so "3 min ago" stays truthful while the tab is open.
  let now = $state(Date.now());
  $effect(() => {
    const timer = setInterval(() => (now = Date.now()), 60_000);
    return () => clearInterval(timer);
  });

  const session = $derived(data.session);
  const listings = $derived(data.listings);
  const wantlist = $derived(data.wantlist);
  const progress = $derived(data.job?.progress ?? null);
  const percent = $derived(Math.round(scrapeProgressFraction(progress) * 100));

  /** Listings were scraped for another destination than the session ships to now. */
  const destinationMismatch = $derived(
    listings !== null &&
      session !== null &&
      session.loggedIn &&
      session.shipTo !== null &&
      listings.shipTo.toLowerCase() !== session.shipTo.code.toLowerCase()
  );

  const destination = $derived(
    listings ? (listings.shipToName ?? listings.shipTo.toUpperCase()) : null
  );

  /** The session may have changed destination, so the snapshot summary is reloaded too. */
  async function login() {
    await data.login();
    await data.loadListings();
  }

  async function changeShipTo() {
    await data.changeShipTo();
    await data.loadListings();
  }
</script>

<section class="bar" aria-label="Data status">
  <div class="cell">
    <h2 class="style-kicker heading">Wantlist</h2>
    {#if wantlist}
      <p class="style-body">
        <strong class="tabular-nums">{wantlist.count.toLocaleString('da-DK')}</strong> releases
        <span class="muted">· fetched {formatRelativeTime(wantlist.fetchedAt, now)}</span>
      </p>
    {:else if data.busy.wantlist}
      <p class="style-body muted">Loading…</p>
    {:else}
      <p class="style-body muted">Not loaded</p>
    {/if}
    {#if data.errors.wantlist}
      <p class="style-caption error" role="alert">{data.errors.wantlist.message}</p>
    {/if}
    <div class="actions">
      <Button size="sm" loading={data.busy.wantlist} onclick={() => data.refreshWantlist()}>
        Refresh wantlist
      </Button>
    </div>
  </div>

  <div class="cell">
    <h2 class="style-kicker heading">Listings</h2>
    {#if listings}
      <p class="style-body">
        <strong class="tabular-nums">{listings.count.toLocaleString('da-DK')}</strong> listings
        shipping to <strong>{destination}</strong>
        <span class="muted">· fetched {formatRelativeTime(listings.fetchedAt, now)}</span>
        {#if listings.stale}
          <span class="badge style-caption">Stale</span>
        {/if}
      </p>
    {:else if data.busy.listings && !data.refreshing}
      <p class="style-body muted">Loading…</p>
    {:else if !data.refreshing}
      <p class="style-body muted">No listings fetched yet</p>
    {/if}
    {#if destinationMismatch}
      <p class="style-caption note">
        Your Discogs account now ships to {session?.shipTo?.name}. Refresh the listings so shipping
        costs match.
      </p>
    {/if}
    {#if data.errors.listings}
      <p class="style-caption error" role="alert">{data.errors.listings.message}</p>
    {/if}
    <div class="actions">
      <Button
        size="sm"
        loading={data.refreshing}
        disabled={data.busy.listings && !data.refreshing}
        onclick={() => data.refreshListings(true)}
      >
        Refresh listings
      </Button>
    </div>
    <div class="progress" aria-live="polite">
      {#if data.refreshing}
        <div
          class="progress-bar"
          role="progressbar"
          aria-label="Listings refresh"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={percent}
        >
          <span class="progress-fill" style:width="{percent}%"></span>
        </div>
        <p class="style-caption muted">Refreshing · {describeScrapeProgress(progress)}</p>
      {/if}
    </div>
  </div>

  <div class="cell">
    <h2 class="style-kicker heading">Discogs session</h2>
    {#if session === null}
      <p class="style-body muted">{data.busy.session ? 'Checking…' : 'Unknown'}</p>
    {:else if session.loggedIn}
      <p class="style-body">
        Logged in as <strong>{session.username ?? 'unknown user'}</strong>
      </p>
      <p class="style-body">
        Ships to <strong>{session.shipTo?.name ?? 'unknown destination'}</strong>
      </p>
    {:else}
      <p class="style-body">Not logged in</p>
      <p class="style-caption muted">
        Shipping is estimated for your current location until you log in.
      </p>
    {/if}
    {#if data.errors.session || data.errors.login || data.errors.shipTo}
      <p class="style-caption error" role="alert">
        {(data.errors.session ?? data.errors.login ?? data.errors.shipTo)?.message}
      </p>
    {/if}
    <div class="actions">
      {#if session?.loggedIn}
        <Button size="sm" loading={data.busy.shipTo} onclick={changeShipTo}>
          Change on Discogs
        </Button>
      {:else}
        <Button size="sm" variant="primary" loading={data.busy.login} onclick={login}>
          Log in on Discogs
        </Button>
      {/if}
    </div>
    {#if data.busy.login || data.busy.shipTo}
      <p class="style-caption note" aria-live="polite">
        A Chrome window has opened. Finish on Discogs there and close the tab; this page updates on
        its own.
      </p>
    {:else if !session?.loggedIn}
      <p class="style-caption muted">
        Opens a Chrome window where you log in on discogs.com. Your password never passes through
        this app.
      </p>
    {/if}
  </div>
</section>

<style lang="scss">
  .bar {
    display: grid;
    gap: $spacing-16;
    padding: $spacing-16;
    border: 1px solid $color-border;
    border-radius: $radius-lg;
    background: $color-surface;

    @include breakpoint('medium') {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: $spacing-24;
    }
  }

  .cell {
    display: flex;
    flex-direction: column;
    gap: $spacing-8;
    min-width: 0;
  }

  .heading {
    color: $color-text-muted;
  }

  .muted {
    color: $color-text-muted;
  }

  .note {
    color: $color-accent;
  }

  .error {
    color: $color-negative;
  }

  .badge {
    display: inline-block;
    padding: 0 $spacing-8;
    border-radius: $radius-pill;
    background: $color-negative-subtle;
    color: $color-negative;
    font-weight: 500;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: $spacing-8;
    margin-top: auto;
  }

  .progress {
    display: flex;
    flex-direction: column;
    gap: $spacing-4;
  }

  .progress-bar {
    height: 6px;
    overflow: hidden;
    border-radius: $radius-pill;
    background: $color-surface-strong;
  }

  .progress-fill {
    display: block;
    height: 100%;
    min-width: 2%;
    border-radius: $radius-pill;
    background: $color-accent;
    transition: width $duration-base $ease-out;
  }
</style>
