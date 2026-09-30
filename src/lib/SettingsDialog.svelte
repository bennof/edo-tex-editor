<script lang="ts">
  import { data, settings, setPersist, replaceData } from '$lib/store.svelte';
  import { persistAssets } from '$lib/assets.svelte';
  import { download } from '$lib/download';

  let { open = $bindable(false) } = $props();
  let dlg: HTMLDialogElement;
  let importInput: HTMLInputElement;
  let error = $state('');

  $effect(() => (open ? dlg.showModal() : dlg?.close()));

  function exportJson() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    download(blob, `edotex-${new Date().toISOString().slice(0, 10)}.json`);
  }

  async function importJson(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    error = '';
    try {
      const d = JSON.parse(await input.files![0].text());
      if (!Array.isArray(d.docs)) throw new Error();
      replaceData(d);
    } catch {
      error = 'This file is not a valid export of this app.';
    }
    input.value = '';
  }
</script>

<dialog bind:this={dlg} class="dialog" onclose={() => (open = false)}>
  <form method="dialog">
    <h2>Settings</h2>

    <fieldset>
      <legend>Data</legend>
      <label class="check">
        <input
          id="persist"
          type="checkbox"
          checked={settings.persist}
          onchange={(e) => {
            setPersist(e.currentTarget.checked);
            persistAssets(e.currentTarget.checked, data.docs);
          }}
        />
        Save documents in this browser
      </label>
      <p class="hint">
        Turning this off deletes the saved data immediately. The current session is kept until
        you close the window.
      </p>
      <div class="actions left">
        <button type="button" class="secondary" onclick={exportJson}>Export JSON</button>
        <button type="button" class="secondary" onclick={() => importInput.click()}>Import JSON</button>
      </div>
      <p class="hint">The export contains the documents, but not the contents of assets.</p>
      <input bind:this={importInput} type="file" accept="application/json,.json" hidden onchange={importJson} />
      {#if error}<p class="error">{error}</p>{/if}
    </fieldset>

    <fieldset>
      <legend>About</legend>
      <p class="hint">
        edo-tex-editor · © 2026 Benjamin Benno Falkner · MIT License ·
        <a href="https://falkner.xyz" target="_blank" rel="noopener">falkner.xyz</a>
      </p>
      <div class="actions left">
        <a class="secondary" href="mailto:contact@falkner.xyz?subject=edo-tex-editor">Contact</a>
      </div>
    </fieldset>

    <div class="actions">
      <button class="primary">Done</button>
    </div>
  </form>
</dialog>
