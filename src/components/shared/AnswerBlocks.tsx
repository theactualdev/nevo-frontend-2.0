import type { ReactNode } from "react";
import type { AnswerBlock } from "@/lib/api/askNevo";
import { cn } from "@/lib/utils";

/**
 * AN ASK NEVO ANSWER, DRAWN BY ITS PIECES (Teslim, 25 Oct; Lydia's 25 Oct
 * note 5). The answer string is Markdown now - `**bold**`, "- " bullets,
 * numbered steps - and printed as it was, a child saw the asterisks.
 *
 * The server already parses it into `blocks` (`ask_nevo/formatting.py`), so
 * nothing is parsed here: a heading, a paragraph, a list of bullets or of
 * steps, each drawn as what it is. Everything goes through React as text -
 * NEVER `dangerouslySetInnerHTML` - so whatever an answer contains, it is
 * shown, never run.
 *
 * Emphasis inside a block: the server strips the markers from blocks today,
 * so there is none. If it ever keeps them, a PAIRED `**…**`, `*…*` or `` `…` ``
 * is drawn as bold, italic or code rather than as its symbols - see `inline`.
 *
 * NO BLOCKS - an older answer, or an asker's own message - IS THE TEXT, in
 * its paragraphs, through the same `inline`, so a stored Markdown answer
 * shows no asterisks either.
 *
 * Shared, so the teacher drawer can draw its answers the same way.
 */
export function AnswerBlocks({
  blocks,
  text,
  className,
}: {
  blocks?: AnswerBlock[] | null;
  /** What to draw when there are no blocks. */
  text: string;
  className?: string;
}) {
  const drawn = (blocks ?? []).flatMap((block, i) => {
    const node = blockNode(block, i);
    return node ? [node] : [];
  });
  if (drawn.length > 0) {
    return <div className={cn("flex flex-col gap-2", className)}>{drawn}</div>;
  }
  const paragraphs = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paragraphs.length === 0) return null;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {paragraphs.map((p, i) => (
        <p key={i} className="whitespace-pre-line">
          {inline(p)}
        </p>
      ))}
    </div>
  );
}

/** One block as what it is, or nothing for one with nothing in it. */
function blockNode(block: AnswerBlock, key: number): ReactNode {
  const items = (block.items ?? []).map((item) => item.trim()).filter(Boolean);
  const words = block.text?.trim() ?? "";
  switch (block.type) {
    case "heading":
      return words ? (
        <p key={key} data-block="heading" className="font-semibold">
          {inline(words)}
        </p>
      ) : null;
    case "bullets":
      return items.length > 0 ? (
        <ul key={key} className="flex list-disc flex-col gap-1 pl-5">
          {items.map((item, i) => (
            <li key={i}>{inline(item)}</li>
          ))}
        </ul>
      ) : null;
    case "steps":
      return items.length > 0 ? (
        <ol key={key} className="flex list-decimal flex-col gap-1 pl-5">
          {items.map((item, i) => (
            <li key={i}>{inline(item)}</li>
          ))}
        </ol>
      ) : null;
    default:
      // A paragraph - and any type this client does not know yet, whose
      // `text` is still correct to show (the contract's own promise).
      return words ? <p key={key}>{inline(words)}</p> : null;
  }
}

/**
 * A PAIRED emphasis or code mark, hugging its words as Markdown requires: a
 * `*` with a space inside it is not emphasis. So "5 * 3 * 2" - a child's sum -
 * stays a sum, and is never set in italics.
 */
const PAIRED =
  /(\*\*(?!\s)[^*\n]+?(?<!\s)\*\*|`[^`\n]+`|(?<![*\w])\*(?!\s)[^*\n]+?(?<!\s)\*(?![*\w]))/;

/**
 * Words with any PAIRED marks drawn as bold, italic or code; everything else
 * exactly as it was, a lone `*` included.
 */
export function inline(words: string): ReactNode[] {
  // Split on the one capturing group: the odd pieces are the marks found.
  return words.split(PAIRED).flatMap((part, i): ReactNode[] => {
    if (!part) return [];
    if (i % 2 === 0) return [part];
    if (part.startsWith("**")) {
      return [<strong key={i}>{part.slice(2, -2)}</strong>];
    }
    if (part.startsWith("`")) {
      return [
        <code
          key={i}
          className="rounded-[4px] bg-nevo-near-black/8 px-1 font-mono text-[0.92em]"
        >
          {part.slice(1, -1)}
        </code>,
      ];
    }
    return [<em key={i}>{part.slice(1, -1)}</em>];
  });
}
