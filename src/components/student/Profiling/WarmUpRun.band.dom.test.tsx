import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WarmUpRun } from "./WarmUpRun";
import type { RosterBand } from "@/hooks/useRosterBand";

/**
 * ONE WARM-UP FOR EVERY AGE (D17, 1 Oct).
 *
 * The frame draws one version - a 4x4 grid, three tiles, "Garri is made from
 * cassava." - and every child got it, "tuned for neither" a Primary 2 nor an
 * SS2 child. Design: vary it by band, reusing the geometry tile memory already
 * has. So with a band the tile task is tile memory's first round for that
 * band, and the reading task the reading activity's own item; with none, the
 * frame's version runs.
 *
 * THE BAND NO LONGER TRAVELS WITH THE MEASUREMENT. It rode on the reduced
 * vector; since B9 the warm-up sends raw trials, which have no field for it,
 * and it is with backend as an ask. So these assert the trials the band's
 * task produced, and that no band is invented onto them.
 */

const { submit } = vi.hoisted(() => ({ submit: vi.fn() }));
vi.mock("@/lib/api", () => ({ baselineApi: { submitTrials: submit } }));
vi.mock("@/lib/profiling/pendingBaseline", () => ({ holdBaseline: vi.fn() }));
vi.mock("@/hooks/useWarmUpDimension", () => ({
  useWarmUpPrompt: () => ({ state: "waiting" }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
const roster = vi.hoisted(() => ({
  value: { band: null, settled: true } as RosterBand,
}));
vi.mock("@/hooks/useRosterBand", () => ({
  useRosterBand: () => roster.value,
}));

type Trial = { condition: string | null; correct: boolean | null };
const trials = (): Trial[] => submit.mock.calls[0][1];
const submitted = () => trials()[0];
const wait = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

/**
 * Sit the tile task with `Math.random` pinned to 0, which draws tiles 0, 1,
 * 2, ... in order, so the reverse is known. 50ms between taps so the recall
 * gaps are real ones.
 */
const sitTheTileTask = async (length: number) => {
  const random = vi.spyOn(Math, "random").mockReturnValue(0);
  render(<WarmUpRun dimension="wmc" />);
  random.mockRestore();
  await wait(6000);
  const tiles = screen.getAllByRole("button");
  for (let i = length - 1; i >= 0; i--) {
    fireEvent.click(tiles[i]);
    await wait(50);
  }
  await wait(1000);
};

beforeEach(() => {
  vi.useFakeTimers();
  submit.mockReset();
  submit.mockResolvedValue(true);
  roster.value = { band: null, settled: true };
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("the tile task, by band", () => {
  it("runs the senior band on tile memory's 5x5 grid", () => {
    roster.value = { band: "ss", settled: true };
    render(<WarmUpRun dimension="wmc" />);

    expect(screen.getAllByRole("button")).toHaveLength(25);
  });

  it("asks the senior band for tile memory's four tiles", async () => {
    roster.value = { band: "ss", settled: true };
    await sitTheTileTask(4);

    expect(trials()).toHaveLength(4);
    expect(trials().every((t) => t.condition === "length_4" && t.correct)).toBe(
      true,
    );
    expect(JSON.stringify(trials())).not.toMatch(/band|"ss"/);
  });

  it("runs the youngest band on a 3x3 grid", () => {
    roster.value = { band: "p13", settled: true };
    render(<WarmUpRun dimension="wmc" />);

    expect(screen.getAllByRole("button")).toHaveLength(9);
  });

  it("asks the youngest band for two tiles", async () => {
    roster.value = { band: "p13", settled: true };
    await sitTheTileTask(2);

    expect(trials().map((t) => t.condition)).toEqual([
      "length_2",
      "length_2",
    ]);
  });

  it("runs the frame's one version when the roster gives no band, and claims none", async () => {
    await sitTheTileTask(3);

    expect(trials()).toHaveLength(3);
    expect(trials().every((t) => t.condition === "length_3" && t.correct)).toBe(
      true,
    );
    expect(JSON.stringify(trials())).not.toMatch(/band/);
  });

  it("starts nothing until the band is known, so it never changes size mid-task", async () => {
    roster.value = { band: null, settled: false };
    render(<WarmUpRun dimension="wmc" />);
    await wait(6000);

    // Only the nothing-state's way Home.
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Home" })).toBeInTheDocument();
    expect(screen.queryByText("Watch the tiles")).toBeNull();
  });
});

describe("the reading task, by band", () => {
  it("gives the junior secondary band its own sentence", () => {
    roster.value = { band: "jss", settled: true };
    render(<WarmUpRun dimension="reading" />);

    expect(screen.getByText(/Lagos to Abuja by road/)).toBeInTheDocument();
    expect(screen.queryByText("Garri is made from cassava.")).toBeNull();
  });

  it("gives the senior band the passage and its question, marked as a passage read", async () => {
    roster.value = { band: "ss", settled: true };
    render(<WarmUpRun dimension="reading" />);

    expect(screen.getByText(/Balogun Market/)).toBeInTheDocument();
    expect(screen.getByText("Why does Ada keep a notebook?")).toBeInTheDocument();

    fireEvent.click(screen.getByText("To track her savings for school fees"));
    await wait(1000);

    expect(submitted()).toMatchObject({
      dimension: "reading",
      condition: "passage",
      correct: true,
    });
  });

  it("still lets the senior band decline the passage without being marked wrong", async () => {
    roster.value = { band: "ss", settled: true };
    render(<WarmUpRun dimension="reading" />);

    fireEvent.click(screen.getByText("Not sure"));
    await wait(1000);

    expect(submitted()).toMatchObject({
      condition: "passage",
      response: "not_sure",
      correct: null,
    });
  });

  it("keeps the frame's sentence for the band that reads by ear", () => {
    // P1-3's reading activity is a heard sentence; that round is not built
    // into the warm-up, so nothing new is invented in its place.
    roster.value = { band: "p13", settled: true };
    render(<WarmUpRun dimension="reading" />);

    expect(screen.getByText("Garri is made from cassava.")).toBeInTheDocument();
  });
});
