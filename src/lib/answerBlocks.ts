/**
 * AN ASK NEVO ANSWER, AS THE BLOCKS IT IS MADE OF (Teslim 09a29d8, 25 Oct).
 *
 * Both drawers picked one string and printed it inside a single `<p>`, which
 * flattened every heading, list and paragraph break the answer had into one
 * run of text. Teslim's ask: "Render `answer` as SANITISED Markdown, or render
 * its blocks by type... Keep paragraph spacing, bold, inline code and lists.
 * NO `dangerouslySetInnerHTML` on the raw answer. `plainText` stays the
 * fallback."
 *
 * SANITISED BY CONSTRUCTION. This reads the one small Markdown the server
 * writes (`render_answer` in `ask_nevo/formatting.py`): paragraphs split by a
 * blank line, a heading as a line that is wholly `**bold**` or `# hashed`,
 * `- ` bullets, `1. ` steps, and `**bold**`, `*italic*` and `` `code` ``
 * inside a line. Nothing here produces markup. The renderer turns these blocks
 * into a fixed set of elements and every character of the answer reaches the
 * page as React text, so an answer carrying `<script>` or a `[link](url)`
 * shows those characters and does nothing.
 *
 * WHY `answer` BEFORE `blocks`. The server's `blocks` are the same structure,
 * but with the inline emphasis stripped - `structure_answer` keeps it only for
 * the Markdown - so rendering them would lose the bold and code Teslim asked
 * us to keep. They are the second choice, and `plainText` the last.
 */

export type AnswerSpan = {
  kind: "text" | "strong" | "em" | "code";
  text: string;
};

export type AnswerBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "bullets"; items: string[] }
  | { type: "steps"; items: string[] };

/** `AnswerBlockResponse`, as the contract sends it. */
export interface ServerAnswerBlock {
  type: string;
  text?: string;
  items?: string[];
  level?: number;
}

// The server's own patterns (formatting.py), so a line means here what it
// meant when the answer was written.
const BULLET = /^\s*[-*•·]\s+(.+)$/;
const NUMBERED = /^\s*\d{1,2}[.)]\s+(.+)$/;
const HASH_HEADING = /^\s*#{1,6}\s+(.+?)\s*#*$/;
const BOLD_HEADING = /^\s*\*\*([^*\n]+)\*\*\s*$/;
const INLINE = /\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|`([^`\n]+)`/g;

/** The answer's Markdown, as blocks. Empty for an empty answer. */
export function blocksFromMarkdown(markdown: string | null | undefined): AnswerBlock[] {
  const blocks: AnswerBlock[] = [];
  let paragraph: string[] = [];
  let items: string[] = [];
  let kind: "bullets" | "steps" | null = null;

  const flushParagraph = () => {
    const text = paragraph.join(" ").trim();
    if (text) blocks.push({ type: "paragraph", text });
    paragraph = [];
  };
  const flushItems = () => {
    if (kind && items.length > 0) blocks.push({ type: kind, items });
    items = [];
    kind = null;
  };
  const item = (k: "bullets" | "steps", text: string) => {
    flushParagraph();
    if (kind !== k) flushItems();
    kind = k;
    if (text.trim()) items.push(text.trim());
  };

  for (const line of (markdown ?? "").replace(/\r\n?/g, "\n").split("\n")) {
    if (!line.trim()) {
      flushItems();
      flushParagraph();
      continue;
    }
    const heading = HASH_HEADING.exec(line) ?? BOLD_HEADING.exec(line);
    if (heading) {
      flushItems();
      flushParagraph();
      blocks.push({ type: "heading", text: heading[1].trim() });
      continue;
    }
    const bullet = BULLET.exec(line);
    if (bullet) {
      item("bullets", bullet[1]);
      continue;
    }
    const step = NUMBERED.exec(line);
    if (step) {
      item("steps", step[1]);
      continue;
    }
    flushItems();
    paragraph.push(line.trim());
  }
  flushItems();
  flushParagraph();
  return blocks;
}

/** The contract's blocks, read defensively: an unknown type is a paragraph. */
export function blocksFromServer(
  server: ServerAnswerBlock[] | null | undefined,
): AnswerBlock[] {
  const blocks: AnswerBlock[] = [];
  for (const b of server ?? []) {
    const text = (b.text ?? "").trim();
    const items = (b.items ?? []).map((i) => i.trim()).filter(Boolean);
    if ((b.type === "bullets" || b.type === "steps") && items.length > 0) {
      blocks.push({ type: b.type, items });
    } else if (b.type === "heading" && text) {
      blocks.push({ type: "heading", text });
    } else if (text) {
      // The contract's own promise: "a renderer that only understands
      // PARAGRAPH can print every block's text and still be correct".
      blocks.push({ type: "paragraph", text });
    }
  }
  return blocks;
}

/**
 * What to draw: the Markdown answer, else the server's blocks, else the
 * plain text. `plainText` puts one block on each line, so each line that is
 * not a list item is kept as its own paragraph rather than run together.
 */
export function answerBlocks({
  answer,
  blocks,
  plainText,
}: {
  answer?: string | null;
  blocks?: ServerAnswerBlock[] | null;
  plainText?: string | null;
}): AnswerBlock[] {
  const fromAnswer = blocksFromMarkdown(answer);
  if (fromAnswer.length > 0) return fromAnswer;
  const fromServer = blocksFromServer(blocks);
  if (fromServer.length > 0) return fromServer;
  return blocksFromMarkdown(
    (plainText ?? "")
      .split("\n")
      .map((line) => (BULLET.test(line) || NUMBERED.test(line) ? line : `\n${line}\n`))
      .join("\n"),
  );
}

/** One line of an answer, split into its plain and emphasised runs. */
export function spansOf(text: string): AnswerSpan[] {
  const spans: AnswerSpan[] = [];
  let cursor = 0;
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0;
    if (at > cursor) spans.push({ kind: "text", text: text.slice(cursor, at) });
    if (m[1] !== undefined) spans.push({ kind: "strong", text: m[1] });
    else if (m[2] !== undefined) spans.push({ kind: "em", text: m[2] });
    else spans.push({ kind: "code", text: m[3] });
    cursor = at + m[0].length;
  }
  if (cursor < text.length) spans.push({ kind: "text", text: text.slice(cursor) });
  return spans;
}
