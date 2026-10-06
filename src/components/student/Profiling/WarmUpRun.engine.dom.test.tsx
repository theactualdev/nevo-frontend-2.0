import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WarmUpRun, dimensionForToday } from "./WarmUpRun";
import type { WarmUpPrompt } from "@/hooks/useWarmUpDimension";
import { clearSession, setSession } from "@/lib/auth/session";
import { markWarmUpDone } from "@/lib/profiling/warmUpDone";

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

const { submit, answerPrompt, deviceTaskDone } = vi.hoisted(() => ({
  submit: vi.fn(),
  answerPrompt: vi.fn(),
  deviceTaskDone: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  baselineApi: { submitTrials: submit, answerPrompt, deviceTaskDone },
}));
const { holdBaseline } = vi.hoisted(() => ({ holdBaseline: vi.fn() }));
vi.mock("@/lib/profiling/pendingBaseline", () => ({ holdBaseline }));

const engine = vi.hoisted(() => ({
  prompt: { state: "waiting" } as WarmUpPrompt,
}));
vi.mock("@/hooks/useWarmUpDimension", () => ({
  useWarmUpPrompt: () => engine.prompt,
}));

// Banding is WarmUpRun.band's subject; here the roster gives none.
vi.mock("@/hooks/useRosterBand", () => ({
  useRosterBand: () => ({ band: null, settled: true }),
}));

const consent = vi.hoisted(() => ({ withdrawn: false }));
vi.mock("@/hooks/useConsentGate", () => ({
  useConsentGate: () => ({ withdrawn: consent.withdrawn, known: true }),
}));

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

/** The run's trials, as `submitTrials` was handed them. */
const trials = () => submit.mock.calls[0][1];
const submitted = () => trials()[0];
const settle = async (ms = 1000) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};
const homeButton = () => screen.getByRole("button", { name: "Home" });

const signIn = () =>
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    userId: "child-1",
    role: "student",
  });

