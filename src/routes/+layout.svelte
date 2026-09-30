<script lang="ts">
  import '../app.css';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { data, newDoc } from '$lib/store.svelte';
  import DocItem from '$lib/DocItem.svelte';
  import { importDoc, importable } from '$lib/bundle';
  import { examples, newFromExample, type Example } from '$lib/examples';
  import { header } from '$lib/header.svelte';
  import SettingsDialog from '$lib/SettingsDialog.svelte';

  let { children } = $props();

  // Desktop: collapse/expand the sidebar. Mobile: drawer above the content.
  let open = $state(true);
  let mobileOpen = $state(false);
  let settingsOpen = $state(false);
  let examplesOpen = $state(false);
  let renaming = $state(false);
  let expanded: Record<string, boolean> = $state({}); // expanded documents
  let importOver = $state(false);
  let importError = $state('');

  // Dropping a ZIP bundle or a .tex file on the documents area creates a document
  function importOverDocs(e: DragEvent) {
    if (!e.dataTransfer?.types.includes('Files')) return;
    // Over a document entry the drop adds assets there, see DocItem
    importOver = !(e.target as Element).closest('.doc-group');
    if (importOver) e.preventDefault();
  }

  async function importDrop(e: DragEvent) {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    importOver = false;
    importError = '';
    const files = [...e.dataTransfer.files];
    const skipped = files.filter((f) => !importable(f)).map((f) => f.name);
    let last = '';
    for (const f of files.filter(importable)) {
      try {
        const d = await importDoc(f);
        expanded[d.id] = !!d.assets?.length;
        last = d.id;
      } catch (err) {
        importError = (err as Error).message;
      }
    }
    if (skipped.length) importError = `Only ZIP or .tex files become documents: ${skipped.join(', ')}`;
    if (last) goto(`/doc/${last}`);
  }

  async function fromExample(e: Example) {
    examplesOpen = false;
    const d = await newFromExample(e);
    expanded[d.id] = !!d.assets?.length;
    goto(`/doc/${d.id}`);
  }

  function commit(e: Event) {
    if (!renaming) return;
    renaming = false;
    header.rename?.((e.currentTarget as HTMLInputElement).value);
  }

  function renameKey(e: KeyboardEvent) {
    if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
    if (e.key === 'Escape') renaming = false;
  }

  const select = (el: HTMLInputElement) => el.select();

  function toggle() {
    if (matchMedia('(max-width: 768px)').matches) mobileOpen = !mobileOpen;
    else open = !open;
  }

  // Close the drawer on mobile after navigating
  $effect(() => {
    page.url.pathname;
    mobileOpen = false;
    renaming = false;
  });
</script>

<svelte:head><title>{header.title ? `${header.title} · edotex` : 'edotex'}</title></svelte:head>

<div class="app" class:collapsed={!open}>
  <aside class="sidebar" class:mobile-open={mobileOpen}>
    <div class="sidebar-top">
      <button class="new" onclick={() => goto(`/doc/${newDoc().id}`)}>＋ New document</button>
      <button class="new" aria-expanded={examplesOpen} onclick={() => (examplesOpen = !examplesOpen)}>＋ New from example</button>
      {#if examplesOpen}
        <ul class="examples">
          {#each examples as e (e.name)}
            <li><button class="item" onclick={() => fromExample(e)}>{e.name}</button></li>
          {/each}
        </ul>
      {/if}
    </div>
    <nav>
      <div
        class="docs-drop"
        class:drop={importOver}
        role="group"
        aria-label="Documents"
        ondragover={importOverDocs}
        ondragleave={(e) => {
          if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as globalThis.Node | null)) importOver = false;
        }}
        ondrop={importDrop}
      >
        <p class="label">Documents</p>
        {#each data.docs as d (d.id)}
          <DocItem doc={d} active={page.params.id === d.id} bind:open={() => !!expanded[d.id], (v) => (expanded[d.id] = v)} />
        {:else}
          <p class="empty">No documents yet</p>
        {/each}
        <p class="empty drop-hint">Drop a ZIP or .tex file here to import it</p>
        {#if importError}<p class="error import-error">{importError}</p>{/if}
      </div>
    </nav>
    <div class="sidebar-bottom">
      <button class="account" onclick={() => (settingsOpen = true)}>⚙ Settings</button>
    </div>
  </aside>

  {#if mobileOpen}
    <button class="backdrop" aria-label="Close menu" onclick={() => (mobileOpen = false)}></button>
  {/if}

  <main>
    <header>
      <button class="icon" aria-label="Toggle sidebar" onclick={toggle}>☰</button>
      {#if renaming && header.rename}
        <!-- svelte-ignore a11y_autofocus -->
        <input
          class="title-input"
          aria-label="Document name"
          value={header.title}
          autofocus
          {@attach select}
          onblur={commit}
          onkeydown={renameKey}
        />
      {:else if header.rename}
        <button class="title rename" title="Rename" onclick={() => (renaming = true)}>{header.title}</button>
      {:else}
        <span class="title">{header.title || 'edotex'}</span>
      {/if}
      {#if header.actions}<div class="toolbar">{@render header.actions()}</div>{/if}
    </header>
    {@render children()}
  </main>
</div>

<SettingsDialog bind:open={settingsOpen} />
