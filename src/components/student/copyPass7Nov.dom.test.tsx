import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { ThrottleNote, pauseLength } from "./Auth/ThrottledPause";
import { BreakOfferPill } from "./Lesson/BreakOfferPill";
import { SEVERAL_CHECKS_LINES, severalChecksLine } from "./Lesson/QuickCheckSheet";

/**
 * LYDIA'S COPY PASS, PART TWO (7 Nov): the student lines, exactly.
 */

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("a PIN pause, once the server says when it ends", () => {
  it("says when, rounded up, and only when the server said", () => {
    render(<ThrottleNote until={Date.now() + 20_000} />);
    expect(screen.getByRole("status")).toHaveTextContent("Try again in a minute.");
    cleanup();

    render(<ThrottleNote until={Date.now() + 4 * 60_000 + 1_000} />);
    expect(screen.getByRole("status")).toHaveTextContent("Try again in 5 minutes.");
    cleanup();

    // No retry time: as before, no number.
    render(<ThrottleNote />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Let's wait a little before trying again.",
    );
  });

  it("says it once, never a countdown", () => {
    vi.useFakeTimers();
    render(<ThrottleNote until={Date.now() + 3 * 60_000} />);
    const said = screen.getByRole("status").textContent;
    act(() => {
      vi.advanceTimersByTime(2 * 60_000);
    });
    expect(screen.getByRole("status").textContent).toBe(said);
  });

  it("rounds a wait up to the minute", () => {
    expect(pauseLength(1)).toBe("a minute");
    expect(pauseLength(60)).toBe("a minute");
    expect(pauseLength(61)).toBe("2 minutes");
  });
});

describe("several checks in one section, without a count", () => {
  it("is her three lines, for any number of checks", () => {
    expect(severalChecksLine({ at: 1, of: 2 })).toBe(SEVERAL_CHECKS_LINES.first);
    expect(severalChecksLine({ at: 2, of: 2 })).toBe(SEVERAL_CHECKS_LINES.last);
    expect([2, 3, 4].map((at) => severalChecksLine({ at, of: 5 }))).toEqual([
      "Still going.",
      "Still going.",
      "Still going.",
    ]);
    expect(severalChecksLine({ at: 5, of: 5 })).toBe(
      "Last quick check for this section.",
    );
    expect(Object.values(SEVERAL_CHECKS_LINES).join(" ")).not.toMatch(/\d/);
  });
});

describe("the break offer, for the server's other kinds", () => {
  const offered = (kind: string) => {
    vi.useFakeTimers();
    render(<BreakOfferPill kind={kind} onAccept={() => {}} onDismiss={() => {}} />);
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
  };

  it("says Lydia's line for a movement break", () => {
    offered("movement");
    expect(screen.getByText("Stand up and stretch for a moment.")).toBeInTheDocument();
  });

  it("says Lydia's line for a consolidation break", () => {
    offered("consolidation");
    expect(screen.getByText("Let's go back over what you just did.")).toBeInTheDocument();
  });

  it("keeps the pill's own line for the rest", () => {
    offered("micro");
    expect(screen.getByText("Want a break?")).toBeInTheDocument();
  });
});
