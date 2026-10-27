import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { PatternFlankerModule } from "./PatternFlankerModule";
import { BaselineCapture } from "@/lib/profiling/capture";

/**
 * The flanker is the attention measure, and it measured nothing.
 *
 * The centre arrow was a plain `<ArrowRight>` that nothing ever rotated, so
 * "Right" was the answer on all three trials of every run. A child who noticed
 * could stop looking entirely - which is the exact attention the task exists to
 * catch. And the pick carried only congruency, never whether the flankers had
 * captured them, so a wrong fast tap scored better in the vector than a right
 * considered one. On an interference measure that does not lose the finding, it
 * inverts it.
 *
 * These assert on the capture and on the rendered transform, because both were
 * wrong while the screen looked entirely correct.
 */

const picks = (capture: BaselineCapture, which: string) =>
  capture.stream
    .filter((e) => e.kind === "trial_pick")
    .map((e) => e.payload as Record<string, unknown>)
    .filter((p) => p.act === which);

/** Answer all three 2A trials to reach the flanker. */
function throughThePatterns() {
  for (let i = 0; i < 3; i++) {
    fireEvent.click(screen.getByText("Same"));
    act(() => void vi.advanceTimersByTime(500));
  }
}

/** How far the centre arrow is turned, in degrees. */
function centreRotation(): number {
  const arrows = document.querySelectorAll<SVGElement>(
    "svg.lucide-arrow-right",
  );
  // The centre is the one drawn at the heavier stroke weight.
  const centre = [...arrows].find(
    (a) => a.getAttribute("stroke-width") === "3",
  );
  const turn = /rotate\((-?\d+)deg\)/.exec(centre?.getAttribute("style") ?? "");
  return Number(turn?.[1] ?? 0);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("PatternFlankerModule", () => {
  it("does not point the arrow the same way every trial", () => {
    // The regression. Three trials, and the answer used to be Right on all of
    // them, in every run, for every child.
    render(<PatternFlankerModule band="p46" onComplete={() => {}} />);
    throughThePatterns();

    const seen: number[] = [];
    for (let i = 0; i < 3; i++) {
      seen.push(centreRotation());
      fireEvent.click(screen.getByLabelText("Right"));
      act(() => void vi.advanceTimersByTime(500));
    }

    expect(new Set(seen).size).toBeGreaterThan(1);
  });

  it("records whether the flankers caught a child", () => {
    const capture = new BaselineCapture("flanker");
    render(
      <PatternFlankerModule
        band="p46"
        capture={capture}
        onComplete={() => {}}
      />,
    );
    throughThePatterns();

    // Trial 1 is congruent and points right; answer it correctly.
    fireEvent.click(screen.getByLabelText("Right"));
    act(() => void vi.advanceTimersByTime(500));
    // Trial 2 is incongruent and points LEFT - the trial the flankers exist to
    // spoil. Answer it the way a captured child would.
    fireEvent.click(screen.getByLabelText("Right"));

    expect(picks(capture, "flanker").map((p) => p.correct)).toEqual([
      true,
      false,
    ]);
  });

  it("scores the pattern half too", () => {
    const capture = new BaselineCapture("pattern");
    render(
      <PatternFlankerModule
        band="p46"
        capture={capture}
        onComplete={() => {}}
      />,
    );
    // Trial 1 shows a different pair, so "Different" is right.
    fireEvent.click(screen.getByText("Different"));

    expect(picks(capture, "pattern")[0]).toMatchObject({ correct: true });
  });

  it("turns the single P1-3 arrow as well", () => {
    // P1-3 sees only the centre arrow - no flankers to ignore. If the target
    // stopped moving for them the activity would have no question in it at all.
    render(<PatternFlankerModule band="p13" onComplete={() => {}} />);
    throughThePatterns();

    fireEvent.click(screen.getByLabelText("Right"));
    act(() => void vi.advanceTimersByTime(500));

    expect(centreRotation()).toBe(180);
  });
});

describe("PatternFlankerModule — each band's own trials", () => {
  /*
   * One congruent/incongruent list ran for every band. JSS and SS never saw
   * the neutral trial their frame draws, and P1-3 - shown the centre arrow
   * alone - had "incongruent" recorded against trials with no flankers at all.
   */
  const flankerPicks = (band: "p13" | "jss") => {
    const capture = new BaselineCapture(`fl-${band}`);
    render(
      <PatternFlankerModule
        band={band}
        capture={capture}
        onComplete={() => {}}
      />,
    );
    throughThePatterns();
    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByLabelText("Right"));
      act(() => void vi.advanceTimersByTime(500));
    }
    return picks(capture, "flanker");
  };

  it("records no congruency for P1-3, which has no flankers", () => {
    const p13 = flankerPicks("p13");

    expect(p13).toHaveLength(3);
    for (const p of p13) expect(p).not.toHaveProperty("congruency");
  });

  it("shows JSS the neutral trial its frame draws", () => {
    expect(flankerPicks("jss").map((p) => p.congruency)).toEqual([
      "congruent",
      "incongruent",
      "neutral",
    ]);
  });

  it("keeps P4-6 on the prototype's own list", () => {
    const capture = new BaselineCapture("fl-p46");
    render(
      <PatternFlankerModule
        band="p46"
        capture={capture}
        onComplete={() => {}}
      />,
    );
    throughThePatterns();
    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByLabelText("Right"));
      act(() => void vi.advanceTimersByTime(500));
    }

    expect(picks(capture, "flanker").map((p) => p.congruency)).toEqual([
      "congruent",
      "incongruent",
      "incongruent",
    ]);
  });
});

