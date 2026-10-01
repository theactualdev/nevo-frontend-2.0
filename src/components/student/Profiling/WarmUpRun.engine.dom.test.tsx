import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WarmUpRun, dimensionForToday } from "./WarmUpRun";
import type { WarmUpPrompt } from "@/hooks/useWarmUpDimension";

/**
 * THE WARM-UP RUNS WHAT THE ENGINE ASKED FOR, OR NOTHING.
 *
 * It started every run on a weekday rotation and swapped to the engine's
 * answer if one came: a failed or slow prompt ran a task nobody asked for and
 * submitted it as a measurement. The day's question was one fixture for every
 * child, marked on the device. A withdrawn guardian's child was frozen on the
 * last task. And the tile task let a child guess for ever.
 *
 * These assert on what is submitted where that is what was wrong, and on the
 * screen where the child was stuck.
 */

const { submit } = vi.hoisted(() => ({ submit: vi.fn() }));
vi.mock("@/lib/api", () => ({ baselineApi: { submitWithRetry: submit } }));
const { holdBaseline } = vi.hoisted(() => ({ holdBaseline: vi.fn() }));
vi.mock("@/lib/profiling/pendingBaseline", () => ({ holdBaseline }));

const engine = vi.hoisted(() => ({
  prompt: { state: "waiting" } as WarmUpPrompt,
}));
vi.mock("@/hooks/useWarmUpDimension", () => ({
  useWarmUpPrompt: () => engine.prompt,
}));

const consent = vi.hoisted(() => ({ withdrawn: false }));
vi.mock("@/hooks/useConsentGate", () => ({
  useConsentGate: () => ({ withdrawn: consent.withdrawn, known: true }),
}));

vi.mock("@/hooks/useNextLessonHref", () => ({
  useNextLessonHref: () => "/student/lessons/x",
}));
const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

