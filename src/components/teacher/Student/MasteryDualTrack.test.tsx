import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MasteryDualTrack } from "./MasteryDualTrack";

/**
 * One concept, two tracks: how well a child has understood it, and how much
 * the reading load is shaping that result.
 *
 * It used to make a judgement about a child in the strongest sense in the
 * console: "Reading support needed" is a label a teacher may act on for
 * months, and it was computed here from two numbers and a pair of invented
 * cutoffs. That is gone - see the component. SCRUM-38's text-only rule still
 * governs whatever label a payload eventually carries: words, never an alarm
 * colour.
 *
 * The values are read off the `progressbar` roles rather than the bar widths.
 * That is what a screen reader announces and what a teacher is actually being
 * told; a `width:` string is the styling that happens to express it.
 */

describe("MasteryDualTrack - what the numbers say", () => {
  it("reports both tracks as the teacher sees them", () => {
    render(
      <MasteryDualTrack concept="Equivalent fractions" understanding={72} reading={48} />,
    );
    expect(
      screen.getByRole("progressbar", { name: "Equivalent fractions - understanding" }),
    ).toHaveAttribute("aria-valuenow", "72");
    expect(
      screen.getByRole("progressbar", { name: "Equivalent fractions - reading level" }),
    ).toHaveAttribute("aria-valuenow", "48");
  });

  // Design's reference (12 Oct): no percentage scores in teacher copy. The
  // rail carries the proportion and the value reaches a screen reader through
  // the role, but no "72%" is printed beside a child's name.
  it("prints no percentage beside either rail", () => {
    const { container } = render(
      <MasteryDualTrack concept="Equivalent fractions" understanding={72} reading={48} />,
    );
    expect(container).not.toHaveTextContent(/%/);
    expect(container).not.toHaveTextContent(/72|48/);
  });

  it("clamps a value outside 0-100 rather than drawing past the rail", () => {
    render(<MasteryDualTrack concept="Fractions" understanding={140} reading={-20} />);
    expect(
      screen.getByRole("progressbar", { name: "Fractions - understanding" }),
    ).toHaveAttribute("aria-valuenow", "100");
    expect(
      screen.getByRole("progressbar", { name: "Fractions - reading level" }),
    ).toHaveAttribute("aria-valuenow", "0");
  });

  /*
   * THIS PINNED AN INVENTED VALUE. A missing measurement fell back to the
   * frame's example figures, 72 and 48, so a concept nobody had measured was
   * drawn as one a child had mostly understood - and this test asserted it.
   * Absence is an instruction: no bar at all.
   */
  it("draws no rail for a value that is not a number", () => {
    render(
      <MasteryDualTrack
        concept="Fractions"
        understanding={Number.NaN}
        reading={Number.NaN}
      />,
    );
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });
});

/*
 * SCRUM-200 (Lydia, 28 Oct): "the empty bar reads as zero, which is a claim we
 * have not earned." A null reached the bar as 0 and drew an empty rail. Her
 * sentence stands where the rail would be.
 */
describe("MasteryDualTrack - a concept with no estimate", () => {
  it("says not enough yet, once, and draws no rail, when neither is measured", () => {
    render(<MasteryDualTrack concept="Fractions" understanding={null} reading={null} />);

    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.getAllByText("Not enough yet to show this.")).toHaveLength(1);
    expect(screen.getByText("Fractions")).toBeInTheDocument();
  });

  it("draws the rail that was measured, and says not enough yet for the other", () => {
    render(<MasteryDualTrack concept="Fractions" understanding={60} reading={null} />);

    expect(
      screen.getByRole("progressbar", { name: "Fractions - understanding" }),
    ).toHaveAttribute("aria-valuenow", "60");
    expect(
      screen.queryByRole("progressbar", { name: "Fractions - reading level" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Not enough yet to show this.")).toBeInTheDocument();
  });

  it("still draws a real zero as a rail - a zero that arrived is not missing", () => {
    render(<MasteryDualTrack concept="Fractions" understanding={0} reading={0} />);

    expect(screen.getAllByRole("progressbar")).toHaveLength(2);
    expect(screen.queryByText("Not enough yet to show this.")).not.toBeInTheDocument();
  });
});

describe("MasteryDualTrack - the support label", () => {
  /*
   * THESE TESTS USED TO ASSERT THE OPPOSITE, and that is the point of the
   * change. Five of them pinned the computed labels - "Concept support
   * needed" at understanding 30 / reading 70, and so on - including one that
   * deliberately pinned the gap in the frame's own rules. They locked in a
   * verdict about a child that this codebase computed from cutoffs it
   * invented, on two live surfaces. A test that guards a breach makes the
   * breach harder to remove, which is exactly what happened here for a week.
   *
   * What is guarded now is that no number produces a word.
   */

  it("computes no label from the numbers, at any combination", () => {
    // The four cases that used to produce a label, plus the one that used to
    // produce nothing. None of them may say anything about the child now.
    for (const [u, r] of [
      [30, 70],
      [70, 30],
      [30, 30],
      [30, 50],
      [80, 80],
    ]) {
      const { unmount } = render(
        <MasteryDualTrack concept="Fractions" understanding={u} reading={r} />,
      );
      expect(
        screen.queryByText(/support|needed/i),
        `understanding ${u}, reading ${r}`,
      ).not.toBeInTheDocument();
      unmount();
    }
  });

  it("renders a label only when one is handed to it", () => {
    // The prop survives for the mastery rework design has open: when a label
    // has a source, it arrives as a payload rather than being derived here.
    render(
      <MasteryDualTrack
        concept="Fractions"
        understanding={30}
        reading={30}
        flag="Reviewed with SENCo"
      />,
    );
    expect(screen.getByText("Reviewed with SENCo")).toBeInTheDocument();
  });

  it('suppresses the label on the literal "none"', () => {
    // Kept as a distinct answer from saying nothing: a caller can state that
    // this row carries no label, rather than leaving it unset.
    render(
      <MasteryDualTrack
        concept="Fractions"
        understanding={30}
        reading={30}
        flag="none"
      />,
    );
    expect(screen.queryByText("none")).not.toBeInTheDocument();
  });

  it("still labels its bars when the row has no concept name", () => {
    // The component repeats down a panel where the concept may be the row
    // heading instead. The bars must stay announceable either way.
    render(<MasteryDualTrack concept="" understanding={60} reading={60} />);
    expect(screen.getByRole("progressbar", { name: "Understanding" })).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Reading level" })).toBeInTheDocument();
  });
});
