<script lang="ts">
  import type { RankingMode } from '#lib/ranking/types.js';
  import type { DataStore, SearchStore } from '#lib/stores/index.js';
  import Button from './base/Button.svelte';
  import NumberInput from './base/NumberInput.svelte';
  import Select from './base/Select.svelte';
  import TagInput from './base/TagInput.svelte';
  import {
    CURRENCY_OPTIONS,
    GRADE_OPTIONS,
    RANKING_OPTIONS,
    gradeToValue,
    groupWantlist,
    valueToGrade
  } from './options.js';

  interface Props {
    search: SearchStore;
    data: DataStore;
  }

  let { search, data }: Props = $props();

  const params = $derived(search.params);
  /** Grouped once per wantlist so both inputs share the master groups. */
  const groups = $derived(groupWantlist(data.wantlistItems));

  /**
   * Ranking and currency only change how the same sellers are ordered and priced, so after a
   * completed search they re-run it on change. Filters (titles, grades, minimum items, budget)
   * wait for the Search button, since they are usually adjusted a few at a time.
   */
  function reorder(patch: { ranking?: RankingMode; currency?: string }) {
    search.setParams(patch);
    if (search.status === 'done') void search.search();
  }

  function onsubmit(event: SubmitEvent) {
    event.preventDefault();
    void search.search();
  }
</script>

<form class="form" {onsubmit} aria-label="Search sellers">
  <div class="titles">
    <TagInput
      label="Must have"
      {groups}
      selectedIds={params.requiredGroups.flat()}
      onadd={(ids, allIds) => search.addRequired(ids, allIds)}
      onremove={(ids) => search.removeRequired(ids)}
      hint="Sellers must offer every one of these (any version you picked)."
    />
    <TagInput
      label="Leave out"
      {groups}
      selectedIds={params.excludedReleaseIds}
      onadd={(ids) => search.addExcluded(ids)}
      onremove={(ids) => search.removeExcluded(ids)}
      hint="Never picked from any seller."
    />
  </div>

  <div class="filters">
    <Select
      label="Min. media grade"
      options={GRADE_OPTIONS}
      value={gradeToValue(params.minMediaGrade)}
      onchange={(value) => search.setParams({ minMediaGrade: valueToGrade(value) })}
    />
    <Select
      label="Min. sleeve grade"
      options={GRADE_OPTIONS}
      value={gradeToValue(params.minSleeveGrade)}
      onchange={(value) => search.setParams({ minSleeveGrade: valueToGrade(value) })}
    />
    <NumberInput
      label="Min. items per seller"
      min={1}
      max={500}
      value={params.minItems}
      hint="Sellers with fewer wantlist items are dropped."
      onchange={(value) => search.setParams({ minItems: value })}
    />
    <NumberInput
      label={`Max total (${params.currency})`}
      min={1}
      step={1}
      allowEmpty
      value={params.maxTotal}
      hint="Per seller, items plus shipping. Empty means no limit."
      onchange={(value) => search.setParams({ maxTotal: value })}
    />
    <Select
      label="Currency"
      options={CURRENCY_OPTIONS}
      value={params.currency}
      onchange={(value) => reorder({ currency: value })}
    />
    <Select
      label="Rank by"
      options={RANKING_OPTIONS}
      value={params.ranking}
      onchange={(value) => reorder({ ranking: value as RankingMode })}
    />
  </div>

  <div class="actions">
    <Button type="submit" variant="primary" loading={search.status === 'loading'}>Search</Button>
    <Button variant="ghost" onclick={() => search.reset()}>Reset</Button>
  </div>
</form>

<style lang="scss">
  .form {
    display: flex;
    flex-direction: column;
    gap: $spacing-20;
    padding: $spacing-16;
    border: 1px solid $color-border;
    border-radius: $radius-lg;
    background: $color-surface;

    @include breakpoint('medium') {
      padding: $spacing-24;
    }
  }

  .titles {
    display: grid;
    gap: $spacing-16;

    @include breakpoint('medium') {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  .filters {
    display: grid;
    gap: $spacing-16;
    grid-template-columns: repeat(2, minmax(0, 1fr));

    @include breakpoint('medium') {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    @include breakpoint('large') {
      grid-template-columns: repeat(6, minmax(0, 1fr));
    }
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: $spacing-8;
  }
</style>
