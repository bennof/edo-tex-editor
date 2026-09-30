<script lang="ts">
  import { getBlob, downloadAsset, sizeLabel } from '$lib/assets.svelte';
  import type { Asset } from '$lib/store.svelte';

  // Large view of an image asset; closes with Escape, the button or a click beside the image.
  let { asset = $bindable(null) }: { asset: Asset | null } = $props();
  let dlg: HTMLDialogElement;
  let url = $state<string | null>(null);

  $effect(() => (asset ? dlg.showModal() : dlg?.close()));

  $effect(() => {
    if (!asset) return;
    const id = asset.id;
    let objectUrl: string | null = null;
    let current = true;
    getBlob(id).then((blob) => {
      if (current && blob) url = objectUrl = URL.createObjectURL(blob);
    });
    return () => {
      current = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      url = null;
    };
  });

  // A click on the backdrop reaches the dialog element itself
  function backdrop(e: MouseEvent) {
    if (e.target === dlg) dlg.close();
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog bind:this={dlg} class="dialog image-dialog" onclose={() => (asset = null)} onclick={backdrop}>
  {#if asset}
    <form method="dialog">
      <h2>{asset.name} <small>{sizeLabel(asset.size)}</small></h2>
      {#if url}<img src={url} alt={asset.name} />{:else}<p class="empty">Image not available in this browser.</p>{/if}
      <div class="actions">
        <button type="button" class="secondary" onclick={() => asset && downloadAsset(asset)}>Download</button>
        <button class="primary">Close</button>
      </div>
    </form>
  {/if}
</dialog>
