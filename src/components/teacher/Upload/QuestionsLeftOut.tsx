import { cn } from "@/lib/utils";

/**
 * THE QUESTIONS NEVO LEFT OUT, said where a teacher is looking (Hub, 8 Nov).
 *
 * Since Teslim's parse fix, a question Nevo cannot turn into something a child
 * can answer and have marked is LEFT OUT of the lesson, and the parse says so
 * in a `question_unusable` review note: the server's own sentence
 * (`message`) and the prompts it dropped (`questions`). No screen read
 * `reviewNotes`, so the fix made lessons quietly shorter - which is exactly
 * what the note exists to prevent.
 *
 * THE SERVER'S WORDS, NOT OURS (Lydia's standing rule). One line per note,
 * as sent, with its questions listed under it as sent. Nothing is counted,
 * reworded or summarised here.
 *
 * ONLY THE TEACHER'S NOTES: `question_unusable`, and since 9 Nov
 * `source_read_by_backup_reader` (backend bdc6bed: the file was read with the
 * plain backup reader, so check the sections against the original), said
 * first, in its `message` alone. The other codes (`ai_parse_fallback`,
 * `page_text_missing`, `depth_variants_*`, `audio_generation_failed`, ...) are
 * technical notes for us, not for a teacher, and stay off the page. Faint
 * pages already have their own notice from `failedPages`.
 *
 * A LIST NEVER STANDS WITH NOTHING ABOVE IT (Lydia, 9 Nov, item 21). A note
 * that arrives with no sentence still lists its questions - leaving them out
 * would be the silence this exists to end - under Lydia's line, "These questions
 * were left out of the lesson.", which claims nothing about why.
 */

/** Lydia's line (9 Nov) above a list whose note came with no sentence. */
export const QUESTIONS_LEFT_OUT = "These questions were left out of the lesson.";

export interface QuestionsLeftOutNote {
  /** The server's sentence, as sent. Null only if it sent none. */
  message: string | null;
  /** The dropped questions' prompts (or the server's label for one), as sent. */
  questions: string[];
}

/**
 * The backup-reader notes' own sentences, word for word (Hub, 9 Nov). Only
 * the `message`: nothing else on the note is for a teacher. One with no
 * sentence says nothing - there is no line of ours for it.
 */
export function readerNotes(notes: readonly unknown[] | null | undefined): string[] {
  if (!Array.isArray(notes)) return [];
  const out: string[] = [];
  for (const note of notes) {
    if (!note || typeof note !== "object") continue;
    const n = note as Record<string, unknown>;
    if (n.code !== "source_read_by_backup_reader") continue;
    if (typeof n.message === "string" && n.message.trim()) out.push(n.message.trim());
  }
  return [...new Set(out)];
}

/** The `question_unusable` notes in a parse's `reviewNotes`, and nothing else. */
export function questionsLeftOut(
  notes: readonly unknown[] | null | undefined,
): QuestionsLeftOutNote[] {
  if (!Array.isArray(notes)) return [];
  const out: QuestionsLeftOutNote[] = [];
  for (const note of notes) {
    if (!note || typeof note !== "object") continue;
    const n = note as Record<string, unknown>;
    if (n.code !== "question_unusable") continue;
    const message = typeof n.message === "string" && n.message.trim() ? n.message.trim() : null;
    const questions = Array.isArray(n.questions)
      ? n.questions.filter((q): q is string => typeof q === "string" && q.trim() !== "").map((q) => q.trim())
      : [];
    if (message === null && questions.length === 0) continue;
    out.push({ message, questions });
  }
  return out;
}

export function QuestionsLeftOut({
  notes,
  className,
}: {
  notes: readonly unknown[] | null | undefined;
  className?: string;
}) {
  const left = questionsLeftOut(notes);
  const reader = readerNotes(notes);
  if (left.length === 0 && reader.length === 0) return null;
  return (
    <div className={cn("flex w-full flex-col gap-3", className)}>
      {/* How the file was read comes first: it bears on everything below. */}
      {reader.map((message) => (
        <p
          key={message}
          className="w-full rounded-[12px] border-l-[3px] border-nevo-violet bg-nevo-violet/16 px-[18px] py-4 text-[14.5px] leading-[1.55] text-nevo-near-black/82"
        >
          {message}
        </p>
      ))}
      {left.map((note, i) => (
        <div
          key={i}
          className="w-full rounded-[12px] border-l-[3px] border-nevo-violet bg-nevo-violet/16 px-[18px] py-4"
        >
          <p className="text-[14.5px] leading-[1.55] text-nevo-near-black/82">
            {note.message ?? QUESTIONS_LEFT_OUT}
          </p>
          {note.questions.length > 0 && (
            <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-[14px] leading-[1.5] text-nevo-near-black/72">
              {note.questions.map((q, j) => (
                <li key={j}>{q}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
