import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const { useLessonLibrary } = vi.hoisted(() => ({ useLessonLibrary: vi.fn() }));
vi.mock("@/hooks/useLessonLibrary", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useLessonLibrary")>();
  return { ...actual, useLessonLibrary };
});

import { LessonLibrary } from "./LessonLibrary";
import { __toCardForTest } from "@/hooks/useLessonLibrary";
import type { LessonSummary } from "@/lib/api/lessons";

/**
 * C06's subject pills, over real lessons.
 *
 * They used to render over fixtures only, on the recorded grounds that a live
 * lesson carries no subject. That was true, and it was true only because
 * neither upload wrapper ever sent the optional `subject` the endpoint has
 * always accepted. With the upload asking and the mapper carrying, the pills
 * are whatever the shelf says it is about.
 *
 * The mapper is tested separately below, because this screen mocks the hook -
 * so a field dropped in `toCard` would not show up in any of the tests above
 * it. That is the defect Home shipped once already.
 */

const card = (id: string, title: string, subject?: string) => ({
  id,
  title,
  status: "Ready" as const,
  kind: "normal" as const,
  needsReview: false,
  meta: "6 sections · PDF",
  footer: "Not yet assigned",
  subject,
});

const state = (cards: ReturnType<typeof card>[]) => ({
  cards,
  live: true,
  sample: false,
  loading: false,
  slow: false,
});

const pill = (name: string) => screen.queryByRole("button", { name });

beforeEach(() => {
  useLessonLibrary.mockReset();
});

describe("the subject pills", () => {
  it("are built from the subjects on the shelf", () => {
    useLessonLibrary.mockReturnValue(
      state([
        card("1", "Solving Linear Equations", "Mathematics"),
        card("2", "Things Fall Apart", "English"),
        card("3", "Algebraic Fractions", "Mathematics"),
      ]),
    );

    render(<LessonLibrary />);

    expect(pill("All")).toBeInTheDocument();
    expect(pill("Mathematics")).toBeInTheDocument();
    expect(pill("English")).toBeInTheDocument();
  });

  it("show subjects this repo has never heard of", () => {
    // The point of not writing the list here: the fixture vocabulary is
    // Mathematics, English and Sciences, and a real school teaches these.
    useLessonLibrary.mockReturnValue(
      state([
        card("1", "Photosynthesis", "Biology"),
        card("2", "Titration", "Chemistry"),
      ]),
    );

    render(<LessonLibrary />);

    expect(pill("Biology")).toBeInTheDocument();
    expect(pill("Chemistry")).toBeInTheDocument();
  });

  it("narrow the shelf to one subject", () => {
    useLessonLibrary.mockReturnValue(
      state([
        card("1", "Solving Linear Equations", "Mathematics"),
        card("2", "Things Fall Apart", "English"),
      ]),
    );

    render(<LessonLibrary />);
    fireEvent.click(screen.getByRole("button", { name: "English" }));

    expect(screen.getByText("Things Fall Apart")).toBeInTheDocument();
    expect(screen.queryByText("Solving Linear Equations")).not.toBeInTheDocument();
  });

  it("do not appear when there is only one thing to pick", () => {
    // A row reading "All / Mathematics" over an all-maths shelf is a control
    // that cannot change anything.
    useLessonLibrary.mockReturnValue(
      state([
        card("1", "Solving Linear Equations", "Mathematics"),
        card("2", "Algebraic Fractions", "Mathematics"),
      ]),
    );

    render(<LessonLibrary />);

    expect(pill("All")).not.toBeInTheDocument();
    expect(pill("Mathematics")).not.toBeInTheDocument();
  });

  it("do not appear at all when nothing carries a subject", () => {
    useLessonLibrary.mockReturnValue(
      state([card("1", "Solving Linear Equations"), card("2", "Fractions")]),
    );

    render(<LessonLibrary />);

    expect(pill("All")).not.toBeInTheDocument();
    expect(screen.getByText("Solving Linear Equations")).toBeInTheDocument();
  });
});

describe("what the card carries", () => {
  const lesson = (over: Partial<LessonSummary> = {}) =>
    ({
      id: "l-1",
      title: "Solving Linear Equations",
      status: "ready",
      sourceType: "pdf",
      segmentCount: 6,
      reviewSegmentCount: 0,
      subject: "Mathematics",
      assignmentCount: 0,
      estimatedMinutes: 20,
      createdAt: "2026-09-18T09:00:00Z",
      ...over,
    }) as LessonSummary;

  it("keeps the subject the lesson was uploaded with", () => {
    expect(__toCardForTest(lesson()).subject).toBe("Mathematics");
  });

  it("leaves it absent when the lesson has none", () => {
    // Nullable on the summary. Absent is a lesson the pills cannot narrow,
    // which is not the same as an error and not the same as "All".
    expect(__toCardForTest(lesson({ subject: null })).subject).toBeUndefined();
  });
});

