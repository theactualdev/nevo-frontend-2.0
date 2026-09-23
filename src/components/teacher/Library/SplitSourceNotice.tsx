import type { LessonSegment } from "@/lib/api/lessons";

/**
 * WHAT A TEACHER IS ACTUALLY REVIEWING, when Nevo did not write any of it.
 *
 * S-A 18. A Zero-Tag rejection does not FAIL a parse - the run completes,
 * having fallen back to splitting the source document into sections. So the
 * lesson arrives looking like every other lesson, the teacher reviews it
 * believing they are checking Nevo's reading, and what they are actually
 * checking is their own file cut into pieces. Nothing on any screen said so.
 *
 * WHERE THE SIGNAL LIVES, and why it is not the one the ticket names.
 * `fallbackSegmentCount` on `ParseRunResponse` is the run-level count, and it
 * is genuinely unread - but the single-lesson upload no longer polls a parse
 * run at all since it moved to the staged pipeline, so reading it there would
 * fix nothing. The same fact is on the LESSON, per segment:
 * `deterministic_parse_used` in `reviewReasons`, which both pipelines produce
 * and every screen that shows a lesson already has. That is what this reads,
 * so it works on the upload outcome, the lesson page, and after a regenerate,
 * without anything being plumbed through three components.
 *
 * WHOLE-LESSON ONLY, DELIBERATELY. A single fallback section already explains
 * itself on its own card - `REVIEW_REASON_COPY.deterministic_parse_used` says
 * it was split by a simpler rule. Repeating that at the top of a lesson where
 * one section in six is affected would be noise. What has no voice at all is
 * the case the ticket is about: `fallbackSegmentCount === segmentCount`, where
 * there is no Nevo version of anything and the review means something
 * different.
 *
 * NOT THE PARSE-FAILED STATE. That one is an unreadable file and the lesson
 * does not exist. This lesson exists, is assignable, and may be perfectly
 * usable - it is just not what a teacher would assume it is.
 */

/** Segments Nevo split by rule rather than read. */
export function splitBySource(segments: LessonSegment[]): {
  count: number;
  /** Every section in the lesson, so there is no generated version at all. */
  whole: boolean;
} {
  const count = segments.filter((s) =>
    // `reviewReasons` is REQUIRED on the contract, so `?? []` is defending
    // against a payload that is not spec-legal rather than against a normal
    // absence. It is here because this notice is advisory and the screen it
    // sits on is the one a teacher lands on straight after an upload -
    // taking that screen down over a malformed array would cost them the
    // lesson they just made, to say something they could live without.
    (s.reviewReasons ?? []).includes("deterministic_parse_used"),
  ).length;
  return {
    count,
    // An empty lesson is not a lesson made of fallback - `0 === 0` would
    // otherwise announce this over a lesson with nothing in it.
    whole: segments.length > 0 && count === segments.length,
  };
}

export function SplitSourceNotice({ segments }: { segments: LessonSegment[] }) {
  if (!splitBySource(segments).whole) return null;

  return (
    <div className="mt-5 flex max-w-[660px] items-start gap-3.5 rounded-[12px] border-l-[3px] border-nevo-violet bg-nevo-violet/14 px-[18px] py-4">
      <span className="mt-px shrink-0 text-nevo-navy" aria-hidden>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
          <path d="M14 3v6h6M8 14h8M8 18h5" />
        </svg>
      </span>
      <p className="text-[14.5px] leading-[1.55] text-nevo-near-black/82">
        <strong className="font-semibold text-nevo-near-black">
          This lesson is your document, split into sections.
        </strong>{" "}
        {/* Says what it IS, not what went wrong. A teacher cannot act on
            "generation was rejected", and the thing they need to know is what
            they are looking at - because the review means something different
            when the words are their own. */}
        Nevo couldn&rsquo;t build its own version of this one, so every section
        below is text from the file you uploaded rather than Nevo&rsquo;s
        reading of it. It will still work for a class; the sections just
        won&rsquo;t adapt the way a built lesson does.
      </p>
    </div>
  );
}