const submitted = () => submit.mock.calls[0][1][0];
const settle = async (ms = 1000) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};
const lessonButton = () =>
  screen.getByRole("button", { name: /Start today's lesson/i });

beforeEach(() => {
  vi.useFakeTimers();
  submit.mockReset();
  submit.mockResolvedValue(true);
  holdBaseline.mockReset();
  push.mockReset();
  consent.withdrawn = false;
  engine.prompt = { state: "waiting" };
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("WarmUpRun — without the engine's answer", () => {
  it("runs no task while the prompt is on its way", () => {
    render(<WarmUpRun />);

    expect(screen.queryByText(/Watch the tiles|Same, or different/)).toBeNull();
    expect(screen.queryAllByRole("button")).toHaveLength(1);
  });

  it("runs no task, and submits nothing, when the engine names none", async () => {
    // The rotation used to run here, and its result went to the engine as a
    // measurement the engine never asked for.
    engine.prompt = { state: "none" };
    render(<WarmUpRun />);
    await settle(5000);

    expect(screen.queryAllByRole("button")).toHaveLength(1);
    expect(submit).not.toHaveBeenCalled();
    expect(holdBaseline).not.toHaveBeenCalled();
  });

  it("still leaves the child a way into their day", () => {
    // Full-screen, no nav: without this the screen would be a dead end.
    engine.prompt = { state: "none" };
    render(<WarmUpRun />);

    fireEvent.click(lessonButton());

    expect(push).toHaveBeenCalledWith("/student/lessons/x");
  });
});

describe("WarmUpRun — the question the engine served", () => {
  const served: WarmUpPrompt = {
    state: "ready",
    dimension: "domain",
    live: true,
    item: {
      itemId: "item-7",
      question: "What is 7 times 8?",
      options: [
        { value: "opt-a", label: "54" },
        { value: "opt-b", label: "56" },
        { value: "opt-c", label: "58" },
      ],
    },
  };

  it("asks it, rather than the fixture", () => {
    engine.prompt = served;
    render(<WarmUpRun />);

    expect(screen.getByText("What is 7 times 8?")).toBeInTheDocument();
    expect(screen.queryByText(/two-thirds/i)).toBeNull();
  });

  it("does not claim it is from today's lesson", () => {
    // No field says so about a served item.
    engine.prompt = served;
    render(<WarmUpRun />);

    expect(screen.queryByText(/today's lesson\./i)).toBeNull();
  });

  it("sends which option was picked, and marks nothing", async () => {
    engine.prompt = served;
    render(<WarmUpRun />);

    fireEvent.click(screen.getByText("56"));
    await settle();

    expect(submitted().item).toEqual({
      itemId: "item-7",
      chosenOption: "opt-b",
    });
    // No answer key is used on the device, so nothing was scored.
    expect(submitted().acts.domain).toMatchObject({
      trials: 1,
      scored: 0,
      accuracy: null,
    });
  });
});

describe("WarmUpRun — a withdrawn guardian", () => {
  it("reaches the done state instead of freezing on the task", async () => {
    consent.withdrawn = true;
    render(<WarmUpRun dimension="attention" />);

    fireEvent.click(screen.getByText("Right"));
    await settle();

    expect(screen.getByText(/That's it for today/)).toBeInTheDocument();
    expect(lessonButton()).toBeInTheDocument();
  });

  it("neither sends anything nor says it was saved", async () => {
    consent.withdrawn = true;
    render(<WarmUpRun dimension="attention" />);

    fireEvent.click(screen.getByText("Right"));
    await settle();

    expect(submit).not.toHaveBeenCalled();
    expect(holdBaseline).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toMatch(/saved|couldn't save/i);
  });
});

describe("WarmUpRun — the tile task, as tile memory does it", () => {
  /*
   * `Math.random` pinned to 0 draws tiles 0, 1, 2; tile 15 is never in it.
   * Each playback runs well inside 4s.
   */
  const WRONG = 15;
  const renderTheTileTask = () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    render(<WarmUpRun dimension="wmc" />);
    random.mockRestore();
  };
  const watchAndPickAWrongTile = async () => {
    await settle(4000);
    return WRONG;
  };

  it("plays the same pattern again after a wrong tap", async () => {
    renderTheTileTask();
    const wrong = await watchAndPickAWrongTile();

    fireEvent.click(screen.getAllByRole("button")[wrong]);
    await settle(1600);

    expect(screen.getByText("Watch the tiles")).toBeInTheDocument();
    // The same pattern: its first tile, 0, lights first again.
    await settle(500);
    expect(screen.getAllByRole("button")[0].className).toContain("scale-105");
  });

  it("ends the round on the third miss, without a completed round", async () => {
    // It used to ring for 900ms and wait, for ever, while the child found the
    // tiles by elimination.
    renderTheTileTask();
    for (let miss = 0; miss < 3; miss++) {
      const wrong = await watchAndPickAWrongTile();
      fireEvent.click(screen.getAllByRole("button")[wrong]);
      await settle(1600);
    }
    await settle();

    expect(submitted()).toMatchObject({ roundsCompleted: 0, retries: 3 });
    expect(screen.getByText(/That's it for today/)).toBeInTheDocument();
  });
});

describe("dimensionForToday — the signed-out walkthrough's rotation", () => {
  /*
   * The frame rotates the six across SCHOOL days: Mon patterns, Tue matches,
   * Wed read, Thu counts, Fri focus, then Mon a quick question. It was
   * `getDay() % 6`, which put Sunday first and restarted every week.
   */
  const on = (y: number, m: number, d: number) =>
    dimensionForToday(new Date(y, m - 1, d, 9));

  it("runs Monday to Friday in the frame's order", () => {
    // 1 Jan 2024 is a Monday.
    expect([1, 2, 3, 4, 5].map((d) => on(2024, 1, d))).toEqual([
      "wmc",
      "ps",
      "reading",
      "ans",
      "attention",
    ]);
  });

  it("carries the sixth into the next Monday, as the frame draws", () => {
    expect(on(2024, 1, 8)).toBe("domain");
    expect(on(2024, 1, 9)).toBe("wmc");
  });

  it("does not move over the weekend", () => {
    expect(on(2024, 1, 6)).toBe(on(2024, 1, 5));
    expect(on(2024, 1, 7)).toBe(on(2024, 1, 5));
  });
});
