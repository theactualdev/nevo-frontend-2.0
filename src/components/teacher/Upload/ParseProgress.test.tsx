import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PARSE_STAGES, ParseProgress, parseLine, rungFor } from "./ParseProgress";

/**
 * The unit's progress ladder (C07e), and the rule design gave it: "never draw
 * a rung the backend doesn't report."
 *
 * Lydia, 9 Nov (item 5): four steps, each standing behind something the server
 * does - "Finding the lessons / Finding the sections in each lesson /
 * Preparing the adaptations / Ready for your review, with the running step's
 * present-tense line beneath it". The labels are asserted verbatim: getting
 * them approximately right is the failure mode nobody notices.
 */

describe("rungFor", () => {
  it("places each reported stage, in the order the backend reports them", () => {
    expect(rungFor("lessons")).toBe(0);
    expect(rungFor("structure")).toBe(1);
    expect(rungFor("adaptations")).toBe(2);
    expect(rungFor("complete")).toBe(3);
  });

  it("gives the adaptations their own rung, as Lydia accepted", () => {
    // It used to hold on the sections rung, while a fourth rung waited on a
    // ruling. The work is real - pictures, narration and the depth rewrites -
    // and the server names it.
    expect(rungFor("adaptations")).not.toBe(rungFor("structure"));
    expect(PARSE_STAGES).toHaveLength(4);
    expect(PARSE_STAGES[3].stage).toBe("complete");
  });

  it("refuses to place a stage it does not recognise", () => {
    // -1 sends the wizard to the spinner. Guessing at a rung would tell a
    // teacher where their upload is on no evidence at all.
    expect(rungFor(undefined)).toBe(-1);
    expect(rungFor(null)).toBe(-1);
    expect(rungFor("some_future_stage" as never)).toBe(-1);
  });

  it("carries Lydia's labels verbatim - Ready FOR YOUR review", () => {
    expect(PARSE_STAGES.map((s) => s.label)).toEqual([
      "Finding the lessons",
      "Finding the sections in each lesson",
      "Preparing the adaptations",
      "Ready for your review",
    ]);
  });
});

describe("the ladder", () => {
  it("draws exactly the rungs the backend reports, and no more", () => {
    render(<ParseProgress stage={0} />);

    for (const s of PARSE_STAGES) {
      expect(screen.getAllByText(s.label).length).toBeGreaterThan(0);
    }
    // C07e's two steps with nothing behind them stay off the ladder.
    expect(screen.queryByText(/Splitting sections into segments/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Writing the recaps and previews/)).not.toBeInTheDocument();
  });

  it("says the running step in the present tense, under the spinner", () => {
    render(<ParseProgress stage={1} />);

    expect(screen.getByRole("status")).toHaveTextContent("Finding the sections in each lesson…");
  });

  it("moves the line on with the ladder, and is announced when it does", () => {
    const { rerender } = render(<ParseProgress stage={1} />);
    rerender(<ParseProgress stage={2} />);

    expect(screen.getByRole("status")).toHaveTextContent("Preparing the adaptations…");
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });

  it("drops the ellipsis once nothing is still running", () => {
    render(<ParseProgress stage={3} />);

    expect(screen.getByRole("status")).toHaveTextContent(/^Ready for your review$/);
  });

  it("only ever names a step the ladder draws", () => {
    PARSE_STAGES.forEach((s, i) => expect(parseLine(i).replace(/…$/, "")).toBe(s.label));
  });

  it("does not crash on a rung index past the end", () => {
    // Defensive: the wizard gates on `rungFor(...) >= 0`, but a stage arriving
    // out of range must not take the screen down mid-upload.
    expect(() => render(<ParseProgress stage={9} />)).not.toThrow();
  });
});

/**
 * "Open and steer", and the route it used to point at.
 *
 * It was a `<Link>` to `/teacher/lessons/upload/structure`, a standalone route
 * this repo invented - C07e draws the control as a BUTTON. That route served a
 * hardcoded P5 Science fixture to signed-in teachers and, clicked mid-parse,
 * discarded the in-flight poll: `useStagedUpload` state lives in the wizard and
 * that page mounted a component with no API client at all.
 *
 * The route is deleted. The control is now a callback, so the wizard hands it
 * its own structure tree, and a rung with nowhere to go offers nothing.
 */
describe("open and steer", () => {
  it("offers nothing when the caller has nowhere to send them", () => {
    render(<ParseProgress stage={2} />);

    expect(
      screen.queryByRole("button", { name: /open and steer/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /open and steer/i }),
    ).not.toBeInTheDocument();
  });

  it("is a button, not a link, and calls back", () => {
    const onSteer = vi.fn();
    render(<ParseProgress stage={2} onSteer={onSteer} />);

    // EVERY done rung carries one: at stage 2 more than one rung is done.
    const controls = screen.getAllByRole("button", { name: /open and steer/i });
    expect(controls.length).toBeGreaterThan(1);

    fireEvent.click(controls[0]);
    expect(onSteer).toHaveBeenCalledTimes(1);

    for (const c of controls) {
      expect(c).not.toHaveAttribute("href");
    }
  });

  it("offers it only on a rung that is done", () => {
    const onSteer = vi.fn();
    render(<ParseProgress stage={0} onSteer={onSteer} />);

    expect(
      screen.queryAllByRole("button", { name: /open and steer/i }),
    ).toHaveLength(0);
  });
});

/**
 * THE SERVER'S CURRENT NAMES (live spec). Each must land on the rung its older
 * name has, or a live unit's ladder is a spinner for the whole wait.
 */
describe("rungFor, on the stage names the server sends now", () => {
  it("places each on the rung its older name has", () => {
    expect(rungFor("receiving_file")).toBe(0);
    expect(rungFor("reading_document")).toBe(0);
    expect(rungFor("finding_sections")).toBe(1);
    expect(rungFor("preparing_adaptations")).toBe(2);
    expect(rungFor("ready_to_assign")).toBe(3);
  });
});