describe("PatternFlankerModule — each band's own sizes", () => {
  /*
   * 180px cards, 56px buttons and a 50px arrow for everyone. The frames give
   * P1-3 200 / 64 / 64 and step down by band.
   */
  const card = () =>
    [...document.querySelectorAll<HTMLElement>("div")].find((d) =>
      d.className.includes("h-[150px] w-[300px]"),
    )!;

  it("gives P1-3 the largest cards and buttons", () => {
    render(<PatternFlankerModule band="p13" onComplete={() => {}} />);

    expect(card().className).toContain("sm:size-[200px]");
    expect(screen.getByText("Same").className).toContain("h-16");
  });

  it("gives SS the smallest cards", () => {
    render(<PatternFlankerModule band="ss" onComplete={() => {}} />);

    expect(card().className).toContain("sm:size-[140px]");
    expect(screen.getByText("Same").className).toContain("sm:w-[140px]");
    // A 150px floor outranked the 140px the frame draws.
    expect(screen.getByText("Same").className).not.toMatch(/min-w-/);
  });

  it("draws the P1-3 arrow at 64px from tablet up", () => {
    render(<PatternFlankerModule band="p13" onComplete={() => {}} />);
    throughThePatterns();

    const centre = document.querySelector(
      'svg.lucide-arrow-right[stroke-width="3"]',
    )!;
    expect(centre.getAttribute("class")).toContain("sm:size-[64px]");
    expect(screen.getByLabelText("Right").className).toContain("sm:h-20");
  });
});

describe("PatternFlankerModule — a new trial paints clean", () => {
  /*
   * The buttons eased their colour over 150ms, and the same button carries on
   * into the next trial - so the last answer's violet faded out over a fresh
   * trial. The frames move only the scale (`.pm-tap`, `.fl-tap`).
   */
  const easesColour = /transition-(colors|all)|transition-\[[^\]]*(background|border|color)/;

  it("draws the next pair's buttons unpressed, with no colour to fade", () => {
    render(<PatternFlankerModule band="p46" onComplete={() => {}} />);
    fireEvent.click(screen.getByText("Same"));
    expect(screen.getByText("Same").className).toContain("bg-nevo-violet");

    act(() => void vi.advanceTimersByTime(500));

    for (const label of ["Same", "Different"]) {
      const b = screen.getByText(label);
      expect(b.className).toContain("bg-nevo-cream");
      expect(b.className).not.toMatch(easesColour);
    }
  });

  it("does the same for the arrows", () => {
    render(<PatternFlankerModule band="p46" onComplete={() => {}} />);
    throughThePatterns();

    for (const label of ["Left", "Right"])
      expect(screen.getByLabelText(label).className).not.toMatch(easesColour);
  });
});

describe("PatternFlankerModule — where a tap landed", () => {
  it("records the coordinates with the pick", () => {
    const capture = new BaselineCapture("fl-coords");
    render(
      <PatternFlankerModule
        band="p46"
        capture={capture}
        onComplete={() => {}}
      />,
    );

    fireEvent.click(screen.getByText("Different"), {
      detail: 1,
      clientX: 33.5,
      clientY: 610,
    });

    expect(picks(capture, "pattern")[0]).toMatchObject({ x: 33.5, y: 610 });
  });
});

