import { cn } from "@/lib/utils";

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
 * **Attributed by name - and THE NAME DOES NOT EXIST ON THE WIRE.**
 * `AssignmentResponse` carries `note` and nothing that says who wrote it; a
 * search of all 406 schemas finds no `teacherName`, `assignedBy` or
 * equivalent. `lesson.createdByName` is the lesson's AUTHOR, which is a
 * different person whenever a teacher assigns someone else's lesson, and
 * `/classes/{id}/teachers` returns a LIST rather than an author. Putting one
 * teacher's name on another teacher's words is worse than not naming them, so
 * this ships attributed-but-unnamed and the field is a backend ask. See
 * `docs/BUILD_STATUS.md`.
 */
export function TeacherNote({
  note,
  className,
}: {
  note: string;
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
      <blockquote className="text-[15px] leading-[1.6] whitespace-pre-line text-nevo-near-black italic">
        {note}
      </blockquote>
      {/*
        NOT "Nevo" and NOT a guessed name. "Your teacher" is the most this can
        truthfully say until the wire carries one - and it still does the job
        the attribution exists for, which is to tell a child a person wrote
        this rather than a system.
      */}
      <figcaption className="mt-2 text-[12.5px] text-nevo-near-black/55">
        — Your teacher
      </figcaption>
    </figure>
  );
}
