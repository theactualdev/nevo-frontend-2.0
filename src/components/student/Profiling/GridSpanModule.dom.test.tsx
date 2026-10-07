import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { GridSpanModule } from "./GridSpanModule";
import { gridSpanConfig } from "@/lib/profiling/bands";
import { BaselineCapture } from "@/lib/profiling/capture";

/**
 * The SS band's dual task recorded which button was pressed and nothing about
 * whether it was right - and `reduceGridSpan` never read the event at all, so
 * the one thing distinguishing the SS baseline reached the vector in no form.
 *
 * That is worse than a missing field. A dual task works by imposing load while
 * the sequence is held; a child who taps True at every check is pressing a
 * button, not carrying load, and unmarked they looked identical to one who did
 * both.
 *
 * THE DUAL TASK ITSELF IS A DESIGN RULING (30 Sep 2026): it is drawn in neither
 * the Grid Span frame nor the prototype, and design approved it as built after
 * QA reported it as broken. These tests failing because it was removed means
 * the ruling was missed, not that the frames won.
 */

const checks = (capture: BaselineCapture) =>
  capture.stream
    .filter((e) => e.kind === "check_answer")
    .map((e) => e.payload as Record<string, unknown>);

/** Run the playback out so the check appears. */
const watchItPlay = () => act(() => void vi.advanceTimersByTime(10_000));

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GridSpanModule — the SS dual task", () => {
  it("records whether a child read the check", () => {
    const capture = new BaselineCapture("g1");
    render(
      <GridSpanModule
        config={gridSpanConfig("ss")}
        capture={capture}
        onComplete={() => {}}
      />,
    );
    watchItPlay();

    // "7 + 5 = 13" is false, and False is the answer.
    expect(screen.getByText("7 + 5 = 13")).toBeVisible();
    fireEvent.click(screen.getByText("False"));

    expect(checks(capture)[0]).toMatchObject({ correct: true });
  });

  it("records a child who just pressed True", () => {
    // The exact shape a dual task exists to catch, and the one that used to be
    // indistinguishable from doing the work.
    const capture = new BaselineCapture("g2");
    render(
      <GridSpanModule
        config={gridSpanConfig("ss")}
        capture={capture}
        onComplete={() => {}}
      />,
    );
    watchItPlay();

    fireEvent.click(screen.getByText("True"));

    expect(checks(capture)[0]).toMatchObject({ correct: false });
  });

  it("shows the child nothing either way", () => {
    // "No timers, no scores, no red" - marking is for the vector, never for
    // them. Answering moves straight on to the recall.
    render(
      <GridSpanModule config={gridSpanConfig("ss")} onComplete={() => {}} />,
    );
    watchItPlay();
    fireEvent.click(screen.getByText("True"));

    expect(screen.getByText("Now tap them in reverse")).toBeVisible();
    expect(screen.queryByText("True")).toBeNull();
  });

  it("runs no check at all for the other bands", () => {
    render(
      <GridSpanModule config={gridSpanConfig("p46")} onComplete={() => {}} />,
    );
    watchItPlay();

    expect(screen.queryByText("Is this true or false?")).toBeNull();
    expect(screen.getByText("Now tap them in reverse")).toBeVisible();
  });
});

