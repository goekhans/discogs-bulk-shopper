<script lang="ts">
  import {
    filterWantlistGroups,
    variantLabel,
    wantlistLabel,
    type WantlistGroup
  } from '../options.js';

  interface Props {
    label: string;
    /** Every wantlist group that can be picked; the chips are the selected subset. */
    groups: WantlistGroup[];
    selectedIds: number[];
    /** `ids` are the releases picked; `allIds` every release of their group (master). */
    onadd: (ids: number[], allIds: number[]) => void;
    onremove: (ids: number[]) => void;
    placeholder?: string;
    id?: string;
    /** Shown under the input, above the chips. */
    hint?: string;
  }

  /** One visible row of the listbox: a whole group, a lone variant, or an expanded variant. */
  interface Row {
    kind: 'group' | 'single' | 'variant';
    domId: string;
    group: WantlistGroup;
    text: string;
    /** For a nested variant: the full label a screen reader should hear. */
    ariaLabel?: string;
    ids: number[];
  }

  interface Chip {
    key: string;
    text: string;
    ids: number[];
  }

  const uid = $props.id();

  let {
    label,
    groups,
    selectedIds,
    onadd,
    onremove,
    placeholder = 'Type an artist or title…',
    id = `tags-${uid}`,
    hint
  }: Props = $props();

  const listboxId = $derived(`${id}-listbox`);

  let query = $state('');
  let open = $state(false);
  let activeIndex = $state(0);
  let expandedKeys = $state<number[]>([]);
  let input: HTMLInputElement | undefined = $state();

  const groupByRelease = $derived(
    new Map(groups.flatMap((group) => group.variants.map((item) => [item.releaseId, group])))
  );

  /** One chip per group with a selected variant, in the order the groups were first picked. */
  const chips = $derived.by(() => {
    const result: Chip[] = [];
    for (const releaseId of selectedIds) {
      const group = groupByRelease.get(releaseId);
      const key = group ? `g${group.key}` : `r${releaseId}`;
      const chip = result.find((c) => c.key === key);
      if (chip) chip.ids.push(releaseId);
      else
        result.push({ key, text: group ? group.label : `Release #${releaseId}`, ids: [releaseId] });
    }
    for (const chip of result) {
      const group = groupByRelease.get(chip.ids[0]);
      if (!group || group.variants.length <= 1) continue;
      chip.text +=
        chip.ids.length === group.variants.length
          ? ' · any version'
          : ` · ${chip.ids.length} of ${group.variants.length} versions`;
    }
    return result;
  });

  const suggestions = $derived(filterWantlistGroups(groups, query, selectedIds));

  const rows = $derived.by(() => {
    const result: Row[] = [];
    for (const group of suggestions) {
      if (group.variants.length === 1) {
        const [item] = group.variants;
        result.push({
          kind: 'single',
          domId: `${id}-option-r${item.releaseId}`,
          group,
          text: wantlistLabel(item),
          ids: [item.releaseId]
        });
        continue;
      }
      result.push({
        kind: 'group',
        domId: `${id}-option-g${group.key}`,
        group,
        text: `${group.label} · ${group.variants.length} versions`,
        ids: group.variants.map((item) => item.releaseId)
      });
      if (!expandedKeys.includes(group.key)) continue;
      for (const item of group.variants) {
        result.push({
          kind: 'variant',
          domId: `${id}-option-r${item.releaseId}`,
          group,
          text: variantLabel(item),
          ariaLabel: `${group.label} · ${variantLabel(item)}`,
          ids: [item.releaseId]
        });
      }
    }
    return result;
  });

  const expanded = $derived(open && rows.length > 0);
  const activeRow = $derived(expanded ? rows[activeIndex] : undefined);

  $effect(() => {
    // Keep the highlight on a real row when the list shrinks.
    if (activeIndex >= rows.length) activeIndex = Math.max(0, rows.length - 1);
  });

  const isExpanded = (group: WantlistGroup) => expandedKeys.includes(group.key);

  function setExpanded(group: WantlistGroup, value: boolean) {
    if (value === isExpanded(group)) return;
    expandedKeys = value
      ? [...expandedKeys, group.key]
      : expandedKeys.filter((key) => key !== group.key);
  }

  function toggle(row: Row) {
    const next = !isExpanded(row.group);
    setExpanded(row.group, next);
    activeIndex = rows.findIndex((r) => r.domId === row.domId);
  }

  function pick(row: Row) {
    onadd(
      row.ids,
      row.group.variants.map((item) => item.releaseId)
    );
    query = '';
    activeIndex = 0;
    open = true;
    input?.focus();
  }

  function onkeydown(event: KeyboardEvent) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!open) open = true;
        else if (rows.length) activeIndex = (activeIndex + 1) % rows.length;
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (rows.length) activeIndex = (activeIndex - 1 + rows.length) % rows.length;
        break;
      case 'ArrowRight':
        if (activeRow?.kind === 'group' && !isExpanded(activeRow.group)) {
          event.preventDefault();
          setExpanded(activeRow.group, true);
        }
        break;
      case 'ArrowLeft':
        if (activeRow && activeRow.kind !== 'single' && isExpanded(activeRow.group)) {
          event.preventDefault();
          const group = activeRow.group;
          setExpanded(group, false);
          // From a nested variant, land on its group row.
          activeIndex = Math.max(
            0,
            rows.findIndex((r) => r.kind === 'group' && r.group.key === group.key)
          );
        }
        break;
      case 'Enter':
        if (activeRow) {
          event.preventDefault();
          pick(activeRow);
        } else if (query) {
          // Never submit the form from a half-typed filter.
          event.preventDefault();
        }
        break;
      case 'Escape':
        if (open) {
          event.preventDefault();
          open = false;
        }
        break;
      case 'Backspace':
        if (query === '' && chips.length) {
          event.preventDefault();
          onremove(chips[chips.length - 1].ids);
        }
        break;
    }
  }

  function onblur(event: FocusEvent) {
    // Clicking an option moves focus inside the listbox; keep it open for that click.
    const next = event.relatedTarget as HTMLElement | null;
    if (next?.closest(`#${CSS.escape(listboxId)}`)) return;
    open = false;
  }
