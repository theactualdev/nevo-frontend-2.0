import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { LessonDetailResponse, LessonSegment } from "@/lib/api/lessons";

vi.mock("@/components/shared/IllustrationWrapper", () => ({
  IllustrationWrapper: ({ alt }: { alt: string }) => <div role="img" aria-label={alt} />,
}));

import { LiveLessonDetail } from "./LiveLessonDetail";

/**
 * The way into variant review.
 *
 * `/teacher/lessons/{id}/variants` was built, tested and live for three days
 * with NOTHING linking to it - a finished screen reachable only by typing a
 * URL. The inventory called it "no entry point"; this is the entry.
 *
 * The assertion is about the HREF, because the href is the feature. A test that
 * the link renders would pass against one pointing at the wrong section, which
 * is the failure that would actually reach a teacher: variants for the segment
 * below the one they tapped.
 */

const seg = (over: Partial<LessonSegment> = {}): LessonSegment =>
  ({
    id: "s-1",
    segmentKey: "k-1",
    contentType: "explanation",
    sequenceOrder: 1,
    title: "What an equation is",
    body: "",
    availableModalities: [],
    comprehensionCheckpoints: [],
    needsReview: false,
    reviewReasons: [],
    textVariant: null,
    visualVariant: null,
    audioVariant: null,
    interactiveVariant: null,
    calculationVariant: null,
    ...over,
  }) as unknown as LessonSegment;

const lesson = (segments: LessonSegment[]) =>
  ({
    id: "l-9",
    title: "Solving linear equations",
    segments,
    confirmationSummary: null,
  }) as unknown as LessonDetailResponse;

const render3 = () =>
  render(
    <LiveLessonDetail
      lesson={lesson([
        seg({ id: "s-1", sequenceOrder: 1, title: "First" }),
        seg({ id: "s-2", sequenceOrder: 2, title: "Second" }),
        seg({ id: "s-3", sequenceOrder: 3, title: "Third" }),
      ])}
      modules={[]}
      assignments={[]}
      progress={null}
    />,
  );

describe("variant review entry", () => {
  it("offers a way in from every segment", () => {
    render3();

    expect(screen.getAllByRole("link", { name: "Variant review" })).toHaveLength(3);
  });

  it("points each link at ITS OWN section, one-indexed", () => {
    // Off by one here sends a teacher to a neighbouring segment's variants and
    // says nothing is wrong. The screen counts sections from 1.
    render3();

    const hrefs = screen
      .getAllByRole("link", { name: "Variant review" })
      .map((a) => a.getAttribute("href"));

    expect(hrefs).toEqual([
      "/teacher/lessons/l-9/variants?section=1",
      "/teacher/lessons/l-9/variants?section=2",
      "/teacher/lessons/l-9/variants?section=3",
    ]);
  });

  it("offers it even where Nevo has generated nothing", () => {
    // Every segment above carries four null variants. The screen names which
    // are missing, and that is worth reaching; a link that appeared and
    // vanished for invisible reasons would be worse than one that is always
    // there.
    render3();

    expect(screen.getAllByRole("link", { name: "Variant review" }).length).toBe(3);
  });
});

/**
 * WHERE THIS LESSON WENT - all of it.
 *
 * Design, 24 Sep: *"show all of them. A lesson assigned to three classes that
 * displays one is telling a teacher something untrue. A list rather than tabs,
 * because a teacher needs to see at a glance where a lesson went."*
 *
 * It used to receive a COUNT, derived by listing every assignment the teacher
 * can see and filtering client-side - so the screen could say "one of several"
 * and never which. `lesson.classes` landed on 25 Sep: one query, only classes
 * with somebody assigned, names included.
 */
describe("where this lesson went", () => {
  const CLASSES = [
    { id: "c-1", name: "JSS 2A", yearGroup: "JSS 2", studentCount: 28 },
    { id: "c-2", name: "JSS 2B", yearGroup: "JSS 2", studentCount: 31 },
    { id: "c-3", name: "JSS 2C", yearGroup: "JSS 2", studentCount: 1 },
  ];

  const show = (over: Record<string, unknown> = {}) =>
    render(
      <LiveLessonDetail
        lesson={lesson([seg()])}
        modules={[]}
        assignments={[]}
        progress={null}
        {...over}
      />,
    );

  it("names every class, not one of them", () => {
    show({ classes: CLASSES });

    expect(screen.getByText("JSS 2A")).toBeInTheDocument();
    expect(screen.getByText("JSS 2B")).toBeInTheDocument();
    expect(screen.getByText("JSS 2C")).toBeInTheDocument();
  });

  it("counts children, and says student for one of them", () => {
    show({ classes: CLASSES });

    expect(screen.getByText("28 students")).toBeInTheDocument();
    expect(screen.getByText("1 student")).toBeInTheDocument();
  });

  it("says nothing at all when the server sent no classes", () => {
    /*
     * ABSENT IS NOT EMPTY. An older deployment sends no `classes` field, and
     * "not assigned to any class" over that would invent the one fact this
     * section exists to report.
     */
    show();

    expect(screen.queryByText(/Where this lesson went/i)).not.toBeInTheDocument();
  });

  it("leaves the count off a class it was not given one for", () => {
    // 0 children is a class the lesson reached nobody in; absent is not knowing.
    show({ classes: [{ id: "c-1", name: "JSS 2A" }] });

    expect(screen.getByText("JSS 2A")).toBeInTheDocument();
    expect(screen.queryByText(/students?$/)).not.toBeInTheDocument();
  });

  it("says nobody is in a class that reached nobody", () => {
    // 0 is a fact and absent is not knowing one. The contract makes
    // `studentCount` optional, so both shapes arrive and they are different.
    show({ classes: [{ id: "c-1", name: "JSS 2A", studentCount: 0 }] });

    expect(screen.getByText("0 students")).toBeInTheDocument();
  });

  it("does not caveat the progress when there is only one class to be about", () => {
    // With one class the figures below are unambiguously its own, and a note
    // naming it would be saying the obvious twice.
    show({
      classes: [{ id: "c-1", name: "JSS 2A", studentCount: 28 }],
      progress: {
        lessonId: "l-9",
        classId: "c-1",
        assignedStudentCount: 28,
        segments: [],
        slowestSegmentId: null,
        slowdownNote: null,
      },
    });

    expect(screen.queryByText(/progress for|progress shown for/)).not.toBeInTheDocument();
  });

  it("names the class the progress is actually for", () => {
    /*
     * `class-progress` takes a single `classId`, so the figures below describe
     * ONE class however many are listed above. "progress shown for one class"
     * left a teacher to guess which - and guessing wrong is a teacher acting on
     * another class's numbers.
     */
    show({
      classes: CLASSES,
      progress: {
        lessonId: "l-9",
        classId: "c-2",
        assignedStudentCount: 31,
        segments: [],
        slowestSegmentId: null,
        slowdownNote: null,
      },
    });

    expect(screen.getByText(/progress for JSS 2B/)).toBeInTheDocument();
  });

  it("falls back to the vaguer line for a class it cannot name", () => {
    // A progress row for a class absent from the list - stale data, or a class
    // the teacher has since lost access to. Better vague than wrong.
    show({
      classes: CLASSES,
      progress: {
        lessonId: "l-9",
        classId: "c-99",
        assignedStudentCount: 4,
        segments: [],
        slowestSegmentId: null,
        slowdownNote: null,
      },
    });

    expect(
      screen.getByText(/progress shown for one class/),
    ).toBeInTheDocument();
  });
});
