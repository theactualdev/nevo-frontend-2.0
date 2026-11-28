/**
 * Hand a fetched file to the browser to save, as the invoice PDF does. Shared
 * by the roster importer's templates and Add several's class template, so the
 * two downloads cannot drift.
 */
export function saveFile(blob: Blob, name: string) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}
