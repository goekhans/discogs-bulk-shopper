<script lang="ts">
  interface Props {
    label: string;
    value: number;
    min?: number;
    max?: number;
    step?: number;
    id?: string;
    name?: string;
    disabled?: boolean;
    /** Shown under the input. */
    hint?: string;
    /** Called with the clamped value when the field is committed (blur, Enter or spinner). */
    onchange?: (value: number) => void;
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
    onchange
  }: Props = $props();

  /** Clamps on commit so a cleared or out-of-range field never leaves an invalid number behind. */
  function commit() {
    let next = Number.isFinite(value) ? Math.round(value) : (min ?? 0);
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    value = next;
    onchange?.(next);
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
    inputmode="numeric"
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
