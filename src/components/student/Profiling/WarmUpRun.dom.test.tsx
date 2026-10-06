import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { WarmUpRun } from "./WarmUpRun";

/**
 * The daily warm-up captured everything and submitted almost none of it.
 *
 * `finish()` sent `{ module, dimension, durationMs }` - the day's task name and
 * how long it took - and then purged the capture. Every trial, every response
 * time, every right and wrong answer went to IndexedDB and was deleted without
 * ever being reduced. The run exists to recalibrate the engine on one dimension
 * a day; what reached it was "a child spent 45 seconds".
 *
 * Under that, five of the six tasks recorded no `correct` at all, so even a
 * reduce would have had nothing to score - and the working-memory task recorded
 * neither `posInSeq` nor `round_complete`, the two things its reducer reads.
 *
 * Since B9 (5 Oct) what leaves is the run's TRIALS, one per answer, and the
 * server reduces them; the device sends no mean, accuracy or span. These tests
 * assert on what `baselineApi.submitTrials` was handed, because that is the
 * only part that leaves the device.
 */

const { submit } = vi.hoisted(() => ({ submit: vi.fn() }));
vi.mock("@/lib/api", () => ({ baselineApi: { submitTrials: submit } }));
const { holdBaseline } = vi.hoisted(() => ({ holdBaseline: vi.fn() }));
vi.mock("@/lib/profiling/pendingBaseline", () => ({ holdBaseline }));
// These pin the task with the `dimension` prop; the engine's prompt is
// covered in WarmUpRun.engine.dom.test.tsx.
vi.mock("@/hooks/useWarmUpDimension", () => ({
  useWarmUpPrompt: () => ({ state: "waiting" }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

/** The trials that were sent. */
const trials = () => submit.mock.calls[0][1];
/** The first of them. */
const submitted = () => trials()[0];

/**
 * Sit the tile task: watch the tiles light, then tap them back in reverse.
 *
 * It used to sweep the whole grid, because a wrong tap was ignored. A wrong
 * tap now nudges and replays, and the third ends the round - as in tile
 * memory - so the test has to know the sequence. `Math.random` pinned to 0
 * draws tiles 0, 1, 2, so the reverse is 2, 1, 0.
 * The 50ms between taps is deliberate: under fake timers `performance.now()`
 * does not move on its own, and a gap of zero is what a measurement that was
 * never taken looks like.
 */
const sitTheTileTask = async () => {
  const random = vi.spyOn(Math, "random").mockReturnValue(0);
  render(<WarmUpRun dimension="wmc" />);
  random.mockRestore();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(4000);
  });
  const tiles = screen.getAllByRole("button");
  for (const i of [2, 1, 0]) {
    fireEvent.click(tiles[i]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
  }
};

/** Let the pressed beat and the submit settle. */
const settle = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  submit.mockReset();
  submit.mockResolvedValue(true);
  holdBaseline.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("WarmUpRun — what actually reaches Nevo", () => {
  it("sends whether the child was right, not just how long they took", async () => {
    render(<WarmUpRun dimension="attention" />);

    // Only the centre arrow points right; the four flankers are mirrored.
    fireEvent.click(screen.getByText("Right"));
    await settle();

    expect(trials()).toHaveLength(1);
    expect(submitted()).toMatchObject({
      dimension: "attention",
      response: "Right",
      correct: true,
    });
  });

  it("sends a wrong answer as wrong", async () => {
    render(<WarmUpRun dimension="attention" />);

    fireEvent.click(screen.getByText("Left"));
    await settle();

    expect(submitted().correct).toBe(false);
  });

  it("says which dimension ran on the trial itself, with the answer's own time", async () => {
    render(<WarmUpRun dimension="reading" />);

    fireEvent.click(screen.getByText("True"));
    await settle();

    expect(submitted().dimension).toBe("reading");
    expect(submitted().responseTimeMs).toEqual(expect.any(Number));
  });

  it("sends the answers as they were, never a mean, an accuracy or a span (B9)", async () => {
    await sitTheTileTask();
    await settle();

    for (const trial of trials()) {
      expect(Object.keys(trial).sort()).toEqual([
        "condition",
        "correct",
        "dimension",
        "probeItemId",
        "response",
        "responseTimeMs",
      ]);
    }
    expect(JSON.stringify(trials())).not.toMatch(
      /mean|accuracy|span|rounds|retries|duration/i,
    );
  });

  it("says the reading was a sentence read, as the reading activity does", async () => {
    // With no band, the frame's one sentence; SS reads a passage instead
    // (WarmUpRun.band), so which one ran has to travel.
    render(<WarmUpRun dimension="reading" />);

    fireEvent.click(screen.getByText("True"));
    await settle();

    expect(submitted()).toMatchObject({ condition: "sentence", correct: true });
  });

  it("never marks 'Not sure' wrong", async () => {
    render(<WarmUpRun dimension="reading" />);

    fireEvent.click(screen.getByText("Not sure"));
    await settle();

    expect(submitted()).toMatchObject({ response: "not_sure", correct: null });
  });

  it("sends a completed working-memory recall as three right taps of three", async () => {
    // A child who did it perfectly once reduced to maxSpan 0 -
    // indistinguishable from never finishing.
    await sitTheTileTask();
    await settle();

    expect(trials()).toHaveLength(3);
    expect(trials().map((t: { response: string }) => t.response)).toEqual([
      "2",
      "1",
      "0",
    ]);
    for (const trial of trials()) {
      expect(trial).toMatchObject({
        dimension: "wmc",
        condition: "length_3",
        correct: true,
      });
    }
  });

  it("times every tap, the first from when the grid was handed over", async () => {
    // The first tap had nothing to be timed from: the warm-up never recorded
    // when its grid was handed over.
    await sitTheTileTask();
    await settle();

    const times = trials().map(
      (t: { responseTimeMs: number | null }) => t.responseTimeMs,
    );
    expect(times[0]).toEqual(expect.any(Number));
    expect(times.slice(1)).toEqual([50, 50]);
  });
});

describe("WarmUpRun — the dot arrays are not always side by side", () => {
  it("calls them top and bottom when they are stacked", () => {
    // They sit side by side from `sm` up and STACK below it, and the buttons
    // said "Left" and "Right" regardless - so on a phone a child was asked
    // which SIDE had more when one array was above the other.
    render(<WarmUpRun dimension="ans" />);

    expect(screen.getByText("Top")).toBeInTheDocument();
    expect(screen.getByText("Bottom")).toBeInTheDocument();
  });

  it("still calls them left and right for the wider layout", () => {
    render(<WarmUpRun dimension="ans" />);

    expect(screen.getByText("Left")).toBeInTheDocument();
    expect(screen.getByText("Right")).toBeInTheDocument();
  });

  it("parks the day's measurement when the write is refused", async () => {
    /*
     * It used a bare `submit` and threw the day's work away on the FIRST
     * refusal - a blip, a cold backend, a 3G stutter - while the identical
     * onboarding write already retried and parked. Same data, same endpoint,
     * two different answers to the same failure, and the quieter one lost a
     * child's warm-up.
     */
    submit.mockResolvedValue(false);
    render(<WarmUpRun dimension="attention" />);

    fireEvent.click(screen.getByText("Right"));
    await settle();

    expect(holdBaseline).toHaveBeenCalled();
  });

  it("parks it when the write throws outright", async () => {
    submit.mockRejectedValue(new Error("network"));
    render(<WarmUpRun dimension="attention" />);

    fireEvent.click(screen.getByText("Right"));
    await settle();

    expect(holdBaseline).toHaveBeenCalled();
  });

  it("does not park what it has already delivered", async () => {
    submit.mockResolvedValue(true);
    render(<WarmUpRun dimension="attention" />);

    fireEvent.click(screen.getByText("Right"));
    await settle();

    expect(holdBaseline).not.toHaveBeenCalled();
  });
});

describe("WarmUpRun — the dot task has no fixed answer", () => {
  /*
   * The nine-dot array was always on the left, so "Left" was always right -
   * every day, for every child. The side is now drawn per run.
   */
  const pickLeftAfterTheMask = async () => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    fireEvent.click(screen.getByText("Left"));
    await settle();
  };

  afterEach(() => vi.restoreAllMocks());

  it("marks Left wrong when the larger array is on the right", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.9);
    render(<WarmUpRun dimension="ans" />);

    await pickLeftAfterTheMask();

    expect(submitted()).toMatchObject({ dimension: "ans", correct: false });
  });

  it("marks Left right when the larger array is on the left", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    render(<WarmUpRun dimension="ans" />);

    await pickLeftAfterTheMask();

    expect(submitted()).toMatchObject({ dimension: "ans", correct: true });
  });
});

describe("WarmUpRun — the done state claims no save", () => {
  it("says nothing about saving while the write is still in flight", async () => {
    submit.mockReturnValue(new Promise(() => {}));
    await sitTheTileTask();
    await settle();

    expect(screen.getByText("That's it for today")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/saved|couldn't save/i);
  });

  it("is the title and Go on once the write lands, with no body line (D80, D97)", async () => {
    // It said "Nevo is tuned to how you're doing today. Your progress is
    // saved." here, and its button read "Home". The 6 Oct frame is the title
    // and "Go on".
    await sitTheTileTask();
    await settle();

    expect(screen.getByText("That's it for today")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/saved|tuned|couldn't/i);
    expect(screen.getByRole("button", { name: "Go on" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Home" })).toBeNull();
  });

  it("still says so when the write failed (kept while D126 is asked)", async () => {
    submit.mockResolvedValue(false);
    await sitTheTileTask();
    await settle();

    expect(screen.getByText(/couldn't save it just now/)).toBeTruthy();
  });
});
