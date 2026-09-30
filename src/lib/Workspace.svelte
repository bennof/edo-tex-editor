<script lang="ts">
  import type { Snippet } from 'svelte';

  // Source and target side by side (landscape), or the target as a bottom
  // sheet that can be pulled up over the source (portrait).
  // `tools` (e.g. a save button) sits in the preview's header bar.
  let { source, target, label, tools }: { source: Snippet; target: Snippet; label: Snippet; tools?: Snippet } =
    $props();

  const GRIP = 44; // height of the grip bar in portrait

  let w = $state(0);
  let h = $state(0);
  let split = $state(0.5); // share of the source in landscape
  let sheet = $state(0.5); // share of the height taken by the sheet in portrait
  let dragging = $state(false);

  const portrait = $derived(w > 0 && (w < h || w < 640));
  const sheetPx = $derived(Math.round(GRIP + (h - GRIP) * sheet));

  let box: HTMLElement;
  let start = { pos: 0, value: 0, moved: false };

  function down(e: PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    start = { pos: portrait ? e.clientY : e.clientX, value: portrait ? sheet : split, moved: false };
    dragging = true;
  }

  function move(e: PointerEvent) {
    if (!dragging) return;
    const r = box.getBoundingClientRect();
    if (portrait) {
      const dy = start.pos - e.clientY;
      if (Math.abs(dy) > 3) start.moved = true;
      sheet = clamp(start.value + dy / (r.height - GRIP), 0, 1);
    } else {
      start.moved = true;
      split = clamp((e.clientX - r.left) / r.width, 0.2, 0.8);
    }
  }

  function up() {
    if (!dragging) return;
    dragging = false;
    if (!portrait) return;
    // Tap on the grip: open/close. Drag: snap to the nearest stop.
    if (!start.moved) sheet = sheet < 0.5 ? 1 : 0;
    else sheet = [0, 0.5, 1].reduce((a, b) => (Math.abs(b - sheet) < Math.abs(a - sheet) ? b : a));
  }

  function key(e: KeyboardEvent) {
    const step = e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : 0;
    if (!step) return;
    e.preventDefault();
    if (portrait) sheet = clamp(sheet - step * 0.5, 0, 1);
    else split = clamp(split + step * 0.05, 0.2, 0.8);
  }

  const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
</script>

<div
  bind:this={box}
  bind:clientWidth={w}
  bind:clientHeight={h}
  class="workspace"
  class:portrait
  class:dragging
  style:--split="{split * 100}%"
  style:--sheet="{sheetPx}px"
>
  <section class="pane source">{@render source()}</section>

  {#if !portrait}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
    <div
      class="splitter"
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={Math.round(split * 100)}
      aria-label="Adjust width"
      tabindex="0"
      onpointerdown={down}
      onpointermove={move}
      onpointerup={up}
      onpointercancel={up}
      onkeydown={key}
    ></div>
  {/if}

  <section class="pane target">
    <div class="target-head">
      {#if portrait}
        <div
          class="grip"
          role="slider"
          aria-label="Pull up preview"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={Math.round(sheet * 100)}
          tabindex="0"
          onpointerdown={down}
          onpointermove={move}
          onpointerup={up}
          onpointercancel={up}
          onkeydown={key}
        >
          <span class="handle"></span>
          <span class="grip-label">{@render label()}</span>
        </div>
      {:else}
        <span class="target-label">{@render label()}</span>
      {/if}
      <!-- sibling of the grip, so tapping a tool does not start a drag -->
      {#if tools}<div class="target-tools">{@render tools()}</div>{/if}
    </div>
    <div class="target-body">{@render target()}</div>
  </section>
</div>
