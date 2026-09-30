// Save a blob as a file via a temporary link
export function download(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Make a title usable as a file name (keeps letters, digits, space, _ . -). */
export const fileName = (title: string, ext: string) => `${title.replace(/[^\p{L}\p{N}_ .-]+/gu, '_')}.${ext}`;

