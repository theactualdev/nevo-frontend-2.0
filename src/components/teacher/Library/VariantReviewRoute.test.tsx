import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { LessonSegment } from "@/lib/api/lessons";

const { useLessonDetail, getToken } = vi.hoisted(() => ({
  useLessonDetail: vi.fn(),
  getToken: vi.fn(),
}));

vi.mock("@/hooks/useLessonDetail", () => ({ useLessonDetail }));
vi.mock("@/lib/auth/session", () => ({ getToken }));
vi.mock("@/hooks/useHydrated", () => ({ useHydrated: () => true }));
// The wrapper is not under test here. Stubbed to a div rather than an `<img>`
// so the mock does not trip `@next/next/no-img-element` - a lint warning in a
// test file is still noise every contributor has to read past.
vi.mock("@/components/shared/IllustrationWrapper", () => ({
  IllustrationWrapper: ({ src, alt }: { src: string; alt: string }) => (
    <div role="img" aria-label={alt} data-src={src} />
  ),
}));

vi.mock("./VariantReview", () => ({
  VariantReview: ({ sectionIndex }: { sectionIndex: number }) => (
    <div>{`DESIGNED SCREEN, SECTION ${sectionIndex}`}</div>
  ),
}));

import { VariantReviewRoute } from "./VariantReviewRoute";

/**
 * Variant review, on a real teacher's real lesson.
 *
 * WHAT WAS WRONG. This route answered every signed-in teacher with "Variants
 * aren't available yet ... they're not part of what a lesson gives us back."
 * That was never true. All five variants are declared on
 * `LessonSegmentResponse` and always have been - returned by the very lesson
 * read the console already makes. They were NULL on every lesson, because the
 * parse was silently falling back to deterministic text, and this console read
 * "always null" as "absent from the contract". A whole drawn screen sat behind
 * a sentence asserting the feature was impossible, and `docs/BUILD_STATUS.md`
 * filed it under NEEDS BACKEND on the strength of it.
 *
 * So the assertion that matters is the negative one: that sentence must not
 * appear for a teacher whose lesson actually carries variants. Asserting only
 * that the text renders would pass against a screen that ALSO still showed the
 * old card, which is why both halves are checked.
 */

const seg = (over: Partial<LessonSegment> = {}): LessonSegment =>
  ({
    id: "s-1",
    segmentKey: "seg-1",
    contentType: "explanation",
    sequenceOrder: 1,
    title: "Collecting x terms",
    body: "…",
    availableModalities: [],
    comprehensionCheckpoints: [],
    needsReview: false,
    reviewReasons: [],
    textVariant: { body: "Collect the x terms first.", keyPoints: ["Subtract 3x"] },
    visualVariant: null,
    audioVariant: null,
    interactiveVariant: null,
    calculationVariant: null,
    ...over,
  }) as unknown as LessonSegment;

const state = (over: Record<string, unknown> = {}) => ({
  lesson: {
    id: "l-1",
    title: "Solving linear equations",
    segments: [seg()],
  },
  classIds: [],
  progress: null,
  modules: [],
  assignments: [],
  loading: false,
  missing: false,
  failed: false,
  ...over,
});

const IMPOSSIBLE = /Variants aren’t available yet/i;

beforeEach(() => {
  useLessonDetail.mockReset();
  getToken.mockReset();
  getToken.mockReturnValue("a-token");
});

