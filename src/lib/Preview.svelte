<script lang="ts">
  import { untrack } from 'svelte';

  // Shows a PDF in an iframe via a blob URL, with the browser's PDF viewer
  // (which does not work in a sandbox). Where the viewer allows it, the scroll
  // position is kept across reloads.
  let { blob, title = 'Preview' }: { blob: Blob | null; title?: string } = $props();

  let frame: HTMLIFrameElement | undefined = $state();
  let url: string | null = $state(null);
  let scroll = { x: 0, y: 0 };

  $effect(() => {
    if (!blob) return void (url = null);
    const win = untrack(() => frame?.contentWindow);
    try {
      if (win) scroll = { x: win.scrollX, y: win.scrollY };
    } catch {}
    const u = URL.createObjectURL(blob);
    url = u;
    return () => URL.revokeObjectURL(u);
  });

  function restore() {
    try {
      frame?.contentWindow?.scrollTo(scroll.x, scroll.y);
    } catch {}
  }
</script>

{#if url}
  <iframe bind:this={frame} class="preview" src={url} {title} onload={restore}></iframe>
{:else}
  <p class="empty">No PDF yet.</p>
{/if}
