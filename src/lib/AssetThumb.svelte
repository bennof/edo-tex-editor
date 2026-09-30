<script lang="ts">
  import { getBlob, isImage } from '$lib/assets.svelte';
  import type { Asset } from '$lib/store.svelte';

  // Small preview of an image asset in the sidebar; other files show nothing.
  let { asset }: { asset: Asset } = $props();

  const image = $derived(isImage(asset));
  let url = $state<string | null>(null);

  $effect(() => {
    if (!image) return;
    const id = asset.id;
    asset.added; // a replaced file keeps its id: reload then
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
</script>

{#if url}<img class="thumb" src={url} alt="" />{/if}
