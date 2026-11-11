<script lang="ts">
  import type { SelectOption } from '../options.js';

  interface Props {
    label: string;
    value: string;
    options: SelectOption[];
    id?: string;
    name?: string;
    disabled?: boolean;
    /** Called after `value` has been updated. */
    onchange?: (value: string) => void;
  }

  const uid = $props.id();

  let {
    label,
    value = $bindable(),
    options,
    id = `select-${uid}`,
    name,
    disabled = false,
    onchange
  }: Props = $props();
</script>

<div class="field">
  <label class="style-label label" for={id}>{label}</label>
  <select {id} {name} {disabled} class="select" bind:value onchange={() => onchange?.(value)}>
    {#each options as option (option.value)}
      <option value={option.value}>{option.label}</option>
    {/each}
  </select>
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

  .select {
    width: 100%;
    min-height: 40px;
    padding: $spacing-8 $spacing-32 $spacing-8 $spacing-12;
    border: 1px solid $color-control-border;
    border-radius: $radius-md;
    background: $color-surface;
    color: $color-text;
    appearance: none;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'><path d='M1 1l5 5 5-5' fill='none' stroke='%237c7a73' stroke-width='1.5'/></svg>");
    background-repeat: no-repeat;
    background-position: right $spacing-12 center;

    @include focus-ring;

    &:disabled {
      opacity: 0.6;
    }
  }
</style>
