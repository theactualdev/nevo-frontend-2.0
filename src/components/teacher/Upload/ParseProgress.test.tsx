import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PARSE_STAGES, ParseProgress, rungFor } from "./ParseProgress";

/**
 * The parse ladder, and the rule design gave it: "never draw a rung the backend
 * doesn't report."
 *
 * It had FOUR rungs, invented to match C07e's drawing, driven by a mock clock.
 * `UploadStage` reports THREE - `lessons | structure | complete`. So a teacher
 * watched a four-step story about a three-step process, and on the live path
 * never saw the ladder at all: a real upload id routed to a plain spinner,
 * because there was no honest way to map three values onto four rungs.
 *
 * `rungFor` is where that rule lives, so it is what these pin. The labels are
 * design's own words, asserted verbatim: getting them approximately right is
 * the failure mode nobody notices.
 */

describe("rungFor", () => {
  it("places each reported stage, in the order the backend reports them", () => {
    expect(rungFor("lessons")).toBe(0);
    expect(rungFor("structure")).toBe(1);
    expect(rungFor("complete")).toBe(2);
  });

  it("treats `complete` as a rung, not as the ladder resolving", () => {
    // This was the ambiguity in the ruling, and design settled it: `complete`
    // is reported, so it ticks like the others. If it ever stops being a rung
    // this test should be the thing that objects.
    expect(PARSE_STAGES).toHaveLength(3);
    expect(PARSE_STAGES[2].stage).toBe("complete");
  });

  it("refuses to place a stage it does not recognise", () => {
    // -1 sends the wizard to the spinner. Guessing at a rung would tell a
    // teacher where their upload is on no evidence at all.
    expect(rungFor(undefined)).toBe(-1);
    expect(rungFor(null)).toBe(-1);
    expect(rungFor("some_future_stage" as never)).toBe(-1);
  });

  it("holds the adaptations stage on the segments rung, not off the ladder", () => {
    /*
     * The wizard renders this ladder only while `rungFor(...) >= 0`. For as
     * long as `adaptations` answered -1, a real upload drew the ladder,
     * reached the second rung, and then had the whole ladder replaced by a
     * bare spinner - through the longest part of the wait, which is the exact
     * reading of "the product has hung" the ladder exists to prevent.
     *
     * It holds rather than gaining a rung: a fourth rung is design's to rule
     * on, and "never draw a rung the backend doesn't report" was their words.
     */
    expect(rungFor("adaptations")).toBe(rungFor("structure"));
    expect(rungFor("adaptations")).toBeGreaterThanOrEqual(0);
  });

  it("carries design's labels verbatim", () => {
    expect(PARSE_STAGES.map((s) => s.label)).toEqual([
      "Reading your upload",
      "Breaking it into segments",
      "Ready to review",
    ]);
  });
});

describe("the ladder", () => {
  it("draws exactly the rungs the backend reports, and no more", () => {
    render(<ParseProgress stage={0} />);

    for (const s of PARSE_STAGES) {
      expect(screen.getAllByText(s.label).length).toBeGreaterThan(0);
    }
    // The four invented rungs are gone. Naming one that used to exist is the
    // cheapest guard against the old list creeping back.
    expect(screen.queryByText("Writing the recaps and previews")).not.toBeInTheDocument();
    expect(screen.queryByText("Finding the lessons")).not.toBeInTheDocument();
  });

  it("leads with the stage the upload is actually on", () => {
    render(<ParseProgress stage={1} />);

    expect(screen.getAllByText("Breaking it into segments").length).toBeGreaterThan(0);
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
    // The old Link rendered unconditionally, which is how a control came to
    // point at a fixture.
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

    // EVERY done rung carries one - the component's own docblock: "as soon as
    // a level is identified the teacher can open it and start steering while
    // later levels run". At stage 2 more than one rung is done, which is why
    // this reads all of them rather than one.
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

    // Rung 0 is active, not done - there is no identified level to steer yet.
    expect(
      screen.queryAllByRole("button", { name: /open and steer/i }),
    ).toHaveLength(0);
  });
});
