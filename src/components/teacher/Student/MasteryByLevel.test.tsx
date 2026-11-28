import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { MasteryByLevel, NOTHING_AT_ANY_LEVEL } from "./MasteryByLevel";

/**
 * `Nevo Mastery By Level` (teacher/, 928cf30) against S21's read (backend
 * 58f31a6, b0bf27d). A state per level, the frame's words for it, and nothing
 * the engine did not send.
 */

const levelRows = (container: HTMLElement) =>
  [...container.querySelectorAll("[data-level]")].map((li) => li.textContent);

describe("MasteryByLevel - the three states", () => {
  it("draws each level in the curriculum's words, with the frame's word for its state", () => {
    const { container } = render(
      <MasteryByLevel
        concept="Photosynthesis"
        levels={{
          analysis_and_evaluation: "not",
          knowing_and_understanding: "reached",
          application: "working",
        }}
        reading={null}
      />,
    );
    expect(screen.getByText("Photosynthesis")).toBeInTheDocument();
    // In the order a learner works up through them, whatever order they came in.
    expect(levelRows(container)).toEqual([
      "Knowing and understandingReached",
      "ApplicationWorking at it",
      "Analysis and evaluationNot arrived yet",
    ]);
  });

  it("never shows the contract's keys", () => {
    const { container } = render(
      <MasteryByLevel
        concept="Photosynthesis"
        levels={{ knowing_and_understanding: "reached", analysis_and_evaluation: "working" }}
        reading="at"
      />,
    );
    expect(visibleText(container)).not.toMatch(/knowing_and_understanding|analysis_and_evaluation|_/);
  });

  it("draws no bar, no number and no percentage", () => {
    const { container } = render(
      <MasteryByLevel
        concept="Photosynthesis"
        levels={{ knowing_and_understanding: "reached", application: "working", analysis_and_evaluation: "not" }}
        reading="support"
      />,
    );
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(container.querySelector("[style*='width']")).toBeNull();
    expect(visibleText(container)).not.toMatch(/\d|%/);
  });

  it("draws no flag - the server sends none, and none is worked out here", () => {
    const { container } = render(
      <MasteryByLevel
        concept="Photosynthesis"
        levels={{ knowing_and_understanding: "not", application: "not", analysis_and_evaluation: "not" }}
        reading="support"
      />,
    );
    // The old dual track's computed verdicts. "Support needed" on the reading
    // row is the server's `support`, and is the only place those words appear.
    expect(visibleText(container)).not.toMatch(/Concept support needed|Needs support/i);
    expect(visibleText(container).match(/Support needed/g)).toHaveLength(1);
    // The concept line carries the name and nothing beside it.
    expect(screen.getByText("Photosynthesis").parentElement?.children).toHaveLength(1);
  });
});

describe("MasteryByLevel - a level with nothing observed", () => {
  it("is not drawn as Not arrived yet beside a level that has a state", () => {
    // The common case: a child who has only met knowledge-level items. The
    // frame's fallback drew the other two as "Not arrived yet" - an untrue
    // state; the server says an absent level and `not` are different facts.
    const { container } = render(
      <MasteryByLevel
        concept="Photosynthesis"
        levels={{ knowing_and_understanding: "reached" }}
        reading={null}
      />,
    );
    expect(levelRows(container)).toEqual(["Knowing and understandingReached"]);
    expect(visibleText(container)).not.toMatch(/Not arrived yet/);
  });

  it("says the frame's sentence when no level has a state - one line, not three", () => {
    const { container } = render(<MasteryByLevel concept="Photosynthesis" levels={{}} reading={null} />);
    expect(screen.getByText(NOTHING_AT_ANY_LEVEL)).toBeInTheDocument();
    expect(NOTHING_AT_ANY_LEVEL).toBe("Nothing recorded at any level yet.");
    expect(levelRows(container)).toEqual([]);
  });

  it("treats a value it does not know as nothing observed, not as one of the three", () => {
    const { container } = render(
      <MasteryByLevel
        concept="Photosynthesis"
        levels={{ knowing_and_understanding: "mastered" as never, application: "toString" as never }}
        reading={null}
      />,
    );
    expect(levelRows(container)).toEqual([]);
    expect(visibleText(container)).not.toMatch(/Reached|Working at it|Not arrived yet/);
    expect(screen.getByText(NOTHING_AT_ANY_LEVEL)).toBeInTheDocument();
  });
});

describe("MasteryByLevel - reading, beside the levels", () => {
  it("says At level, and Support needed, in the frame's words", () => {
    const { rerender, container } = render(
      <MasteryByLevel concept="Photosynthesis" levels={{ application: "working" }} reading="at" />,
    );
    expect(visibleText(container)).toMatch(/Reading level\s*At level/);

    rerender(<MasteryByLevel concept="Photosynthesis" levels={{ application: "working" }} reading="support" />);
    expect(visibleText(container)).toMatch(/Reading level\s*Support needed/);
  });

  it("is never one of the levels", () => {
    const { container } = render(
      <MasteryByLevel concept="Photosynthesis" levels={{ application: "working" }} reading="support" />,
    );
    expect(levelRows(container)).toEqual(["ApplicationWorking at it"]);
  });

  it("draws no row for none, for nothing observed, or for a value it does not know", () => {
    for (const reading of ["none", null, "toString"] as const) {
      const { container, unmount } = render(
        <MasteryByLevel concept="Photosynthesis" levels={{ application: "working" }} reading={reading as never} />,
      );
      expect(visibleText(container)).not.toMatch(/Reading level/);
      unmount();
    }
  });

  it("draws a concept met only in reading as nothing at any level, with its reading (b0bf27d)", () => {
    const { container } = render(<MasteryByLevel concept="Photosynthesis" levels={{}} reading="support" />);
    expect(screen.getByText(NOTHING_AT_ANY_LEVEL)).toBeInTheDocument();
    expect(visibleText(container)).toMatch(/Reading level\s*Support needed/);
  });
});
