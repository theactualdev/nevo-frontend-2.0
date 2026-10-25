import type { AnswerBlock } from "@/lib/api/askNevo";

/**
 * AN ASK NEVO ANSWER'S MARKDOWN, READ INTO THE BLOCKS `AnswerBlocks` DRAWS
 * (Teslim 09a29d8, 25 Oct). His ask: render it by block, and "keep paragraph
 * spacing, bold, inline code and lists".
 *
 * WHY NOT THE SERVER'S `blocks` STRAIGHT. They are the same structure with
 * the emphasis stripped - `structure_answer` keeps `**bold**`, `*italic*` and
 * `` `code` `` only in the Markdown `answer` (`render_answer`). So this reads
 * the answer itself, into the same shape, with the marks left in the words,
 * and `AnswerBlocks` draws a paired mark as bold, italic or code through its
 * own `inline`. The server's blocks are the fallback, then `plainText`.
 *
 * Nothing here makes markup: it only splits lines into headings, paragraphs,
 * bullets and steps, using the server's own patterns (`formatting.py`), so a
 * line means here what it meant when the answer was written. `AnswerBlocks`
 * puts every character on the page as React text.
 */

const BULLET = /^\s*[-*•·]\s+(.+)$/;
const NUMBERED = /^\s*\d{1,2}[.)]\s+(.+)$/;
const HASH_HEADING = /^\s*#{1,6}\s+(.+?)\s*#*$/;
const BOLD_HEADING = /^\s*\*\*([^*\n]+)\*\*\s*$/;

/** The answer's Markdown as blocks, marks kept. Empty for an empty answer. */
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

/**
 * What the teacher drawer draws: the Markdown answer, else the server's
 * blocks, else the plain text. `plainText` puts one block on each line, so a
 * line that is not a list item is kept as its own paragraph.
 */
export function answerBlocksFor({
  answer,
  blocks,
  plainText,
}: {
  answer?: string | null;
  blocks?: AnswerBlock[] | null;
  plainText?: string | null;
}): AnswerBlock[] {
  const fromAnswer = blocksFromMarkdown(answer);
  if (fromAnswer.length > 0) return fromAnswer;
  if (blocks && blocks.length > 0) return blocks;
  return blocksFromMarkdown(
    (plainText ?? "")
      .split("\n")
      .map((line) => (BULLET.test(line) || NUMBERED.test(line) ? line : `\n${line}\n`))
      .join("\n"),
  );
}