/*
 * 2C, WORD CONFLICT, SS ONLY (Lydia, 26-27 Oct; design 534ba31). After 2B the
 * word says LEFT or RIGHT, the arrow agrees or not, and the child taps what
 * the word says. Forty trials - eight practice, thirty-two scored - each
 * recorded as `inhibition` with its condition. SS's 2B flankers are no longer
 * violet: that is the condition 2C replaces.
 */
describe("Word Conflict, after 2B, for SS alone", () => {
  /** Through 2A and 2B, to the first Word Conflict trial. */
  const toTheWords = () => {
    throughThePatterns();
    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByLabelText("Right"));
      act(() => void vi.advanceTimersByTime(500));
    }
  };
  const shown = () => {
    const card = screen.getByTestId("word-conflict");
    return {
      word: card.querySelector("p")!.textContent,
      arrow: card.querySelector("svg")!.getAttribute("data-arrow"),
    };
  };

  it("asks what the word says, with the word over an arrow", () => {
    render(<PatternFlankerModule band="ss" onComplete={() => {}} />);
    toTheWords();

    expect(
      screen.getByText("Tap what the word says, not the way the arrow points."),
    ).toBeTruthy();
    expect(["LEFT", "RIGHT"]).toContain(shown().word);
    expect(["left", "right"]).toContain(shown().arrow);
    expect(screen.getByRole("button", { name: "Left" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Right" })).toBeTruthy();
  });

  it("runs forty trials and records each as inhibition, matched against the word", () => {
    const capture = new BaselineCapture("conflict");
    const done = vi.fn();
    render(<PatternFlankerModule band="ss" capture={capture} onComplete={done} />);
    toTheWords();

    const asked: { word: string | null; arrow: string | null }[] = [];
    for (let i = 0; i < 40; i++) {
      asked.push(shown());
      // Always Left: right on a LEFT trial, wrong on a RIGHT one.
      fireEvent.click(screen.getByRole("button", { name: "Left" }));
      act(() => void vi.advanceTimersByTime(500));
    }
    act(() => void vi.advanceTimersByTime(2000));

    const words = picks(capture, "inhibition");
    expect(words).toHaveLength(40);
    expect(words.map((p) => p.correct)).toEqual(
      asked.map((a) => a.word === "LEFT"),
    );
    expect(words.every((p) => p.chosenOption === "left")).toBe(true);
    // Eight practice first, marked so, then the thirty-two unmarked.
    expect(words.slice(0, 8).every((p) => p.practice === true)).toBe(true);
    expect(words.slice(8).some((p) => "practice" in p)).toBe(false);
    expect(
      words.slice(8).map((p) => p.congruency).filter((c) => c === "congruent"),
    ).toHaveLength(16);
    expect(
      words.slice(8).map((p) => p.congruency).filter((c) => c === "incongruent"),
    ).toHaveLength(16);
    // The arrow disagrees exactly on the incongruent ones.
    words.slice(8).forEach((p) =>
      expect(p.word === p.arrow).toBe(p.congruency === "congruent"),
    );
    expect(done).toHaveBeenCalledTimes(1);
  }, 30_000);

  it("says nothing about whether a tap matched", () => {
    render(<PatternFlankerModule band="ss" onComplete={() => {}} />);
    toTheWords();

    fireEvent.click(screen.getByRole("button", { name: "Right" }));

    expect(document.body.textContent).not.toMatch(/correct|wrong|right!|try again|well done/i);
  });

  it.each(["p13", "p46", "jss"] as const)("is not run for %s", (band) => {
    const done = vi.fn();
    render(<PatternFlankerModule band={band} onComplete={done} />);
    throughThePatterns();
    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByLabelText("Right"));
      act(() => void vi.advanceTimersByTime(500));
    }
    act(() => void vi.advanceTimersByTime(2000));

    expect(screen.queryByTestId("word-conflict")).toBeNull();
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("draws SS's 2B flankers grey, no longer violet", () => {
    render(<PatternFlankerModule band="ss" onComplete={() => {}} />);
    throughThePatterns();

    const flankers = [
      ...document.querySelectorAll<SVGElement>("svg.lucide-arrow-right"),
    ].filter((a) => a.getAttribute("stroke-width") === "2.6" && !a.closest("button"));
    expect(flankers.length).toBeGreaterThan(0);
    for (const f of flankers) {
      expect(f.getAttribute("class")).not.toContain("text-nevo-violet");
      expect(f.getAttribute("class")).toContain("text-nevo-near-black/40");
    }
  });
});
