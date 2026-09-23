import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProcessingStages, stageOf } from "./ProcessingStages";

/**
 * SCRUM-172 LU-01, and the ruling it walks back into.
 *
 * "Processing a lesson takes time and that time is currently dead." A
 * single-lesson upload showed a spinner and two sentences for work backend
 * measures at about 115 seconds of text plus up to 600 per generated picture.
 *
 * THE FRAME DRAWS FIVE STAGES AND THE CONTRACT REPORTS FOUR. That is the same
 * conflict design ruled on for the block path on 14 Sep, in words this file
 * keeps: *"never draw a rung the backend doesn't report"* - the ladder was cut
 * from four to three then for exactly this reason. LU-01 says it itself: "no
 * invented progress." So "Preparing the adaptations" is absent and raised, not
 * drawn from a clock.
 *
 * Most of this file is about what the ladder does NOT claim.
 */

describe("which stage the server has actually reached", () => {
  it("is receiving while the upload is still in flight", () => {
    // No id yet means the POST has not answered. That is the one stage this
    // side of the wire can see for itself.
    expect(stageOf(null, null, null)).toBe("receiving");
  });

  it("stays on receiving while the post is in flight, whatever else is held", () => {
    /*
     * A mutation run found this one had nothing behind it. The guard reads
     * `uploadId === null` FIRST, before any stage value, because a stage
     * without an id is a leftover - and walking a teacher onto "Finding the
     * sections" for an upload the server has not acknowledged would be the
     * ladder lying about a file that may not have arrived.
     */
    expect(stageOf(null, "structure", "processing")).toBe("receiving");
    expect(stageOf(null, "complete", "ready")).toBe("receiving");
  });

  it("reads the two stages the contract names", () => {
    expect(stageOf("u-1", "lessons", "processing")).toBe("reading");
    expect(stageOf("u-1", "structure", "processing")).toBe("sections");
  });

  it("is ready on the stage OR the status, because both say so", () => {
    expect(stageOf("u-1", "complete", "processing")).toBe("ready");
    expect(stageOf("u-1", "structure", "ready")).toBe("ready");
    expect(stageOf("u-1", "structure", "confirmed")).toBe("ready");
  });

  it("holds where it is on a stage value it does not know", () => {
    /*
     * A new enum value should not walk a teacher onto a rung the server
     * never mentioned. Holding is the conservative direction: it under-claims
     * rather than announcing progress that may not have happened.
     */
    expect(stageOf("u-1", "polishing" as never, "processing")).toBe("receiving");
  });
});

describe("what the ladder shows", () => {
  it("names the lesson, because a teacher may have uploaded three", () => {
    render(<ProcessingStages lessonName="Photosynthesis" current="reading" />);

    expect(screen.getByText("Photosynthesis")).toBeInTheDocument();
  });

  it("shows every stage from the first moment, not just the current one", () => {
    render(<ProcessingStages lessonName="L" current="receiving" />);

    expect(screen.getByText("Receiving the file")).toBeInTheDocument();
    expect(screen.getByText("Reading the document")).toBeInTheDocument();
    expect(screen.getByText("Finding the sections")).toBeInTheDocument();
    expect(screen.getByText("Ready to assign")).toBeInTheDocument();
  });

  it("draws no stage the backend cannot report", () => {
    /*
     * THE ASSERTION THIS FILE EXISTS FOR. The frame draws five; "Preparing
     * the adaptations" has no stage value behind it and is where a teacher
     * waits longest, because it is where the images and speech are made.
     * Drawn from the enum it is a rung that never lights, or one that lights
     * by guesswork - which is the defect design cut the block path's fourth
     * rung to remove.
     */
    render(<ProcessingStages lessonName="L" current="sections" />);

    expect(
      screen.queryByText(/Preparing the adaptations/i),
    ).not.toBeInTheDocument();
  });

  it("puts no number on any of it", () => {
    // No percentage, no count, no estimate. The server reports no figure for
    // any of this, and an invented one is a promise a teacher will time.
    const { container } = render(
      <ProcessingStages lessonName="L" current="reading" />,
    );

    expect(container.textContent).not.toMatch(/\d+\s*%|\d+\s*of\s*\d+/);
  });
});

describe("a stage that stopped", () => {
  it("names the one it happened at", () => {
    render(
      <ProcessingStages lessonName="L" current="reading" failedAt="reading" />,
    );

    expect(screen.getByText(/stopped/)).toBeInTheDocument();
  });

  it("leaves the earlier stages standing as complete", () => {
    // LU-05: "the stage list is drawn as it stood". Those stages really did
    // finish, and blanking them would tell a teacher the whole thing failed.
    render(
      <ProcessingStages lessonName="L" current="sections" failedAt="sections" />,
    );

    expect(screen.getByText("Receiving the file")).toBeInTheDocument();
    expect(screen.getByText("Reading the document")).toBeInTheDocument();
  });

  it("does not mark the stage it stopped at as done", () => {
    const { container } = render(
      <ProcessingStages lessonName="L" current="reading" failedAt="reading" />,
    );

    // One completed mark - "Receiving the file" - and not two.
    expect(container.querySelectorAll(".bg-nevo-navy")).toHaveLength(1);
  });

  it("stops the motion, because nothing is happening any more", () => {
    /*
     * The other half of the same guard, and a mutation run is what showed
     * the count above could not see it: a stopped stage was still drawn as
     * the RUNNING one, spinner and all. Motion on this screen means work is
     * happening - LU-01 puts it on the running stage and nowhere else - so a
     * stage that has stopped must not keep it.
     *
     * The selector is an attribute match, not `.animate-spin`: the class is
     * `motion-safe:animate-spin`, so a class selector finds nothing and the
     * assertion passes over anything at all. The paired test below is what
     * proves this one can fail.
     */
    const { container } = render(
      <ProcessingStages lessonName="L" current="sections" failedAt="sections" />,
    );

    expect(container.querySelectorAll('[class*="animate-spin"]')).toHaveLength(0);
  });

  it("keeps the motion while it is genuinely running", () => {
    const { container } = render(
      <ProcessingStages lessonName="L" current="sections" />,
    );

    expect(container.querySelectorAll('[class*="animate-spin"]')).toHaveLength(1);
  });
});
