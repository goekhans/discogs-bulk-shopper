<script lang="ts">
  interface Props {
    label: string;
    checked: boolean;
    id?: string;
    name?: string;
    disabled?: boolean;
    onchange?: (checked: boolean) => void;
  }

  const uid = $props.id();

  let {
    label,
    checked = $bindable(false),
    id = `toggle-${uid}`,
    name,
    disabled = false,
    onchange
  }: Props = $props();
</script>

<label class="toggle" for={id}>
  <input
    {id}
    {name}
    {disabled}
    type="checkbox"
    role="switch"
    class="input"
    bind:checked
    onchange={() => onchange?.(checked)}
  />
  <span class="track" aria-hidden="true"><span class="thumb"></span></span>
  <span class="style-label text">{label}</span>
</label>

<style lang="scss">
  .toggle {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: $spacing-8;
    min-height: 32px;
    cursor: pointer;
    user-select: none;
  }

  // The real checkbox stays in the tab order but is drawn as the track.
  .input {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .track {
    position: relative;
    flex: none;
    width: 36px;
    height: 20px;
    border-radius: $radius-pill;
    background: $color-control-border;
    transition: background-color $duration-fast $ease-out;
  }

  .thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: $radius-pill;
    background: $color-surface;
    transition: transform $duration-fast $ease-out;
  }

  .input:checked + .track {
    background: $color-accent;
  }

  .input:checked + .track .thumb {
    transform: translateX(16px);
  }

  .input:focus-visible + .track {
    outline: 2px solid $color-focus;
    outline-offset: 2px;
  }

  .input:disabled ~ * {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .text {
    color: $color-text;
  }
</style>
