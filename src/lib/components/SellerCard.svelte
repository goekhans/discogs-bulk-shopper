<script lang="ts">
  import type { SellerResult } from '#lib/ranking/types.js';
  import { formatMoney } from '#lib/utils/format.js';
  import { sellerProfileUrl, sellerWantsUrl } from './seller-links.js';

  interface Props {
    result: SellerResult;
    rank: number;
    /** Opens the item list to begin with; the user can still collapse it. */
    expanded?: boolean;
  }

  let { result, rank, expanded = false }: Props = $props();

  const money = (amount: number) => formatMoney(amount, result.currency);
  const savingsKind = $derived(
    result.savings.amount > 0.005
      ? 'positive'
      : result.savings.amount < -0.005
        ? 'negative'
        : 'none'
  );
  const rating = $derived(
    result.sellerRating === null
      ? 'No rating yet'
      : `${result.sellerRating.toLocaleString('da-DK', { maximumFractionDigits: 1 })}%` +
          (result.sellerRatingCount !== null
            ? ` · ${result.sellerRatingCount.toLocaleString('da-DK')} ratings`
            : '')
  );
</script>

<article class="card" aria-label="Rank {rank}: {result.sellerName}">
  <header class="head">
    <span class="rank style-figure-strong" aria-hidden="true">#{rank}</span>
    <div class="who">
      <h3 class="style-h3">
        <a
          class="seller"
          href={sellerProfileUrl(result.sellerName)}
          target="_blank"
          rel="external noopener noreferrer"
        >
          {result.sellerName}
        </a>
      </h3>
      <p class="style-caption meta">{rating} · ships from {result.sellerCountry}</p>
    </div>
    <p class="count style-body-strong">
      {result.itemCount}
      {result.itemCount === 1 ? 'item' : 'items'}
    </p>
  </header>

  <dl class="figures">
    <div class="figure">
      <dt class="style-kicker">Items</dt>
      <dd class="style-figure">{money(result.itemsTotal.amount)}</dd>
    </div>
    <div class="figure">
      <dt class="style-kicker">Shipping</dt>
      <dd class="style-figure">
        {#if result.shippingUnknown && result.shippingEstimate.amount === 0}
          <span class="muted">unknown</span>
        {:else}
          {money(result.shippingEstimate.amount)}
          <span class="muted">{result.shippingUnknown ? 'est., partly unknown' : 'est.'}</span>
        {/if}
      </dd>
    </div>
    <div class="figure figure--total">
      <dt class="style-kicker">Total</dt>
      <dd class="style-figure-strong">{money(result.total.amount)}</dd>
    </div>
    <div class="figure">
      <dt class="style-kicker">Per item</dt>
      <dd class="style-figure">{money(result.perItem.amount)}</dd>
    </div>
  </dl>

  <p
    class="savings style-body"
    class:is-positive={savingsKind === 'positive'}
    class:is-negative={savingsKind === 'negative'}
  >
    {#if savingsKind === 'positive'}
      Saves {money(result.savings.amount)} vs buying each item from its cheapest seller
    {:else if savingsKind === 'negative'}
      Costs {money(-result.savings.amount)} more than buying separately
    {:else}
      Same price as buying separately
    {/if}
  </p>

  <details class="items" open={expanded}>
    <summary class="summary style-label"
      >Show the {result.itemCount} chosen {result.itemCount === 1 ? 'item' : 'items'}</summary
    >
    <ul class="list">
      {#each result.items as item (item.listing.id)}
        {@const listed = item.listing.price}
        <li class="item">
          <div class="item-main">
            <span class="style-body">
              {#if item.wantlistItem}
                {item.wantlistItem.artist} – {item.wantlistItem.title}
              {:else}
                Release #{item.listing.releaseId}
              {/if}
            </span>
            <span class="style-caption muted">
              Media {item.listing.mediaCondition} · Sleeve {item.listing.sleeveCondition ?? '–'}
              {#if item.wantlistItem?.format}
                · {item.wantlistItem.format}
              {/if}
            </span>
          </div>
          <div class="item-price">
            <span class="style-figure">{money(item.price.amount)}</span>
            {#if listed.currency !== item.price.currency}
              <span class="style-caption muted"
                >listed at {formatMoney(listed.amount, listed.currency)}</span
              >
            {/if}
            <a
              class="style-caption"
              href={item.listing.url}
              target="_blank"
              rel="external noopener noreferrer"
            >
              View listing
            </a>
          </div>
        </li>
      {/each}
    </ul>
  </details>

  <footer class="foot">
    <a
      class="shop style-label"
      href={sellerWantsUrl(result.sellerName)}
      target="_blank"
      rel="external noopener noreferrer"
    >
      Shop this seller on Discogs →
    </a>
  </footer>
</article>

<style lang="scss">
  .card {
    display: flex;
    flex-direction: column;
    gap: $spacing-12;
    padding: $spacing-16;
    border: 1px solid $color-border;
    border-radius: $radius-lg;
    background: $color-surface;
  }

  .head {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: $spacing-12;
    align-items: start;
  }

  .rank {
    color: $color-text-muted;
  }

  .who {
    display: flex;
    flex-direction: column;
    gap: $spacing-2;
    min-width: 0;
  }

  .seller {
    color: $color-text;
    text-decoration: none;
    overflow-wrap: anywhere;

    @include focus-ring;

    &:hover {
      color: $color-accent;
      text-decoration: underline;
    }
  }

  .meta,
  .muted {
    color: $color-text-muted;
  }

  .count {
    white-space: nowrap;
  }

  .figures {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: $spacing-12;
    padding: $spacing-12;
    border-radius: $radius-md;
    background: $color-surface-muted;

    @include breakpoint('medium') {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }

  .figure {
    display: flex;
    flex-direction: column;
    gap: $spacing-2;
    min-width: 0;

    dt {
      color: $color-text-muted;
    }

    dd {
      display: flex;
      flex-wrap: wrap;
      gap: $spacing-4;
      align-items: baseline;
    }
  }

  .savings {
    color: $color-text-muted;

    &.is-positive {
      color: $color-positive;
    }

    &.is-negative {
      color: $color-negative;
    }
  }

  .summary {
    cursor: pointer;
    color: $color-accent;
    padding: $spacing-4 0;
    border-radius: $radius-sm;

    @include focus-ring;
  }

  .list {
    display: flex;
    flex-direction: column;
    padding: 0;
    margin-top: $spacing-8;
    list-style: none;
    border-top: 1px solid $color-divider;
  }

  .item {
    display: flex;
    flex-direction: column;
    gap: $spacing-4;
    padding: $spacing-8 0;
    border-bottom: 1px solid $color-divider;

    @include breakpoint('medium') {
      flex-direction: row;
      justify-content: space-between;
      gap: $spacing-16;
    }
  }

  .item-main {
    display: flex;
    flex-direction: column;
    gap: $spacing-2;
    min-width: 0;
  }

  .item-price {
    display: flex;
    flex-wrap: wrap;
    gap: $spacing-8;
    align-items: baseline;

    @include breakpoint('medium') {
      flex-direction: column;
      align-items: flex-end;
      gap: $spacing-2;
      text-align: right;
    }

    a {
      @include focus-ring;
    }
  }

  .foot {
    display: flex;
    justify-content: flex-end;
  }

  .shop {
    text-decoration: none;
    border-radius: $radius-sm;

    @include focus-ring;

    &:hover {
      text-decoration: underline;
    }
  }
</style>
