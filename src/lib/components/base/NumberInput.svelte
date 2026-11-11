<script lang="ts" generics="Empty extends boolean = false">
  /**
   * A numeric field that commits on blur, Enter or the spinner. By default the committed value
   * is always a number: an empty or unparsable field is clamped to `min` (or 0). With
   * `allowEmpty` the field may instead be cleared, and then `value` and `onchange` carry `null`
   * for "no value"; `min`/`max` still clamp any number that is entered. The `Empty` generic is
   * inferred from `allowEmpty`, so a caller without it keeps a plain `number` on both sides.
   */
  type Value = Empty extends true ? number | null : number;

  interface Props {
    label: string;
    /** Lets the field be cleared; `value` and `onchange` then carry null for "no value". */
    allowEmpty?: Empty;
    value: Value;
    min?: number;
    max?: number;
    /** Entered values are rounded to a multiple of this (decimals allowed). */
    step?: number;
    id?: string;
    name?: string;
    disabled?: boolean;
    /** Shown under the input. */
    hint?: string;
    /** Called with the rounded and clamped value (or null for a cleared field) on commit. */
    onchange?: (value: Value) => void;
  }

  const uid = $props.id();

  let {
    label,
    value = $bindable(),
    min,
    max,
    step = 1,
    id = `number-${uid}`,
    name,
    disabled = false,
    hint,
    allowEmpty,
    onchange
  }: Props = $props();

  const decimals = $derived(Number.isInteger(step) ? 0 : (String(step).split('.')[1] ?? '').length);

  /** Rounds to the nearest step, then clamps, so a committed number is always on the grid. */
  function normalise(input: number): number {
    let next = step > 0 ? Number((Math.round(input / step) * step).toFixed(decimals)) : input;
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    return next;
  }

  /**
   * Svelte binds an empty number input as null. Without allowEmpty that (or NaN) falls back to
   * min, so the field never leaves an invalid number behind; with it, the field commits null.
   * The casts are safe: null is only committed when allowEmpty (Empty = true) is set.
   */
  function commit() {
    const entered = typeof value === 'number' && Number.isFinite(value) ? value : null;
    const next = entered === null && allowEmpty === true ? null : normalise(entered ?? min ?? 0);
    value = next as Value;
    onchange?.(next as Value);
  }
</script>

<div class="field">
  <label class="style-label label" for={id}>{label}</label>
  <input
    {id}
    {name}
    {min}
    {max}
    {step}
    {disabled}
    type="number"
    inputmode={decimals > 0 ? 'decimal' : 'numeric'}
    class="input tabular-nums"
    bind:value
    onchange={commit}
    aria-describedby={hint ? `${id}-hint` : undefined}
  />
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

  .input {
    width: 100%;
    min-height: 40px;
    padding: $spacing-8 $spacing-12;
    border: 1px solid $color-control-border;
    border-radius: $radius-md;
    background: $color-surface;
    color: $color-text;

    @include focus-ring;

    &:disabled {
      opacity: 0.6;
    }
  }

  .hint {
    color: $color-text-muted;
  }
</style>