beforeEach(() => {
  vi.useFakeTimers();
  submit.mockReset();
  submit.mockResolvedValue(true);
  answerPrompt.mockReset();
  answerPrompt.mockResolvedValue(true);
  deviceTaskDone.mockReset();
  deviceTaskDone.mockResolvedValue(true);
  holdBaseline.mockReset();
  push.mockReset();
  consent.withdrawn = false;
  engine.prompt = { state: "waiting" };
  window.localStorage.clear();
  clearSession();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  clearSession();
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

  it("still leaves the child a way Home", () => {
    // Full-screen, no nav: without this the screen would be a dead end. It
    // went into the day's lesson, which a child with none queued did not have
    // (D18): Home, whatever is queued.
    engine.prompt = { state: "none" };
    render(<WarmUpRun />);

    fireEvent.click(homeButton());

    expect(push).toHaveBeenCalledWith("/student/dashboard");
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

  it("sends which option was picked to the prompt's own endpoint (B8)", async () => {
    signIn();
    engine.prompt = served;
    render(<WarmUpRun />);

    fireEvent.click(screen.getByText("56"));
    await settle();

    // The option's value, never its label, and nothing about whether it was
    // right: the server marks it.
    expect(answerPrompt).toHaveBeenCalledWith("child-1", {
      itemId: "item-7",
      value: "opt-b",
    });
  });

  it("sends it as a trial carrying the option's value, and marks nothing", async () => {
    signIn();
    engine.prompt = served;
    render(<WarmUpRun />);

    fireEvent.click(screen.getByText("56"));
    await settle();

    // No answer key is used on the device, so nothing is marked. `item-7` is
    // not a UUID, so it is not offered as a `probeItemId` the contract would
    // refuse.
    expect(submitted()).toMatchObject({
      dimension: "domain",
      response: "opt-b",
      correct: null,
      probeItemId: null,
    });
  });

  it("does not say it was saved when the pick never landed", async () => {
    // The submit can land while the pick does not. "Your progress is saved"
    // over a pick nobody received would be the fabricated success again.
    signIn();
    answerPrompt.mockResolvedValue(false);
    engine.prompt = served;
    render(<WarmUpRun />);

    fireEvent.click(screen.getByText("56"));
    await settle();

    expect(screen.queryByText(/Your progress is saved/)).toBeNull();
    expect(screen.getByText(/couldn't save it just now/)).toBeInTheDocument();
  });

  it("does not also send a device-task completion on a served day", async () => {
    signIn();
    engine.prompt = served;
    render(<WarmUpRun />);

    fireEvent.click(screen.getByText("56"));
    await settle();

    expect(deviceTaskDone).not.toHaveBeenCalled();
  });

  it("asks a served question whatever the day's dimension (B65)", async () => {
    // `served` decides; the dimension is not asked to imply it.
    signIn();
    engine.prompt = {
      state: "ready",
      dimension: "attention",
      live: true,
      item: served.state === "ready" ? served.item : null,
    };
    render(<WarmUpRun />);

    expect(screen.getByText("What is 7 times 8?")).toBeInTheDocument();
    expect(screen.queryByText("Right")).toBeNull();

    fireEvent.click(screen.getByText("56"));
    await settle();

    expect(answerPrompt).toHaveBeenCalledWith("child-1", {
      itemId: "item-7",
      value: "opt-b",
    });
  });
});

describe("WarmUpRun - a device-task day tells the account (B54)", () => {
  const deviceDay: WarmUpPrompt = {
    state: "ready",
    dimension: "attention",
    live: true,
    item: null,
  };

  it("sends the completion, with no item, once the run ends", async () => {
    // Five days in six served no question and so sent nothing: `doneToday`
    // stayed false and a second tablet offered a second run.
    signIn();
    engine.prompt = deviceDay;
    render(<WarmUpRun />);

    expect(deviceTaskDone).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Right"));
    await settle();

    expect(deviceTaskDone).toHaveBeenCalledTimes(1);
    expect(deviceTaskDone).toHaveBeenCalledWith("child-1");
    expect(answerPrompt).not.toHaveBeenCalled();
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("does not let the completion decide what the child is told", async () => {
    // "Your progress is saved" is about what the child did reaching Nevo; the
    // completion is the account's note that it happened.
    signIn();
    deviceTaskDone.mockResolvedValue(false);
    engine.prompt = deviceDay;
    render(<WarmUpRun />);

    fireEvent.click(screen.getByText("Right"));
    await settle();

    expect(screen.getByText(/Your progress is saved/)).toBeInTheDocument();
  });

  it("sends none for a run the engine did not name", async () => {
    // The pinned task, as the signed-out walkthrough's is: nobody's day.
    signIn();
    render(<WarmUpRun dimension="attention" />);

    fireEvent.click(screen.getByText("Right"));
    await settle();

    expect(deviceTaskDone).not.toHaveBeenCalled();
  });

  it("sends none for a withdrawn guardian's child", async () => {
    signIn();
    consent.withdrawn = true;
    engine.prompt = deviceDay;
    render(<WarmUpRun />);

    fireEvent.click(screen.getByText("Right"));
    await settle();

    expect(deviceTaskDone).not.toHaveBeenCalled();
  });
});

describe("WarmUpRun — done today, on the account (B10)", () => {
  const attention = (doneToday?: boolean): WarmUpPrompt => ({
    state: "ready",
    dimension: "attention",
    item: null,
    live: true,
    ...(doneToday === undefined ? {} : { doneToday }),
  });

  it("opens on the done state when the account says another tablet did it", async () => {
    // This device has no memory of it at all - which is the second tablet.
    signIn();
    engine.prompt = attention(true);
    render(<WarmUpRun />);
    await settle();

    expect(screen.getByText(/That's it for today/)).toBeInTheDocument();
    expect(screen.queryByText("Right")).toBeNull();
    expect(submit).not.toHaveBeenCalled();
  });

  it("does not offer a second run on the tablet that watched the first finish", async () => {
    // The account's "not done" may only mean a device-task day did not set
    // doneToday; this tablet saw the run end.
    signIn();
    markWarmUpDone("child-1");
    engine.prompt = attention(false);
    render(<WarmUpRun />);
    await settle();

    expect(screen.getByText(/That's it for today/)).toBeInTheDocument();
  });

  it("runs when neither the account nor this tablet has seen today's", async () => {
    signIn();
    engine.prompt = attention(false);
    render(<WarmUpRun />);
    await settle();

    expect(screen.getByText("Right")).toBeInTheDocument();
    expect(screen.queryByText(/That's it for today/)).toBeNull();
  });

  it("falls back on this device's memory when the prompt does not say", async () => {
    // A deployment from before 1 Oct carries no `doneToday`.
    signIn();
    markWarmUpDone("child-1");
    engine.prompt = attention();
    render(<WarmUpRun />);
    await settle();

    expect(screen.getByText(/That's it for today/)).toBeInTheDocument();
  });

  it("claims nothing while the prompt is still on its way", () => {
    // The memory could say done and the account then say otherwise; "That's
    // it for today" followed by a task is worse than the nothing-state.
    signIn();
    markWarmUpDone("child-1");
    render(<WarmUpRun />);

    expect(screen.queryByText(/That's it for today/)).toBeNull();
    expect(homeButton()).toBeInTheDocument();
  });
});

describe("WarmUpRun — a withdrawn guardian", () => {
  it("reaches the done state instead of freezing on the task", async () => {
    consent.withdrawn = true;
    render(<WarmUpRun dimension="attention" />);

    fireEvent.click(screen.getByText("Right"));
    await settle();

    expect(screen.getByText(/That's it for today/)).toBeInTheDocument();
    expect(homeButton()).toBeInTheDocument();
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

    // Three taps, every one wrong: the round never completed.
    expect(trials()).toHaveLength(3);
    expect(
      trials().map((t: { correct: boolean | null }) => t.correct),
    ).toEqual([false, false, false]);
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
