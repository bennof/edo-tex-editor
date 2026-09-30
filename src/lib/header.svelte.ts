import type { Snippet } from 'svelte';

// Pages can put a title and actions into the layout's header.
// With `rename`, clicking the title makes it editable.
export const header: {
  title: string;
  actions: Snippet | null;
  rename: ((name: string) => void) | null;
} = $state({ title: '', actions: null, rename: null });
