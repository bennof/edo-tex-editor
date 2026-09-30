<script lang="ts">
  import { untrack } from 'svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { data, docTitle, removeDoc } from '$lib/store.svelte';
  import { header } from '$lib/header.svelte';
  import { config } from '$lib/config.svelte';
  import { compile, type CompileResult } from '$lib/texserver';
  import Workspace from '$lib/Workspace.svelte';
  import Preview from '$lib/Preview.svelte';
  import { removeDocAssets, sizeLabel } from '$lib/assets.svelte';
  import { download as save, fileName } from '$lib/download';

  const d = $derived(data.docs.find((x) => x.id === page.params.id));
  const docId = $derived(d?.id);

  let result = $state<CompileResult | null>(null); // last finished compilation
  let pdf = $state<Blob | null>(null); // last successful PDF, kept while there are errors
  let running = $state(false);
  let tab = $state<'pdf' | 'log'>('pdf');
  let controller: AbortController | null = null;

  /** Compile the current source; a running compilation is aborted first. */
  async function run() {
    if (!d) return;
    controller?.abort();
    const c = (controller = new AbortController());
    running = true;
    const r = await compile(d.source, {
      url: config.server.url,
      dataMode: config.server.dataMode,
      timeoutMs: config.timeoutMs,
      signal: c.signal
    });
    if (c !== controller) return; // superseded by a newer compilation or another document
    controller = null;
    running = false;
    result = r;
    if (r.pdf) pdf = r.pdf;
  }

  function stop() {
    controller?.abort();
    controller = null;
    running = false;
  }

  // Another document: forget the previous one's result
  $effect(() => {
    docId;
    untrack(() => {
      stop();
      result = null;
      pdf = null;
    });
    return stop;
  });

  // Compile automatically after a pause in typing
  $effect(() => {
    if (!d || !config.autoCompile) return;
    d.source;
    const t = setTimeout(run, config.debounceMs);
    return () => clearTimeout(t);
  });

  // Put title and actions into the header
  $effect(() => {
    header.title = d ? docTitle(d) : '';
    header.actions = d ? actions : null;
    header.rename = d ? rename : null;
    return () => {
      header.title = '';
      header.actions = null;
      header.rename = null;
    };
  });

  function key(e: KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && d) {
      e.preventDefault();
      run();
    }
  }

  function edit(e: Event) {
    d!.source = (e.currentTarget as HTMLTextAreaElement).value;
    d!.updated = new Date().toISOString();
  }

  function rename(name: string) {
    d!.name = name.trim();
    d!.updated = new Date().toISOString();
  }

  function remove() {
    if (!d || !confirm(`Delete "${docTitle(d)}"?`)) return;
    removeDocAssets(d);
    removeDoc(d);
    goto('/');
  }

  const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
  const errors = $derived(result?.errors ?? []);
  const unsent = $derived(config.server.supportsAssets ? [] : (d?.assets ?? []).map((a) => a.name));
</script>

<svelte:window onkeydown={key} />

{#snippet actions()}
  <span class="status" class:ok={!running && result?.ok} class:failed={!running && result && !result.ok} role="status">
    {#if running}Compiling…
    {:else if result?.ok}✓ {seconds(result.ms)}
    {:else if result}✕ {result.errors.length > 1 ? `${result.errors.length} errors` : 'Error'} · {seconds(result.ms)}{/if}
  </span>
  <button class="primary" title="Compile (⌘/Ctrl+Enter)" onclick={run}><span class="wide">Compile</span><span class="narrow">▶</span></button>
  <button class="secondary danger" aria-label="Delete" onclick={remove}><span class="wide">Delete</span><span class="narrow">✕</span></button>
{/snippet}

{#if d}
  <div class="doc">
    <Workspace>
      {#snippet source()}
        <textarea class="editor" aria-label="TeX source" spellcheck="false" value={d.source} oninput={edit}></textarea>
        {#if errors.length || unsent.length}
          <ul class="diagnostics">
            {#each errors as e, i (i)}
              <li class="error">{e.line ? `Line ${e.line}: ` : ''}{e.message}</li>
            {/each}
            {#if unsent.length}
              <li class="warn">Not sent, the server accepts no assets: {unsent.join(', ')}</li>
            {/if}
          </ul>
        {/if}
      {/snippet}
      {#snippet label()}Result{/snippet}
      {#snippet tools()}
        <div class="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'pdf'} onclick={() => (tab = 'pdf')}>PDF</button>
          <button role="tab" aria-selected={tab === 'log'} onclick={() => (tab = 'log')}>Log</button>
        </div>
        <button
          class="row-action"
          aria-label="Save PDF"
          title="Save PDF"
          disabled={!pdf}
          onclick={() => pdf && save(pdf, fileName(docTitle(d), 'pdf'))}>↓</button
        >
      {/snippet}
      {#snippet target()}
        <div class="tab-panel" hidden={tab !== 'pdf'}>
          <Preview blob={pdf} title="PDF of {docTitle(d)}" />
        </div>
        {#if tab === 'log'}
          <div class="tab-panel log">
            {#if result}
              <dl>
                <dt>Server</dt><dd>{config.server.url}</dd>
                <dt>HTTP status</dt><dd>{result.status || 'no response'}</dd>
                <dt>Duration</dt><dd>{seconds(result.ms)}</dd>
                <dt>Request</dt><dd>{sizeLabel(result.requestBytes)}</dd>
                <dt>Result</dt><dd>{result.ok ? `PDF, ${sizeLabel(result.pdf!.size)}` : 'no PDF'}</dd>
              </dl>
              <pre>{result.log}</pre>
            {:else}
              <p class="empty">{running ? 'Compiling…' : 'Not compiled yet. Press Compile or ⌘/Ctrl+Enter.'}</p>
            {/if}
          </div>
        {/if}
      {/snippet}
    </Workspace>
  </div>
{:else}
  <section class="content"><p class="empty">Document not found.</p></section>
{/if}