describe("GridSpanModule — each band's own span and pace", () => {
  /*
   * Every band ran the Primary 4-6 prototype's numbers: span from 3, a 660ms
   * highlight. The Module 1 frame gives P1-3 "2 → 5 · 800ms" and JSS
   * "4 → 9 · 600ms", and a six-year-old and a fourteen-year-old should not be
   * handed the same first round.
   */
  const firstPlayback = (band: "p13" | "p46" | "jss" | "ss") => {
    const capture = new BaselineCapture(`span-${band}`);
    render(
      <GridSpanModule
        config={gridSpanConfig(band)}
        capture={capture}
        onComplete={() => {}}
      />,
    );
    act(() => void vi.advanceTimersByTime(1));
    return capture.stream.find((e) => e.kind === "playback_start")?.payload;
  };

  it("starts P1-3 at two tiles, lit for 800ms", () => {
    expect(firstPlayback("p13")).toMatchObject({ length: 2, litMs: 800 });
  });

  it("starts JSS at four tiles, lit for 600ms", () => {
    expect(firstPlayback("jss")).toMatchObject({ length: 4, litMs: 600 });
  });

  it("starts SS at four tiles, lit for 600ms (D73)", () => {
    // It ran the prototype's 660 while the frame stated no time for SS.
    expect(firstPlayback("ss")).toMatchObject({ length: 4, litMs: 600 });
  });

  it("starts P4-6 at three tiles, lit for 700ms (D72)", () => {
    // Design settled the frame over the prototype's 660 on 6 Oct.
    expect(firstPlayback("p46")).toMatchObject({ length: 3, litMs: 700 });
  });

  it("takes the ceilings from the frame too", () => {
    expect(gridSpanConfig("p13").spanMax).toBe(5);
    expect(gridSpanConfig("p46").spanMax).toBe(7);
    expect(gridSpanConfig("jss").spanMax).toBe(9);
    expect(gridSpanConfig("ss").spanMax).toBe(9);
  });
});

describe("GridSpanModule — after a miss (D74)", () => {
  /*
   * Every band slowed the replay after a miss, by the prototype's 300ms lit
   * and 120ms gap per miss, up to three. Design's 6 Oct ruling is "No, for
   * every band": slowing the presentation after misses changes what is being
   * measured, and keeps the baselines from being comparable. Two misses in a
   * row, so a slowing that only starts at the second would be caught too.
   */
  const playbacksAroundTwoMisses = (band: "p13" | "p46" | "jss" | "ss") => {
    // Math.random at 0 lights tiles 0, 1, 2... in order, so the first tile
    // to tap back is the last one lit and tile 0 is always a miss.
    vi.spyOn(Math, "random").mockReturnValue(0);
    const capture = new BaselineCapture(`miss-${band}`);
    render(
      <GridSpanModule
        config={gridSpanConfig(band)}
        capture={capture}
        onComplete={() => {}}
      />,
    );
    for (let miss = 0; miss < 2; miss++) {
      watchItPlay();
      if (band === "ss") fireEvent.click(screen.getByText("False"));
      fireEvent.click(screen.getAllByRole("button", { hidden: true })[0]);
      act(() => void vi.advanceTimersByTime(2_000));
    }
    return capture.stream
      .filter((e) => e.kind === "playback_start")
      .map((e) => e.payload);
  };

  afterEach(() => vi.restoreAllMocks());

  it.each(["p13", "p46", "jss", "ss"] as const)(
    "replays %s at the pace it first played, however many misses",
    (band) => {
      const playbacks = playbacksAroundTwoMisses(band);

      expect(playbacks).toHaveLength(3);
      expect(playbacks[1]).toEqual(playbacks[0]);
      expect(playbacks[2]).toEqual(playbacks[0]);
      expect(playbacks[0]).toMatchObject({ litMs: gridSpanConfig(band).litMs });
    },
  );
});

describe("GridSpanModule — where a tap landed", () => {
  it("records the coordinates of a tile tap", () => {
    const capture = new BaselineCapture("coords");
    render(
      <GridSpanModule
        config={gridSpanConfig("p46")}
        capture={capture}
        onComplete={() => {}}
      />,
    );
    watchItPlay();

    fireEvent.click(screen.getAllByRole("button", { hidden: true })[0], {
      detail: 1,
      clientX: 101.5,
      clientY: 202.25,
    });

    const tap = capture.stream.find((e) => e.kind === "tap")?.payload;
    expect(tap).toMatchObject({ x: 101.5, y: 202.25 });
  });
});