</script>

<div class="field">
  <label class="style-label label" for={id}>{label}</label>
  <div class="control">
    <input
      {id}
      bind:this={input}
      bind:value={query}
      class="input"
      type="text"
      autocomplete="off"
      {placeholder}
      role="combobox"
      aria-autocomplete="list"
      aria-expanded={expanded}
      aria-controls={listboxId}
      aria-activedescendant={activeRow?.domId}
      aria-describedby={hint ? `${id}-hint` : undefined}
      onfocus={() => (open = true)}
      oninput={() => {
        open = true;
        activeIndex = 0;
      }}
      {onkeydown}
      {onblur}
    />
    <ul
      id={listboxId}
      class="listbox"
      role="listbox"
      aria-label="{label} suggestions"
      hidden={!expanded}
    >
      {#each rows as row, i (row.domId)}
        <!-- Keyboard selection happens on the combobox input, as the ARIA pattern prescribes. -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <li
          id={row.domId}
          class="option style-body"
          class:is-active={i === activeIndex}
          class:is-group={row.kind === 'group'}
          class:is-nested={row.kind === 'variant'}
          role="option"
          aria-selected={i === activeIndex}
          aria-label={row.ariaLabel}
          tabindex="-1"
          onmousedown={(event) => event.preventDefault()}
          onclick={() => pick(row)}
        >
          <span class="option-text">{row.text}</span>
          {#if row.kind === 'group'}
            <button
              type="button"
              class="option-toggle"
              aria-expanded={isExpanded(row.group)}
              aria-label="Show versions of {row.group.label}"
              tabindex="-1"
              onmousedown={(event) => event.preventDefault()}
              onclick={(event) => {
                event.stopPropagation();
                toggle(row);
              }}
            >
              <span class="chevron" class:is-open={isExpanded(row.group)} aria-hidden="true">›</span
              >
            </button>
          {/if}
        </li>
      {/each}
    </ul>
  </div>
  {#if hint}
    <p id="{id}-hint" class="style-caption hint">{hint}</p>
  {/if}
  {#if chips.length}
    <ul class="chips" aria-label="{label}: selected">
      {#each chips as chip (chip.key)}
        <li class="chip style-caption">
          <span class="chip-text">{chip.text}</span>
          <button
            type="button"
            class="chip-remove"
            aria-label="Remove {chip.text}"
            onclick={() => onremove(chip.ids)}
          >
            <span aria-hidden="true">×</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style lang="scss">
  .field {
    display: flex;
    flex-direction: column;
    gap: $spacing-4;
    min-width: 0;
  }

  .label {
    color: $color-text-muted;
  }

  .control {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: $spacing-8;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: $spacing-8;
    margin-top: $spacing-4;
    padding: 0;
    list-style: none;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: $spacing-4;
    max-width: 100%;
    padding: $spacing-2 $spacing-4 $spacing-2 $spacing-12;
    border-radius: $radius-pill;
    background: $color-accent-subtle;
    color: $color-text;
  }

  .chip-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chip-remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 0;
    border-radius: $radius-pill;
    background: transparent;
    color: $color-text-muted;
    font-size: 16px;
    line-height: 1;

    @include focus-ring;

    &:hover {
      background: $color-surface-hover;
      color: $color-text;
    }
  }

  .input {
    width: 100%;
    min-height: 40px;
    padding: $spacing-8 $spacing-12;
    border: 1px solid $color-control-border;
    border-radius: $radius-md;
    background: $color-surface;
    color: $color-text;

    @include focus-ring;

    &::placeholder {
      color: $color-text-muted;
    }
  }

  .listbox {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: $z-index-dropdown;
    max-height: 280px;
    margin-top: $spacing-4;
    padding: $spacing-4;
    overflow-y: auto;
    list-style: none;
    border: 1px solid $color-border;
    border-radius: $radius-md;
    background: $color-surface;
    box-shadow: 0 8px 24px $color-shadow;

    @include enter-fade-scale;

    &[hidden] {
      display: none;
    }
  }

  .option {
    display: flex;
    align-items: center;
    gap: $spacing-8;
    padding: $spacing-8 $spacing-12;
    border-radius: $radius-sm;
    cursor: pointer;

    &:hover,
    &.is-active {
      background: $color-surface-hover;
    }

    &.is-active {
      color: $color-accent;
    }

    &.is-nested {
      padding-left: $spacing-32;
      color: $color-text-muted;

      &.is-active {
        color: $color-accent;
      }
    }
  }

  .option-text {
    flex: 1 1 auto;
    min-width: 0;
  }

  .option-toggle {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 0;
    border-radius: $radius-pill;
    background: transparent;
    color: $color-text-muted;
    font-size: 18px;
    line-height: 1;

    @include focus-ring;

    &:hover {
      background: $color-accent-subtle;
      color: $color-text;
    }
  }

  .chevron {
    display: inline-block;
    transition: transform $duration-fast $ease-out;

    &.is-open {
      transform: rotate(90deg);
    }
  }

  .hint {
    color: $color-text-muted;
  }
</style>
