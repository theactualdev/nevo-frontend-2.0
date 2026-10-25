import { Fragment } from "react";
import {
  answerBlocks,
  spansOf,
  type ServerAnswerBlock,
} from "@/lib/answerBlocks";
import { cn } from "@/lib/utils";

/**
 * AN ASK NEVO ANSWER, WITH ITS SHAPE KEPT (Teslim 09a29d8, 25 Oct). Shared by
 * the teacher's drawer and the student's, live replies and reopened history
 * alike, so the two cannot drift.
 *
 * It renders blocks by type - paragraph, heading, bullets, steps - with bold,
 * italic and inline code inside a line, and nothing else. Every character
 * reaches the page as React text (see `lib/answerBlocks`): no
 * `dangerouslySetInnerHTML`, no links, no markup from the answer.
 *
 * TYPE COMES FROM THE CALLER. The size, colour and line height are the
 * bubble's, passed in `className`, so each drawer keeps its own frame's type;
 * this draws only the spacing between blocks and the list markers. No frame
 * draws a structured answer, so those two are ours.
 */
export function NevoAnswer({
  answer,
  blocks,
  plainText,
  className,
}: {
  /** The server's Markdown answer, or a past message's stored `text`. */
  answer?: string | null;
  /** The contract's blocks, the fallback when the Markdown is empty. */
  blocks?: ServerAnswerBlock[] | null;
  /** The last resort, one block per line. */
  plainText?: string | null;
  className?: string;
}) {
  const parsed = answerBlocks({ answer, blocks, plainText });
  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      {parsed.map((b, i) => {
        if (b.type === "bullets" || b.type === "steps") {
          const items = b.items.map((item, j) => (
            <li key={j} className="pl-0.5">
              <Spans text={item} />
            </li>
          ));
          return b.type === "bullets" ? (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {items}
            </ul>
          ) : (
            <ol key={i} className="list-decimal space-y-1 pl-5">
              {items}
            </ol>
          );
        }
        return (
          <p key={i} className={b.type === "heading" ? "font-semibold" : undefined}>
            <Spans text={b.text} />
          </p>
        );
      })}
    </div>
  );
}

function Spans({ text }: { text: string }) {
  return (
    <>
      {spansOf(text).map((s, i) => (
        <Fragment key={i}>
          {s.kind === "strong" ? (
            <strong className="font-semibold">{s.text}</strong>
          ) : s.kind === "em" ? (
            <em>{s.text}</em>
          ) : s.kind === "code" ? (
            <code className="rounded-[4px] bg-nevo-navy/8 px-1 py-px font-mono text-[0.9em]">
              {s.text}
            </code>
          ) : (
            s.text
          )}
        </Fragment>
      ))}
    </>
  );
}
