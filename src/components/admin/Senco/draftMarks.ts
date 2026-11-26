/**
 * D08's B / I on the IEP draft (backlog 98). The draft is the server's own
 * markdown - its prompt asks for "polished markdown" - so bold and italic are
 * markdown's: `**words**` and `*words*`, around what the reviewer selected.
 * Nothing here reads or rewrites the wording itself.
 */
export type Mark = "bold" | "italic";

const MARKER: Record<Mark, string> = { bold: "**", italic: "*" };

export function applyMark(
  text: string,
  start: number,
  end: number,
  mark: Mark,
): { text: string; start: number; end: number } {
  const m = MARKER[mark];
  const from = Math.min(start, end);
  const to = Math.max(start, end);
  const next = text.slice(0, from) + m + text.slice(from, to) + m + text.slice(to);
  return { text: next, start: from + m.length, end: to + m.length };
}
