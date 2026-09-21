import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ReviewSection } from "./ReviewSection";
import type { LessonSegment } from "@/lib/api/lessons";

/**
 * SCRUM-153, LR-02: the card a teacher opens to check what Nevo read.
 *
 * "Key points are extracted and shown as cards, but a card cannot be clicked
 * or expanded. There is no way to see what Nevo drew from." Expandable is the
 * missing piece, and without it the product demanded a review it gave no
 * means to perform.
 */

const seg = (over: Partial<LessonSegment> = {}): LessonSegment =>
  ({
    id: "s-1",
    segmentKey: "k-1",
    sequenceOrder: 2,
    contentType: "explanatory_text",
    title: "Adding unlike denominators",
    body: "You cannot add halves and thirds until both are in the same family.",
    availableModalities: ["text"],
    comprehensionCheckpoints: [],
    needsReview: true,
    reviewReasons: ["model_flagged_for_review"],
    approved: false,
    approvedAt: null,
    textVariant: { body: "…", keyPoints: ["Find a common denominator first"] },
    ...over,
  }) as unknown as LessonSegment;

const show = (over: Partial<LessonSegment> = {}, props = {}) =>
  render(
    <ReviewSection
      segment={seg(over)}
      index={2}
      approved={false}
      approving={false}
      failed={false}
      onAccept={vi.fn()}
      {...props}
    />,
  );

const open = () =>
  fireEvent.click(screen.getByRole("button", { expanded: false }));

describe("the card a teacher can open", () => {
  it("opens", () => {
    show();

    expect(screen.queryByText(/What Nevo read/i)).not.toBeInTheDocument();
    open();

    expect(screen.getByText(/What Nevo read/i)).toBeInTheDocument();
  });

  it("shows what Nevo read, and the key points it drew", () => {
    show();
    open();

    expect(
      screen.getByText(/cannot add halves and thirds/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Find a common denominator first"),
    ).toBeInTheDocument();
  });

  it("says why in sentences, never in parser tokens", () => {
    // The contract's own description asks for this: "Enumerated so the console
    // can render its own copy per reason instead of printing the raw token
    // with underscores swapped for spaces."
    show({ reviewReasons: ["audio_generation_failed"] });
    open();

    expect(
      screen.getByText("The narrated version did not generate."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/audio generation failed/i)).not.toBeInTheDocument();
  });

  it("still reads as English for a reason shipped after this console", () => {
    show({ reviewReasons: ["something_new_entirely" as never] });
    open();

    expect(screen.getByText(/doesn’t recognise yet/)).toBeInTheDocument();
  });

  it("says nothing came through rather than showing an empty space", () => {
    show({ body: "" });
    open();

    expect(screen.getByText(/Nothing came through/)).toBeInTheDocument();
  });
});

describe("accepting it", () => {
  it("hands the section back to the page", () => {
    const onAccept = vi.fn();
    show({}, { onAccept });
    open();

    fireEvent.click(screen.getByRole("button", { name: "Accept this section" }));

    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it("says so while it is sending, and refuses a second press", () => {
    const onAccept = vi.fn();
    show({}, { approving: true, onAccept });
    open();

    const control = screen.getByRole("button", { name: "Accepting…" });
    expect(control).toBeDisabled();
    fireEvent.click(control);
    expect(onAccept).not.toHaveBeenCalled();
  });

  it("says nothing changed when it did not land", () => {
    show({}, { failed: true });
    open();

    expect(screen.getByText(/didn’t go through/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Accept this section" }),
    ).toBeInTheDocument();
  });

  it("offers no accept once the section is checked", () => {
    show({}, { approved: true });

    expect(screen.getByText("Checked")).toBeInTheDocument();
    open();
    expect(
      screen.queryByRole("button", { name: "Accept this section" }),
    ).not.toBeInTheDocument();
  });
});