describe("a signed-in teacher's own lesson", () => {
  it("no longer claims variants are impossible", () => {
    useLessonDetail.mockReturnValue(state());

    render(<VariantReviewRoute fixture={null} lessonId="l-1" sectionIndex={1} />);

    expect(screen.queryByText(IMPOSSIBLE)).not.toBeInTheDocument();
    expect(screen.getByText("Collect the x terms first.")).toBeInTheDocument();
  });

  it("reads the section the URL asked for, by sequence and not by array order", () => {
    // The contract promises `sequenceOrder`, not a sorted array. Indexing the
    // raw array would show section 2's content under "Section 1".
    useLessonDetail.mockReturnValue(
      state({
        lesson: {
          id: "l-1",
          title: "Solving linear equations",
          segments: [
            seg({
              id: "s-2",
              sequenceOrder: 2,
              textVariant: { body: "SECOND SECTION", keyPoints: [] },
            }),
            seg({
              id: "s-1",
              sequenceOrder: 1,
              textVariant: { body: "FIRST SECTION", keyPoints: [] },
            }),
          ],
        },
      }),
    );

    render(<VariantReviewRoute fixture={null} lessonId="l-1" sectionIndex={1} />);

    expect(screen.getByText("FIRST SECTION")).toBeInTheDocument();
    expect(screen.queryByText("SECOND SECTION")).not.toBeInTheDocument();
  });

  it("says which variant is missing rather than showing an empty card", () => {
    // A null variant is a real fact about the lesson - Nevo did not generate
    // one - and it is the reason a teacher opened this screen. Blank would read
    // as a broken page.
    useLessonDetail.mockReturnValue(state());

    render(<VariantReviewRoute fixture={null} lessonId="l-1" sectionIndex={1} />);
    fireEvent.click(screen.getByRole("tab", { name: "Audio" }));

    expect(
      screen.getByText(/has not generated a narrated version/i),
    ).toBeInTheDocument();
  });

  it("offers a tab for every variant the contract carries", () => {
    /*
     * THIS TEST ASSERTED THE GAP until 21 Sep. It read "offers four tabs,
     * not the five variants the contract carries", and its fixture named the
     * calculation variant's completion statement "SHOULD NOT RENDER".
     *
     * The reasoning was sound at the time: C16d drew no fifth tab, so drawing
     * one meant inventing a label and a layout. What nobody checked was
     * whether design had already ruled - SCRUM-136, 14 Sep, seven days before
     * this test was still holding the line: show it, call it Calculation,
     * steps in sequence, completion statement beneath.
     *
     * A teacher could not see one of the five forms their own lesson reaches
     * a child in, and a passing test said that was on purpose.
     */
    useLessonDetail.mockReturnValue(
      state({
        lesson: {
          id: "l-1",
          title: "Solving linear equations",
          segments: [
            seg({
              calculationVariant: {
                type: "co_construction",
                fullEquation: "5x + 2 = 3x + 10",
                steps: [
                  {
                    stepId: "s1",
                    stepNumber: 1,
                    prompt: "Take 3x from both sides.",
                    expectedInput: "numeric",
                    hint: "The x terms belong together.",
                    confirmationText: "",
                    visualUpdate: "",
                    equationState: "2x + 2 = 10",
                  },
                  {
                    stepId: "s2",
                    stepNumber: 2,
                    prompt: "Now take 2 from both sides.",
                    expectedInput: "numeric",
                    hint: "Clear the constant.",
                    confirmationText: "",
                    visualUpdate: "",
                    equationState: "2x = 8",
                  },
                ],
                scaffoldImage: null,
                completionStatement: "So x is 4.",
              },
            }),
          ],
        },
      }),
    );

    render(<VariantReviewRoute fixture={null} lessonId="l-1" sectionIndex={1} />);

    expect(screen.getAllByRole("tab")).toHaveLength(5);
    fireEvent.click(screen.getByRole("tab", { name: "Calculation" }));

    expect(screen.getByText("5x + 2 = 3x + 10")).toBeInTheDocument();
    expect(screen.getByText("Take 3x from both sides.")).toBeInTheDocument();
    expect(screen.getByText("Now take 2 from both sides.")).toBeInTheDocument();
    expect(screen.getByText("So x is 4.")).toBeInTheDocument();
  });

  it("shows the equation as it reads after each step", () => {
    // How a teacher checks the working actually works, rather than that the
    // prompts sound plausible.
    useLessonDetail.mockReturnValue(
      state({
        lesson: {
          id: "l-1",
          title: "Solving linear equations",
          segments: [
            seg({
              calculationVariant: {
                type: "co_construction",
                fullEquation: "5x + 2 = 3x + 10",
                steps: [
                  {
                    stepId: "s1",
                    stepNumber: 1,
                    prompt: "Take 3x from both sides.",
                    expectedInput: "numeric",
                    hint: "",
                    confirmationText: "",
                    visualUpdate: "",
                    equationState: "2x + 2 = 10",
                  },
                ],
                scaffoldImage: null,
                completionStatement: "",
              },
            }),
          ],
        },
      }),
    );

    render(<VariantReviewRoute fixture={null} lessonId="l-1" sectionIndex={1} />);
    fireEvent.click(screen.getByRole("tab", { name: "Calculation" }));

    expect(screen.getByText("2x + 2 = 10")).toBeInTheDocument();
  });

  it("shows no answers, the way the interactive tab shows no answer key", () => {
    // A teacher reading whether the working is sound does not need them, and
    // the tab beside this one already withholds its `answerKey` on exactly
    // that reasoning.
    useLessonDetail.mockReturnValue(
      state({
        lesson: {
          id: "l-1",
          title: "Solving linear equations",
          segments: [
            seg({
              calculationVariant: {
                type: "co_construction",
                fullEquation: "5x + 2 = 3x + 10",
                answer: "SHOULD NOT RENDER",
                steps: [
                  {
                    stepId: "s1",
                    stepNumber: 1,
                    prompt: "Take 3x from both sides.",
                    expectedInput: "numeric",
                    hint: "NOR SHOULD THIS",
                    answer: "NOR THIS",
                    confirmationText: "",
                    visualUpdate: "",
                    equationState: "2x + 2 = 10",
                  },
                ],
                scaffoldImage: null,
                completionStatement: "So x is 4.",
              },
            }),
          ],
        },
      }),
    );

    render(<VariantReviewRoute fixture={null} lessonId="l-1" sectionIndex={1} />);
    fireEvent.click(screen.getByRole("tab", { name: "Calculation" }));

    expect(screen.queryByText("SHOULD NOT RENDER")).not.toBeInTheDocument();
    expect(screen.queryByText("NOR SHOULD THIS")).not.toBeInTheDocument();
    expect(screen.queryByText("NOR THIS")).not.toBeInTheDocument();
  });

  it("says so when a section has no worked steps at all", () => {
    useLessonDetail.mockReturnValue(
      state({
        lesson: {
          id: "l-1",
          title: "Solving linear equations",
          segments: [seg({ calculationVariant: null })],
        },
      }),
    );

    render(<VariantReviewRoute fixture={null} lessonId="l-1" sectionIndex={1} />);
    fireEvent.click(screen.getByRole("tab", { name: "Calculation" }));

    expect(
      screen.getByText(/has not generated worked steps/i),
    ).toBeInTheDocument();
  });

  it("renders the console's own copy for a review reason, never the raw token", () => {
    // The contract's description of the enum says exactly this is the point:
    // "Enumerated so the console can render its own copy per reason instead of
    // printing the raw token with underscores swapped for spaces."
    useLessonDetail.mockReturnValue(
      state({
        lesson: {
          id: "l-1",
          title: "Solving linear equations",
          segments: [
            seg({ needsReview: true, reviewReasons: ["audio_generation_failed"] }),
          ],
        },
      }),
    );

    render(<VariantReviewRoute fixture={null} lessonId="l-1" sectionIndex={1} />);

    expect(screen.getByText("The narrated version did not generate.")).toBeInTheDocument();
    expect(screen.queryByText(/audio_generation_failed/)).not.toBeInTheDocument();
    expect(screen.queryByText(/audio generation failed/i)).not.toBeInTheDocument();
  });

  it("still says something useful for a reason added after this shipped", () => {
    useLessonDetail.mockReturnValue(
      state({
        lesson: {
          id: "l-1",
          title: "Solving linear equations",
          segments: [
            seg({
              needsReview: true,
              reviewReasons: ["some_future_reason"] as unknown as LessonSegment["reviewReasons"],
            }),
          ],
        },
      }),
    );

    render(<VariantReviewRoute fixture={null} lessonId="l-1" sectionIndex={1} />);

    expect(
      screen.getByText(/gave a reason this console doesn’t recognise yet/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/some_future_reason/)).not.toBeInTheDocument();
  });

  /**
   * The nine reasons backend added after this map was written.
   *
   * They were LIVE on the wire while `SegmentReviewReason` listed six, so every
   * one of them fell to the unknown-reason fallback. That fallback is the right
   * behaviour for a reason nobody has written copy for; it is the wrong
   * behaviour for a reason that has been deployed for days.
   *
   * Eight of the nine are calculation reasons, which is the sharp end: the
   * review screen draws four tabs and no calculation tab (SCRUM-136), so a
   * teacher whose worked steps came through broken could not see the steps AND
   * was told Nevo had no reason. This test holds the copy half of that.
   */
  const CALCULATION_AND_MODEL_REASONS: Array<[string, RegExp]> = [
    ["calculation_variant_malformed", /form Nevo could use/i],
    ["calculation_variant_missing_answer", /without a final answer/i],
    ["calculation_variant_too_few_steps", /nothing was skipped/i],
    ["calculation_step_missing_prompt", /does not ask the student/i],
    ["calculation_step_unknown_input_type", /form Nevo does not recognise/i],
    ["calculation_step_missing_answer", /no answer to check a student against/i],
    ["calculation_step_missing_options", /no options to choose from/i],
    [
      "calculation_segment_has_no_interactive_delivery",
      /nothing came through for the student to do/i,
    ],
    ["model_flagged_for_review", /asked for a person to look at it/i],
  ];

  it.each(CALCULATION_AND_MODEL_REASONS)(
    "renders its own copy for %s, not the unknown-reason fallback",
    (reason, expected) => {
      useLessonDetail.mockReturnValue(
        state({
          lesson: {
            id: "l-1",
            title: "Solving linear equations",
            segments: [
              seg({
                needsReview: true,
                reviewReasons: [reason] as LessonSegment["reviewReasons"],
              }),
            ],
          },
        }),
      );

      render(<VariantReviewRoute fixture={null} lessonId="l-1" sectionIndex={1} />);

      expect(screen.getByText(expected)).toBeInTheDocument();
      // The two failures this guards, in order of how badly they read:
      expect(
        screen.queryByText(/doesn’t recognise yet/i),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(new RegExp(reason))).not.toBeInTheDocument();
    },
  );

  it("writes every review reason to the house copy rule", () => {
    // "No dashes in Nevo copy, anywhere. Full stops or commas." Applied 14 Sep
    // across the teacher and parent consoles. New copy has reintroduced them
    // before, and a dash reads as a different voice on a screen a teacher is
    // already reading because something went wrong.
    for (const [reason] of CALCULATION_AND_MODEL_REASONS) {
      useLessonDetail.mockReturnValue(
        state({
          lesson: {
            id: "l-1",
            title: "Solving linear equations",
            segments: [
              seg({
                needsReview: true,
                reviewReasons: [reason] as LessonSegment["reviewReasons"],
              }),
            ],
          },
        }),
      );

      const { unmount, container } = render(
        <VariantReviewRoute fixture={null} lessonId="l-1" sectionIndex={1} />,
      );

      expect(container.textContent ?? "").not.toMatch(/[—–]|\s-\s/);
      unmount();
    }
  });

  it("shows no review banner when nothing is flagged", () => {
    useLessonDetail.mockReturnValue(state());

    render(<VariantReviewRoute fixture={null} lessonId="l-1" sectionIndex={1} />);

    expect(screen.queryByText(/flagged this section for a look/i)).not.toBeInTheDocument();
  });

  it("holds a skeleton while the lesson loads, rather than a wrong answer", () => {
    useLessonDetail.mockReturnValue(state({ lesson: null, loading: true }));

    render(<VariantReviewRoute fixture={null} lessonId="l-1" sectionIndex={1} />);

    expect(screen.queryByText(IMPOSSIBLE)).not.toBeInTheDocument();
    expect(screen.queryByText(/couldn’t load this lesson/i)).not.toBeInTheDocument();
  });

  it("distinguishes a missing lesson from one it could not load", () => {
    useLessonDetail.mockReturnValue(state({ lesson: null, missing: true }));
    const { unmount } = render(
      <VariantReviewRoute fixture={null} lessonId="l-1" sectionIndex={1} />,
    );
    expect(screen.getByText(/couldn’t find this lesson/i)).toBeInTheDocument();
    unmount();

    useLessonDetail.mockReturnValue(state({ lesson: null, failed: true }));
    render(<VariantReviewRoute fixture={null} lessonId="l-1" sectionIndex={1} />);
    expect(screen.getByText(/couldn’t load this lesson/i)).toBeInTheDocument();
  });

  it("says so when the lesson has no section with that number", () => {
    useLessonDetail.mockReturnValue(state());

    render(<VariantReviewRoute fixture={null} lessonId="l-1" sectionIndex={9} />);

    expect(screen.getByText(/no section 9/i)).toBeInTheDocument();
  });
});

describe("the signed-out walkthrough", () => {
  // The designed screen is what the frames are reviewed against, and the live
  // path added here must not cost it. Worth pinning precisely because this
  // route now calls a live hook BEFORE the signed-out branch is reached - a
  // reordering that broke it would be invisible to every test above, all of
  // which hold a token.
  const fixture = {
    id: "solving-linear-equations",
    title: "Solving linear equations",
    detail: { sections: [{ title: "One", type: "explanation" }] },
  } as never;

  it("still renders the designed screen for a visitor with no session", () => {
    getToken.mockReturnValue(null);
    useLessonDetail.mockReturnValue(state({ lesson: null }));

    render(
      <VariantReviewRoute fixture={fixture} lessonId="l-1" sectionIndex={1} />,
    );

    expect(screen.getByText("DESIGNED SCREEN, SECTION 1")).toBeInTheDocument();
  });

  it("clamps a section number the fixture does not have", () => {
    getToken.mockReturnValue(null);
    useLessonDetail.mockReturnValue(state({ lesson: null }));

    render(
      <VariantReviewRoute fixture={fixture} lessonId="l-1" sectionIndex={9} />,
    );

    expect(screen.getByText("DESIGNED SCREEN, SECTION 1")).toBeInTheDocument();
  });
});
