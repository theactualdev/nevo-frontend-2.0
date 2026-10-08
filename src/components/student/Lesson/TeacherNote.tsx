import { cn } from "@/lib/utils";
import { READING_BODY, READING_INK } from "./readingSupport";

/**
 * What a teacher wrote to this child when they set this lesson.
 *
 * **RULED 23 SEP, after being open since 18 Sep.** Design: *"It reaches the
 * child. It appears on the lesson screen, attributed to the teacher by name,
 * drawn so it is unmistakably a person's words rather than Nevo's. It never
 * enters anything Nevo generates about that child, and it is never rewritten,
 * summarised or adapted."*
 *
 * It came close to being closed the way `highlights` was - "do not build a
 * surface for it" - and the difference is the whole reason it went the other
 * way: a generated highlight is Nevo's opinion about a child, while this is a
 * person who deliberately typed these words TO them. Withholding it is not
 * neutral.
 *
 * ## The four constraints, and where each one lives
 *
 * **Never rewritten, summarised or adapted.** This is why the note renders
 * HERE and not through `TextSegment`. Everything in that component is subject
 * to the reading density - Simplify switches to a shorter authored body,
 * Slower chunks it into parts - and the accommodations reshape it further.
 * A teacher's sentence is not a variant of anything, so it never enters that
 * path at all. It is `whitespace-pre-line` for the same reason: the line
 * breaks they typed are theirs.
 *
 * **Unmistakably a person's words rather than Nevo's.** Everything Nevo says
 * to a child is upright, unquoted and unattributed, and sits in the reading
 * column. This is quoted, italic, on its own card, and signed - four signals
 * that somebody else is talking.
 *
 * It is deliberately NOT a new typeface. The tempting move is a serif, and
 * this codebase defines no serif family - `--font-sans`, `--font-mono`,
 * `--font-brand` and `--font-heading` are the whole set - so `font-serif`
 * would fall through to whatever the browser has and read as a mistake rather
 * than as a voice.
 *
 * **Never enters anything Nevo generates about that child.** It is rendered
 * and nothing else: not sent to the engine, not put in the Ask Nevo context,
 * not stored. It arrives on the child's own dashboard read and stops here.
 *
 * **Attributed by name, as of 24 Sep.** `assignedByName` is the teacher who
 * SET the assignment - deliberately not `lesson.createdByName`, which is
 * whoever authored the lesson and is a different person whenever somebody
 * assigns a colleague's.
 *
 * **AND IT STILL SIGNS "Your teacher" WHEN THE NAME IS NULL.** Backend returns
 * null rather than a placeholder for a deleted or unnamed account, on the
 * principle this component was built around: naming the wrong teacher is worse
 * than naming none. So an unresolvable author is a note that stays unsigned,
 * never a note that is withheld - the words are the thing a teacher typed to
 * this child, and they reach them either way.
 */
export function TeacherNote({
  note,
  author = null,
  reading = false,
  className,
}: {
  note: string;
  /** The teacher who set the assignment. Null is unsigned, never an error. */
  author?: string | null;
  /**
   * The reading accommodation's TYPOGRAPHIC half (D30): "the teacher's note
   * takes typographic support only". Size and spacing change how the words
   * are presented, never which words they are.
   */
  reading?: boolean;
  className?: string;
}) {
  return (
    <figure
      className={cn(
        // Quoted, italic, carded and signed: four signals that this is not the
        // product talking. The violet edge marks the block as addressed to
        // this child rather than as part of the lesson.
        "mb-6 rounded-[10px] border-l-[3px] border-nevo-violet/60 bg-nevo-cream-elevated px-4 py-3.5",
        className,
      )}
    >
      <blockquote
        className={cn(
          "whitespace-pre-line italic",
          reading
            ? [READING_BODY, READING_INK]
            : "text-[15px] leading-[1.6] text-nevo-near-black",
        )}
      >
        {note}
      </blockquote>
      {/*
        NOT "Nevo", and never a guessed name. A resolvable teacher is named;
        anyone else is "Your teacher", which is the most this can truthfully
        say and still does the job the attribution exists for - telling a child
        that a person wrote this rather than a system.
      */}
      <figcaption className="mt-2 text-[12.5px] text-nevo-near-black/55">
        — {author ?? "Your teacher"}
      </figcaption>
    </figure>
  );
}