/**
 * WHY A LESSON COULD NOT BE PROCESSED, ON THE CARD THAT SAYS IT WASN'T.
 *
 * The card has said "This lesson couldn't be processed. Nothing you did is
 * lost." since it was built, and could say no more: the reason lives on the
 * parse RUN and this list carries no run id, so the alternative was a request
 * per failed card to render one sentence. Backend denormalised
 * `failureReason` and `incidentId` onto the lesson on 25 Sep.
 *
 * The mapper is tested here rather than only through the screen, because the
 * screen mocks the hook - a field dropped in `toCard` would be invisible to
 * every component test in this file.
 */
describe("what the mapper carries off a failed lesson", () => {
  const failed = (over: Record<string, unknown> = {}) =>
    __toCardForTest({
      id: "l-1",
      title: "Water Cycle",
      sourceType: "upload",
      status: "failed",
      segmentCount: 0,
      reviewSegmentCount: 0,
      createdAt: "2026-09-25T09:00:00Z",
      ...over,
    } as never);

  it("carries the reason and the reference", () => {
    const c = failed({
      failureReason: "A fault at our end, not anything about your file.",
      incidentId: "ca8435c98d08",
    });

    expect(c.kind).toBe("failed");
    expect(c.failureReason).toBe(
      "A fault at our end, not anything about your file.",
    );
    expect(c.incidentId).toBe("ca8435c98d08");
  });

  it("carries neither where the server sent neither", () => {
    // Absent on an older deployment, so the card keeps its own line rather
    // than rendering an empty one.
    const c = failed();

    expect(c.failureReason).toBeUndefined();
    expect(c.incidentId).toBeUndefined();
  });

  it("treats a whitespace-only reason as none", () => {
    const c = failed({ failureReason: "   ", incidentId: "  " });

    expect(c.failureReason).toBeUndefined();
    expect(c.incidentId).toBeUndefined();
  });

  it("puts no post-mortem on a lesson that is still being read", () => {
    /*
     * `failureReason` is null unless the parse failed - but a payload that
     * carried one on a processing lesson would otherwise reach a live card,
     * and "why it failed" on a lesson that has not is the worst kind of wrong.
     */
    const c = failed({
      status: "processing",
      failureReason: "A fault at our end.",
      incidentId: "ca8435c98d08",
    });

    expect(c.kind).toBe("parsing");
    expect(c.failureReason).toBeUndefined();
    expect(c.incidentId).toBeUndefined();
  });
});

describe("the failed card on screen", () => {
  const failedCard = (over: Record<string, unknown> = {}) => ({
    id: "l-1",
    title: "Water Cycle",
    status: "Ready" as const,
    kind: "failed" as const,
    needsReview: false,
    meta: "0 sections",
    footer: "We couldn’t read this file",
    ...over,
  });

  it("says why, where the server said", () => {
    useLessonLibrary.mockReturnValue(
      state([
        failedCard({
          failureReason: "A fault at our end, not anything about your file.",
        }),
      ] as never),
    );

    render(<LessonLibrary />);

    expect(
      screen.getByText("A fault at our end, not anything about your file."),
    ).toBeInTheDocument();
  });

  it("keeps our own line where it did not", () => {
    useLessonLibrary.mockReturnValue(state([failedCard()] as never));

    render(<LessonLibrary />);

    expect(screen.getByText("Nothing you did is lost.")).toBeInTheDocument();
  });

  it("offers the reference to quote", () => {
    useLessonLibrary.mockReturnValue(
      state([failedCard({ incidentId: "ca8435c98d08" })] as never),
    );

    render(<LessonLibrary />);

    expect(screen.getByText(/ca8435c98d08/)).toBeInTheDocument();
  });
});

/**
 * "NEEDS REVIEW" ON A LESSON THAT HAS BEEN REVIEWED.
 *
 * The first real end-to-end run ended on a lesson approved in full and sent to
 * seven children that still said "Needs review" in the library. The card read
 * `reviewSegmentCount`, which counts what was EVER flagged and never falls -
 * by design, backend confirmed on 25 Sep. `unapprovedSegmentCount` is the
 * number that reaches zero.
 */
describe("what the card calls a lesson that has been reviewed", () => {
  const reviewed = (over: Record<string, unknown> = {}) =>
    __toCardForTest({
      id: "l-1",
      title: "Water Cycle",
      sourceType: "upload",
      status: "completed_with_review",
      segmentCount: 5,
      reviewSegmentCount: 5,
      createdAt: "2026-09-25T09:00:00Z",
      ...over,
    } as never);

  it("calls it ready once nothing is outstanding, however much was flagged", () => {
    const c = reviewed({ unapprovedSegmentCount: 0 });

    expect(c.needsReview).toBe(false);
    expect(c.status).toBe("Ready");
  });

  it("still asks for a look while something is waiting", () => {
    const c = reviewed({ unapprovedSegmentCount: 2 });

    expect(c.needsReview).toBe(true);
    expect(c.status).toBe("Needs review");
  });

  it("keeps the old reading where the deployment sends no outstanding count", () => {
    // Absent is "we were not told", not zero. Dropping the badge here would
    // hide a lesson that genuinely needs one.
    const c = reviewed();

    expect(c.needsReview).toBe(true);
    expect(c.status).toBe("Needs review");
  });

  it("reads the outstanding count on a lesson that came back plain completed too", () => {
    const c = reviewed({ status: "completed", unapprovedSegmentCount: 0 });

    expect(c.status).toBe("Ready");
  });
});
