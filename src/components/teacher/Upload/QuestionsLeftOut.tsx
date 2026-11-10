import { cn } from "@/lib/utils";
import { pageList } from "./pageList";

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
 * `lesson_text_blocked_by_safety` (backend 06396db: a safety check held back
 * the lesson Nevo wrote from one part of the file, so that part is plain text
 * with no questions), said first, in Lydia's words with its pages beside it;
 * `source_read_by_backup_reader` (bdc6bed, and since 06396db only when a page
 * gave up no text), next, in Lydia's words (10 Nov: `TEXT_HELD_BACK_LINE`,
 * `BACKUP_READER_LINE`); and `visual_blocked_by_safety` (one per
 * segment: the safety check refused that segment's picture; its text is
 * unchanged), its `message` alone under the segment's name as the screen
 * names it. Never its `secondsSpent`, nor the `categories` and `phase` it
 * carried until backend 86f8e10 moved them to the log - never which rule fired
 * or what triggered it (Lydia, item 6). Shown here until the
 * lesson review can read it (asked of Teslim, 9 Nov). The other codes (`ai_parse_fallback`,
 * `page_text_missing`, `depth_variants_*`, `audio_generation_failed`, ...) are
 * technical notes for us, not for a teacher, and stay off the page. Faint
 * pages already have their own notice from `failedPages`.
 *
 * A LIST NEVER STANDS WITH NOTHING ABOVE IT (Lydia, 9 Nov, item 21). A note
 * that arrives with no sentence still lists its questions - leaving them out
 * would be the silence this exists to end - under Lydia's line, "These questions
 * were left out of the lesson.", which claims nothing about why.
 */

/**
 * LYDIA'S WORDS FOR TWO OF THE SERVER'S NOTES (10 Nov, items 1 and 3), said
 * in place of the note's `message`. Neither invites a teacher to report
 * anything: "No copy ships inviting a teacher to report anything until there
 * is somewhere to do it." The server's sentences both did.
 */
export const TEXT_HELD_BACK_LINE =
  "A safety check held back the lesson Nevo wrote from this part of your file, so it came through as plain text with no questions. Your file passed its own check, so your material is not the problem.";
export const BACKUP_READER_LINE =
  "Nevo had to read this file with a plainer reader, and some pages gave up no text at all. Columns, tables and handwriting may have come through jumbled or be missing entirely. Check the sections against your original, and if the lesson looks thin, upload the text itself.";

/**
 * THE REFUSED-PICTURE NOTE IS NOT SAID YET - the one switch (Hub, 11 Nov).
 * The server's sentence ends by inviting the teacher to "tell us the lesson
 * and this section", which Lydia's 10 Nov rule forbids until there is
 * somewhere to tell us, and her own words for the note are in an addendum not
 * yet received. It was never shown on main, so saying nothing keeps today's
 * state. Turn it back on here, with her words in place of the `message`.
 */
export const SAY_REFUSED_PICTURES = false;

/** Lydia's line (9 Nov) above a list whose note came with no sentence. */
export const QUESTIONS_LEFT_OUT = "These questions were left out of the lesson.";

export interface QuestionsLeftOutNote {
  /** The server's sentence, as sent. Null only if it sent none. */
  message: string | null;
  /** The dropped questions' prompts (or the server's label for one), as sent. */
  questions: string[];
}

/**
 * Whether the backup reader struggled with this file: one line, Lydia's
 * (`BACKUP_READER_LINE`), however many notes say so. The note's own
 * `message` and `pageNumbers` are not read.
 */
export function readerNotes(notes: readonly unknown[] | null | undefined): string[] {
  if (!Array.isArray(notes)) return [];
  const said = notes.some(
    (note) =>
      !!note && typeof note === "object" && (note as Record<string, unknown>).code === "source_read_by_backup_reader",
  );
  return said ? [BACKUP_READER_LINE] : [];
}

export interface TextHeldBack {
  /** "Pages 3 and 4", "Page 7" - the server's pages - or null where it sent none. */
  pages: string | null;
}

/**
 * The parts of the file whose lesson a safety check held back (backend
 * 06396db), each said in Lydia's line (`TEXT_HELD_BACK_LINE`) with its pages
 * beside it where the note has them (10 Nov, item 2: "this part of your file"
 * asks a teacher to search for what we already know). One note comes per
 * part; the same pages are said once, and parts with no pages share one line.
 * Only `pageNumbers` is read: never the `message`, `chunkNumber` or
 * `textRetained`, and never which rule fired or what matched (Lydia, item 6).
 */
