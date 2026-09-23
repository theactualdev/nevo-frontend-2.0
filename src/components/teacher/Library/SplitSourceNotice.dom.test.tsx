import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SplitSourceNotice, splitBySource } from "./SplitSourceNotice";
import type { LessonSegment } from "@/lib/api/lessons";

/**
 * S-A 18: a lesson that is entirely the teacher's own document, cut up.
 *
 * A Zero-Tag rejection does not FAIL a parse. The run completes, having fallen
 * back to splitting the source, so the lesson arrives looking like any other
 * and the teacher reviews split source text believing it is Nevo's reading.
 * Nothing on any screen said so.
 *
 * THE SIGNAL IS NOT THE ONE THE TICKET NAMES, and that matters for anyone
 * re-checking this. `fallbackSegmentCount` is on `ParseRunResponse` and is
 * genuinely unread - but the single-lesson upload stopped polling parse runs
 * when it moved to the staged pipeline, so reading it there would fix nothing
 * for the path that needs it. `deterministic_parse_used` is the same fact per
 * segment, on the lesson, from both pipelines.
 */

const seg = (reasons: string[] = []): LessonSegment =>
  ({
    id: Math.random().toString(36).slice(2),
    segmentKey: "k",
    sequenceOrder: 1,
    contentType: "explanatory_text",
    title: "A section",
    body: "",
    availableModalities: ["text"],
    comprehensionCheckpoints: [],
    needsReview: reasons.length > 0,
    reviewReasons: reasons,
    approved: false,
    approvedAt: null,
  }) as unknown as LessonSegment;

const FALLBACK = () => seg(["deterministic_parse_used"]);
const BUILT = () => seg([]);

describe("reading the lesson for it", () => {
  it("counts the sections Nevo split rather than read", () => {
    expect(splitBySource([FALLBACK(), BUILT(), FALLBACK()]).count).toBe(2);
  });

  it("calls it whole only when there is no built section at all", () => {
    expect(splitBySource([FALLBACK(), FALLBACK()]).whole).toBe(true);
    expect(splitBySource([FALLBACK(), BUILT()]).whole).toBe(false);
  });

  it("does not announce it over a lesson with nothing in it", () => {
    // `0 === 0` is true and means nothing. An empty lesson is not a lesson
    // made of fallback.
    expect(splitBySource([]).whole).toBe(false);
  });

  it("is not fooled by a section flagged for some other reason", () => {
    expect(splitBySource([seg(["audio_generation_failed"])]).whole).toBe(false);
  });
});

describe("a payload that should not exist", () => {
  it("says nothing rather than taking the screen down", () => {
    /*
     * `reviewReasons` is REQUIRED on the contract, so a segment without one
     * is not spec-legal - and an `UploadResult` fixture had exactly that,
     * which is how this was found. The screen it sits on is the one a
     * teacher lands on straight after an upload; crashing it to say
     * something advisory would cost them the lesson they just made.
     */
    const malformed = { ...BUILT(), reviewReasons: undefined } as unknown as LessonSegment;

    expect(() => splitBySource([malformed])).not.toThrow();
    expect(splitBySource([malformed]).count).toBe(0);
  });
});

describe("what the teacher is told", () => {
  it("says what the lesson IS when none of it was built", () => {
    render(<SplitSourceNotice segments={[FALLBACK(), FALLBACK()]} />);

    expect(
      screen.getByText(/your document, split into sections/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/text from the file you uploaded/i),
    ).toBeInTheDocument();
  });

  it("stays quiet when one section in a built lesson fell back", () => {
    /*
     * That section already explains itself on its own card, through
     * `REVIEW_REASON_COPY.deterministic_parse_used`. Repeating it at the top
     * of the lesson would be noise, and the case this exists for - there is
     * no Nevo version of anything - would lose its force by being said about
     * lessons where it is not true.
     */
    render(<SplitSourceNotice segments={[FALLBACK(), BUILT(), BUILT()]} />);

    expect(
      screen.queryByText(/your document, split into sections/i),
    ).not.toBeInTheDocument();
  });

  it("stays quiet on an ordinary lesson", () => {
    render(<SplitSourceNotice segments={[BUILT(), BUILT()]} />);

    expect(screen.queryByText(/split into sections/i)).not.toBeInTheDocument();
  });

  it("does not claim the lesson is broken", () => {
    // It exists, it is assignable, and it may be perfectly usable. This is
    // not the parse-failed state and must not read like it.
    render(<SplitSourceNotice segments={[FALLBACK()]} />);

    expect(screen.queryByText(/couldn’t read|failed|error/i)).not.toBeInTheDocument();
    expect(screen.getByText(/still work for a class/i)).toBeInTheDocument();
  });
});
