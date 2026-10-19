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
    fireEvent.click(screen.getByRole("button", { name: "Right" }));
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

    fireEvent.click(screen.getByRole("button", { name: "Left" }));
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

  it("sends a completed working-memory recall as one answer, its three taps in order (B80)", async () => {
    // A child who did it perfectly once reduced to maxSpan 0 -
    // indistinguishable from never finishing. Then it went up as three
    // trials, one per tap; backend's contract is one per completed recall.
    await sitTheTileTask();
    await settle();

    expect(trials()).toHaveLength(1);
    expect(submitted()).toMatchObject({
      dimension: "wmc",
      condition: "length_3",
      response: "2,1,0",
      correct: true,
    });
  });

  it("times the recall from when the grid was handed over to its last tap", async () => {
    // The first tap had nothing to be timed from: the warm-up never recorded
    // when its grid was handed over. The two 50ms gaps after the first tap
    // are inside the recall, so they are inside its time.
    await sitTheTileTask();
    await settle();

    expect(submitted().responseTimeMs).toEqual(expect.any(Number));
    expect(submitted().responseTimeMs).toBeGreaterThanOrEqual(100);
  });
});

describe("WarmUpRun — the dot arrays, as the warm-up frame draws them", () => {
  it("sits them side by side at every size, under Left and Right", () => {
    // They stacked on a phone under buttons reading Top and Bottom. The
    // Warm-Up Run frame draws two 150px boxes side by side at 375, 200px
    // from tablet up, and Left / Right at every size.
    render(<WarmUpRun dimension="ans" />);

    const [box] = screen.getAllByTestId("warmup-dot-box");
    const row = box.parentElement!;
    expect(row.className).not.toMatch(/flex-col/);
    expect(row.className).toContain("gap-[18px]");
    expect(row.className).toContain("sm:gap-7");
    expect(box.className).toContain("size-[150px]");
    expect(box.className).toContain("sm:size-[200px]");
    expect(screen.queryByText("Top")).toBeNull();
    expect(screen.queryByText("Bottom")).toBeNull();
    expect(
      screen.getAllByRole("button").map((b) => b.textContent),
    ).toEqual(["Left", "Right"]);
  });

  it("scatters each array's dots as the baseline does, rather than in rows (D197)", () => {
    // A random scatter once let dots land on each other, so the frame's rows
    // came in. Design, 13 Oct: the warm-up "scatters them the way the
    // baseline does instead of flowing them in rows", which keeps every two
    // 1.5 dots apart (spacing by band in WarmUpRun.band). P4-6's frame pair
    // is 9 against 5, every one of them drawn.
    render(<WarmUpRun dimension="ans" />);

    const boxes = screen.getAllByTestId("warmup-dot-box");
    for (const box of boxes) {
      expect(box.className).not.toMatch(/flex-wrap|gap-2\.5|p-3\.5/);
      for (const dot of box.querySelectorAll<HTMLElement>("span")) {
        expect(dot.className).toContain("absolute");
        expect(dot.style.left).toMatch(/%$/);
        expect(dot.style.top).toMatch(/%$/);
      }
    }
    expect(
      boxes.map((b) => b.querySelectorAll("span").length).sort(),
    ).toEqual([5, 9]);
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

    fireEvent.click(screen.getByRole("button", { name: "Right" }));
    await settle();

    expect(holdBaseline).toHaveBeenCalled();
  });

  it("parks it when the write throws outright", async () => {
    submit.mockRejectedValue(new Error("network"));
    render(<WarmUpRun dimension="attention" />);

    fireEvent.click(screen.getByRole("button", { name: "Right" }));
    await settle();

    expect(holdBaseline).toHaveBeenCalled();
  });

  it("does not park what it has already delivered", async () => {
    submit.mockResolvedValue(true);
    render(<WarmUpRun dimension="attention" />);

    fireEvent.click(screen.getByRole("button", { name: "Right" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Left" }));
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
  it("says it is saving while the write is in flight, and claims no save (13 Oct)", async () => {
    submit.mockReturnValue(new Promise(() => {}));
    await sitTheTileTask();
    await settle();

    expect(screen.getByText("That's it for today")).toBeTruthy();
    // The frame's `saving` line: the write is going, not gone.
    const line = screen.getByText("Saving your warm-up…");
    expect(line.className).toContain("mt-2");
    expect(line.className).toContain("text-[14.5px]");
    expect(line.className).toContain("sm:text-[15.5px]");
    expect(line.className).toContain("leading-[1.5]");
    expect(line.className).toContain("text-nevo-near-black/60");
    expect(document.body.textContent).not.toMatch(/saved|didn't save|couldn't save/i);
    expect(screen.queryByTestId("warmup-save-failed-mark")).toBeNull();
  });

  it("keeps Go on while it saves (Q12 holds the frame's hiding of it)", async () => {
    submit.mockReturnValue(new Promise(() => {}));
    await sitTheTileTask();
    await settle();

    expect(screen.getByText("Saving your warm-up…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go on" })).toBeInTheDocument();
  });

  it("holds the working spinner in the badge spot while the write is in flight, never the check", async () => {
    // Design, 13 Oct: "A save in flight shows the working spinner in the
    // badge spot rather than a success check before we know it worked."
    submit.mockReturnValue(new Promise(() => {}));
    await sitTheTileTask();
    await settle();

    const title = screen.getByText("That's it for today");
    const spot = title.parentElement!.previousElementSibling!;
    expect(spot).toBe(screen.getByTestId("warmup-saving-mark"));
    expect(spot.querySelector("svg")).toBeNull();
    // The frame's `spinBadge` is the badge's own size, so nothing moves when
    // the badge replaces it, with a 4px ring. It was 44px with a 3px ring.
    expect(spot.className).toMatch(/(^| )size-16( |$)/);
    expect(spot.className).toContain("sm:size-20");
    expect(spot.className).toMatch(/(^| )border-4( |$)/);
    expect(spot.className).not.toContain("size-11");
    // The house spinner: a navy ring on a faint navy track.
    expect(spot.className).toContain("border-nevo-navy/18");
    expect(spot.className).toContain("border-t-nevo-navy");
    expect(spot.className).toContain("motion-safe:animate-spin");
  });

  it("swaps the spinner for the check once the write lands", async () => {
    let land!: (ok: boolean) => void;
    submit.mockReturnValue(new Promise<boolean>((r) => (land = r)));
    await sitTheTileTask();
    await settle();
    expect(screen.getByTestId("warmup-saving-mark")).toBeInTheDocument();

    await act(async () => land(true));

    expect(screen.queryByTestId("warmup-saving-mark")).toBeNull();
    expect(screen.queryByText("Saving your warm-up…")).toBeNull();
    const badge = screen.getByText("That's it for today").parentElement!
      .previousElementSibling!;
    expect(badge.className).toContain("bg-nevo-navy");
    expect(badge.querySelector("svg")).not.toBeNull();
  });

  it("swaps the spinner for D126's mark, not the check, when the write fails", async () => {
    let land!: (ok: boolean) => void;
    submit.mockReturnValue(new Promise<boolean>((r) => (land = r)));
    await sitTheTileTask();
    await settle();
    expect(screen.getByTestId("warmup-saving-mark")).toBeInTheDocument();

    await act(async () => land(false));

    expect(screen.queryByTestId("warmup-saving-mark")).toBeNull();
    expect(screen.queryByText("Saving your warm-up…")).toBeNull();
    expect(screen.getByTestId("warmup-save-failed-mark")).toBeInTheDocument();
    expect(document.querySelector("svg.lucide-check")).toBeNull();
  });

  it("is the title and Go on once the write lands, with no body line (D80, D97)", async () => {
    // It said "Nevo is tuned to how you're doing today. Your progress is
    // saved." here, and its button read "Home". The 6 Oct frame is the title
    // and "Go on".
    await sitTheTileTask();
    await settle();

    expect(screen.getByText("That's it for today")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/saved|tuned|didn't|couldn't/i);
    expect(screen.queryByTestId("warmup-save-failed-mark")).toBeNull();
    expect(screen.getByRole("button", { name: "Go on" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Home" })).toBeNull();
  });

  it("draws the frame's phone sizes, and the larger ones from tablet up", async () => {
    // It was a 22px title and an 80px badge at every width. The Warm-Up Run
    // frame draws 19px and 64px on a phone, 22px and 80px on tablet and
    // desktop.
    await sitTheTileTask();
    await settle();

    const title = screen.getByText("That's it for today");
    const badge = title.parentElement!.previousElementSibling!;
    expect(title.className).toContain("text-[19px]");
    expect(title.className).toContain("sm:text-[22px]");
    expect(badge.className).toMatch(/(^| )size-16( |$)/);
    expect(badge.className).toContain("sm:size-20");
    // Its check is 32px on a phone and 40px from tablet up; it was 36px.
    const check = badge.querySelector("svg")!.getAttribute("class")!;
    expect(check).toMatch(/(^| )size-8( |$)/);
    expect(check).toContain("sm:size-10");
  });

});

describe("WarmUpRun — the header is the running state's", () => {
  const header = () => screen.queryByText("DAILY WARM-UP");

  it("sits over a running task, its ring the frame's 30px on a phone and 34px up", () => {
    render(<WarmUpRun dimension="attention" />);

    expect(header()).toBeInTheDocument();
    const ring = screen.getByTestId("warmup-ring").getAttribute("class")!;
    expect(ring).toContain("size-[30px]");
    expect(ring).toContain("sm:size-[34px]");
  });

  it("is gone once the warm-up is done, as frame 12 draws it", async () => {
    await sitTheTileTask();
    await settle();

    expect(screen.getByText("That's it for today")).toBeInTheDocument();
    expect(header()).toBeNull();
    expect(screen.queryByTestId("warmup-ring")).toBeNull();
  });

  it("is gone when the save failed, as D126 draws it", async () => {
    submit.mockResolvedValue(false);
    await sitTheTileTask();
    await settle();

    expect(screen.getByText(/Today's warm-up didn't save/)).toBeInTheDocument();
    expect(header()).toBeNull();
    expect(screen.queryByTestId("warmup-ring")).toBeNull();
  });

  it("is not over the loading state either", () => {
    // No task pinned, and the engine's prompt is still on its way (D169).
    render(<WarmUpRun />);

    expect(screen.getByText("Getting your warm-up ready")).toBeInTheDocument();
    expect(header()).toBeNull();
    expect(screen.queryByTestId("warmup-ring")).toBeNull();
  });
});

describe("WarmUpRun — the line above a task is the frame's size", () => {
  it("is 16px on a phone and 18px from tablet up", () => {
    // It was 17px at every size.
    render(<WarmUpRun dimension="attention" />);

    const line = screen.getByText("Which way is the middle arrow pointing?");
    expect(line.className).toContain("text-[16px]");
    expect(line.className).toContain("sm:text-[18px]");
    expect(line.className).not.toContain("text-[17px]");
  });
});

describe("WarmUpRun — the write failed (D126, 8 Oct)", () => {
  const failed = async () => {
    submit.mockResolvedValue(false);
    await sitTheTileTask();
    await settle();
  };

  it("says it didn't save in the frame's one line, under the same title and Go on", async () => {
    // It read "Thanks for doing that. We couldn't save it just now - that's
    // on us, not you." D126: no apology, no reason, no retry.
    await failed();

    expect(screen.getByText("That's it for today")).toBeInTheDocument();
    expect(
      screen.getByText("Today's warm-up didn't save. It won't change your lessons."),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/couldn't|on us|sorry|try again/i);
    // Go on, and nothing else to press: no retry.
    expect(
      screen.getAllByRole("button").map((b) => b.textContent),
    ).toEqual(["Go on"]);
  });

  it("draws the line at the frame's sizes and its quieter colour", async () => {
    await failed();

    const line = screen.getByText(/Today's warm-up didn't save/);
    expect(line.className).toContain("text-[14.5px]");
    expect(line.className).toContain("sm:text-[15.5px]");
    expect(line.className).toContain("text-nevo-near-black/70");
    expect(line.className).toContain("max-w-[300px]");
    expect(line.className).toContain("mt-3");
  });

  it("shows a quiet neutral mark, not the success check, at the badge's sizes", async () => {
    await failed();

    const mark = screen.getByTestId("warmup-save-failed-mark");
    const title = screen.getByText("That's it for today");
    expect(title.parentElement!.previousElementSibling).toBe(mark);
    expect(mark.querySelector("svg")).toBeNull();
    expect(mark.className).toMatch(/(^| )size-16( |$)/);
    expect(mark.className).toContain("sm:size-20");
    expect(mark.className).toContain("bg-nevo-violet/22");
    expect(mark.className).not.toMatch(/animate/);
    const bar = mark.firstElementChild!;
    expect(bar.className).toContain("w-[26px]");
    expect(bar.className).toContain("sm:w-8");
    expect(bar.className).toContain("h-[3px]");
    expect(bar.className).toContain("bg-nevo-navy");
  });
});
