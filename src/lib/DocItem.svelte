<script lang="ts">
  import { docTitle, type Doc } from '$lib/store.svelte';
  import { addAssets, removeAsset, downloadAsset, isImage, sizeLabel } from '$lib/assets.svelte';
  import type { Asset } from '$lib/store.svelte';
  import ImageDialog from '$lib/ImageDialog.svelte';
  import { exportDoc } from '$lib/bundle';
  import AssetThumb from '$lib/AssetThumb.svelte';

  // Document in the sidebar: expandable with its assets. Files are added by
  // dropping them on the entry or the asset list, or with the + button.
  let { doc, active = false, open = $bindable(false) }: { doc: Doc; active?: boolean; open?: boolean } = $props();

  let over = $state(false);
  let preview = $state<Asset | null>(null);

  // A click opens images in the large view (with a download button there) and
  // downloads other files.
  function clickAsset(a: Asset) {
    if (isImage(a)) preview = a;
    else downloadAsset(a);
  }
  let input: HTMLInputElement;
  const assets = $derived([...(doc.assets ?? [])].sort((a, b) => a.name.localeCompare(b.name)));

  const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files') ?? false;

  function dragover(e: DragEvent) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'copy';
    over = true;
  }

  function dragleave(e: DragEvent) {
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as globalThis.Node | null)) over = false;
  }

  // stopPropagation: a drop on a document adds assets instead of importing a new document
  async function drop(e: DragEvent) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    over = false;
    open = true;
    await addAssets(doc, e.dataTransfer!.files);
  }

  async function picked() {
    open = true;
    await addAssets(doc, input.files ?? []);
    input.value = '';
  }
</script>

<div class="doc-group" class:drop={over} role="group" aria-label={docTitle(doc)} ondragover={dragover} ondragleave={dragleave} ondrop={drop}>
  <div class="doc-row" class:active>
    <button
      class="twisty"
      class:open
      aria-label={open ? 'Collapse assets' : 'Expand assets'}
      aria-expanded={open}
      onclick={() => (open = !open)}>›</button
    >
    <a class="item" href="/doc/{doc.id}">
      {docTitle(doc)}{#if assets.length}<small title="{assets.length} files">{assets.length}</small>{/if}
    </a>
    <button class="row-action" aria-label="Download document with assets (ZIP)" title="Download document with assets (ZIP)" onclick={() => exportDoc(doc)}>↓</button>
    <button class="row-action" aria-label="Add file" title="Add file" onclick={() => input.click()}>＋</button>
  </div>

  {#if open}
    <ul class="assets">
      {#each assets as a (a.id)}
        <li>
          <button
            class="asset"
            title={isImage(a) ? `View ${a.name}` : `Download ${a.name}`}
            onclick={() => clickAsset(a)}
          >
            <AssetThumb asset={a} />{a.name} <small>{sizeLabel(a.size)}</small>
          </button>
          <button class="remove" aria-label="Remove {a.name}" title="Remove" onclick={() => removeAsset(doc, a)}>✕</button>
        </li>
      {:else}
        <li class="empty">Drop files here or use ＋</li>
      {/each}
    </ul>
  {/if}

  <input bind:this={input} type="file" multiple hidden onchange={picked} />
  <ImageDialog bind:asset={preview} />
</div>