export function textHeldBack(notes: readonly unknown[] | null | undefined): TextHeldBack[] {
  if (!Array.isArray(notes)) return [];
  const out: TextHeldBack[] = [];
  const seen = new Set<string>();
  for (const note of notes) {
    if (!note || typeof note !== "object") continue;
    const n = note as Record<string, unknown>;
    if (n.code !== "lesson_text_blocked_by_safety") continue;
    const pages = Array.isArray(n.pageNumbers)
      ? n.pageNumbers.filter((p): p is number => Number.isInteger(p))
      : [];
    const label = pages.length > 0 ? `${pages.length > 1 ? "Pages" : "Page"} ${pageList(pages)}` : null;
    const key = label ?? "";
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ pages: label });
  }
  return out;
}

export interface PictureRefused {
  /** The segment's key, as the note names it (`segment`). */
  segment: string;
  /** The server's sentence, word for word. */
  message: string;
}

/**
 * The refused-picture notes: which segment, and the server's sentence. Only
 * those two fields are read, so nothing else on the note can reach a screen.
 */
export function picturesRefused(notes: readonly unknown[] | null | undefined): PictureRefused[] {
  if (!Array.isArray(notes)) return [];
  const out: PictureRefused[] = [];
  const seen = new Set<string>();
  for (const note of notes) {
    if (!note || typeof note !== "object") continue;
    const n = note as Record<string, unknown>;
    if (n.code !== "visual_blocked_by_safety") continue;
    if (typeof n.segment !== "string" || !n.segment.trim()) continue;
    if (typeof n.message !== "string" || !n.message.trim()) continue;
    const key = `${n.segment}\u0000${n.message.trim()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ segment: n.segment, message: n.message.trim() });
  }
  return out;
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
  segmentName,
  refusedPictures = SAY_REFUSED_PICTURES,
}: {
  notes: readonly unknown[] | null | undefined;
  className?: string;
  /**
   * A segment's name as this screen names it - its title, else "Segment N"
   * by its place - from the key a note gives. Null where the screen has no
   * such segment: the note is still said, under no name.
   */
  segmentName?: (segmentKey: string) => string | null;
  /** Whether a refused picture is said; `SAY_REFUSED_PICTURES` unless a test asks. */
  refusedPictures?: boolean;
}) {
  const left = questionsLeftOut(notes);
  const held = textHeldBack(notes);
  const reader = readerNotes(notes);
  const pictures = refusedPictures ? picturesRefused(notes) : [];
  if (left.length === 0 && held.length === 0 && reader.length === 0 && pictures.length === 0) {
    return null;
  }
  return (
    <div className={cn("flex w-full flex-col gap-3", className)}>
      {/* A part of the lesson that came through as plain text comes first:
          it is the biggest thing missing from what is below. */}
      {held.map((part) => (
        <div
          key={part.pages ?? "no pages"}
          className="w-full rounded-[12px] border-l-[3px] border-nevo-violet bg-nevo-violet/16 px-[18px] py-4"
        >
          {part.pages && (
            <span className="block text-[12.5px] font-semibold text-nevo-near-black/60">{part.pages}</span>
          )}
          <p className={cn("text-[14.5px] leading-[1.55] text-nevo-near-black/82", part.pages && "mt-1")}>
            {TEXT_HELD_BACK_LINE}
          </p>
        </div>
      ))}
      {/* Then how the file was read: it bears on everything below. */}
      {reader.map((message) => (
        <p
          key={message}
          className="w-full rounded-[12px] border-l-[3px] border-nevo-violet bg-nevo-violet/16 px-[18px] py-4 text-[14.5px] leading-[1.55] text-nevo-near-black/82"
        >
          {message}
        </p>
      ))}
      {pictures.map((p) => {
        const name = segmentName?.(p.segment) ?? null;
        return (
          <div
            key={`${p.segment}:${p.message}`}
            className="w-full rounded-[12px] border-l-[3px] border-nevo-violet bg-nevo-violet/16 px-[18px] py-4"
          >
            {name && (
              <span className="block text-[12.5px] font-semibold text-nevo-near-black/60">{name}</span>
            )}
            <p className={cn("text-[14.5px] leading-[1.55] text-nevo-near-black/82", name && "mt-1")}>
              {p.message}
            </p>
          </div>
        );
      })}
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
