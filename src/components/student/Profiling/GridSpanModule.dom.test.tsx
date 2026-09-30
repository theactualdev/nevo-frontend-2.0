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
