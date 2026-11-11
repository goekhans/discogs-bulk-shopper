<script lang="ts">
  import type { WantlistItem } from '#lib/domain/types.js';
  import { filterWantlist, wantlistLabel } from '../options.js';

  interface Props {
    label: string;
    /** Every item that can be picked; the chips are the selected subset. */
    items: WantlistItem[];
    selectedIds: number[];
    onadd: (releaseId: number) => void;
    onremove: (releaseId: number) => void;
    placeholder?: string;
    id?: string;
    /** Shown under the input. */
    hint?: string;
  }

  const uid = $props.id();

  let {
    label,
    items,
    selectedIds,
    onadd,
    onremove,
    placeholder = 'Type an artist or title…',
    id = `tags-${uid}`,
    hint
  }: Props = $props();

  const listboxId = $derived(`${id}-listbox`);
  const optionId = (releaseId: number) => `${id}-option-${releaseId}`;

  let query = $state('');
  let open = $state(false);
  let activeIndex = $state(0);
  let input: HTMLInputElement | undefined = $state();

  const byId = $derived(new Map(items.map((item) => [item.releaseId, item])));
  const chips = $derived(
    selectedIds
      .map((releaseId) => byId.get(releaseId) ?? null)
      .map((item, i) => ({
        releaseId: selectedIds[i],
        text: item ? `${item.artist} – ${item.title}` : `Release #${selectedIds[i]}`
      }))
  );
  const suggestions = $derived(filterWantlist(items, query, selectedIds));
  const expanded = $derived(open && suggestions.length > 0);
  const activeId = $derived(
    expanded && suggestions[activeIndex] ? optionId(suggestions[activeIndex].releaseId) : undefined
  );

  $effect(() => {
    // Keep the highlight on a real row when the list shrinks.
    if (activeIndex >= suggestions.length) activeIndex = Math.max(0, suggestions.length - 1);
  });

  function pick(item: WantlistItem) {
    onadd(item.releaseId);
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
        else if (suggestions.length) activeIndex = (activeIndex + 1) % suggestions.length;
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (suggestions.length) {
          activeIndex = (activeIndex - 1 + suggestions.length) % suggestions.length;
        }
        break;
      case 'Enter':
        if (expanded && suggestions[activeIndex]) {
          event.preventDefault();
          pick(suggestions[activeIndex]);
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
        if (query === '' && selectedIds.length) {
          event.preventDefault();
          onremove(selectedIds[selectedIds.length - 1]);
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
    {#if chips.length}
      <ul class="chips" aria-label="{label}: selected">
        {#each chips as chip (chip.releaseId)}
          <li class="chip style-caption">
            <span class="chip-text">{chip.text}</span>
            <button
              type="button"
              class="chip-remove"
              aria-label="Remove {chip.text}"
              onclick={() => onremove(chip.releaseId)}
            >
              <span aria-hidden="true">×</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
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
      aria-activedescendant={activeId}
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
      {#each suggestions as item, i (item.releaseId)}
        <!-- Keyboard selection happens on the combobox input, as the ARIA pattern prescribes. -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <li
          id={optionId(item.releaseId)}
          class="option style-body"
          class:is-active={i === activeIndex}
          role="option"
          aria-selected={i === activeIndex}
          tabindex="-1"
          onmousedown={(event) => event.preventDefault()}
          onclick={() => pick(item)}
        >
          {wantlistLabel(item)}
        </li>
      {/each}
    </ul>
  </div>
  {#if hint}
    <p id="{id}-hint" class="style-caption hint">{hint}</p>
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
  }

  .hint {
    color: $color-text-muted;
  }
</style>
