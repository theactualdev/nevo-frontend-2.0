import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WarmUpRun } from "./WarmUpRun";
import type { RosterBand } from "@/hooks/useRosterBand";

/**
 * ONE WARM-UP FOR EVERY AGE (D17, 1 Oct), AND THEN HALF A BAND (D81, 6 Oct).
 *
 * The frame draws one version - a 4x4 grid, three tiles, "Garri is made from
 * cassava." - and every child got it, "tuned for neither" a Primary 2 nor an
 * SS2 child. Design: vary it by band, reusing the geometry tile memory already
 * has. That reached the tile grid and the reading item and stopped there: SS
 * had no dual check, P1-3 read a sentence it should hear, and the dots,
 * flanker and pattern were one version for everyone at the prototype's times.
 * Design, 6 Oct: "The warm-up re-checks one baseline measure, so it uses that
 * band's own version of that module." So each task here is the module's own
 * first round for the band; with no band, Primary 4-6's, which is the version
 * the frame draws.
 *
 * THE BAND TRAVELS BESIDE THE TRIALS, NOT ON THEM. It rode on the reduced
 * vector; since B9 the warm-up sends raw trials, which have no field for it,
 * and since B76 (8 Oct) the request carries it as `ageBand`. So these assert
 * the trials the band's task produced, that no band is put onto them, and
 * that the request names the roster's band and no other.
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

type Trial = {
  dimension: string;
  condition: string | null;
  response: string | null;
  correct: boolean | null;
  responseTimeMs: number | null;
};
const trials = (): Trial[] => submit.mock.calls[0][1];
/** What went beside the trials (B76). */
const context = () => submit.mock.calls[0][2];
const submitted = () => trials()[0];
const wait = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};
const sync = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

/** The tile buttons, which come first; a check's True and False follow them. */
const tiles = () => screen.getAllByRole("button");
/** The tile lit at this moment, by index, or -1. */
const litTile = () =>
  tiles().findIndex((b) => b.className.includes("bg-nevo-violet"));

/**
 * Sit the tile task with `Math.random` pinned to 0, which draws tiles 0, 1,
 * 2, ... in order, so the reverse is known. 50ms between taps so the recall
 * gaps are real ones. `check` answers SS's check first, when it is up.
 */
const sitTheTileTask = async (length: number, check?: "True" | "False") => {
  const random = vi.spyOn(Math, "random").mockReturnValue(0);
  render(<WarmUpRun dimension="wmc" />);
  random.mockRestore();
  await wait(6000);
  if (check) {
    fireEvent.click(screen.getByText(check));
    await wait(50);
  }
  for (let i = length - 1; i >= 0; i--) {
    fireEvent.click(tiles()[i]);
    await wait(50);
  }
  await wait(1000);
};

/** jsdom has no speech; P1-3's heard round needs one supplied. */
const said: { text: string; onend?: () => void }[] = [];
function giveJsdomAVoice() {
  said.length = 0;
  // Adding what jsdom LACKS, which is safe; replacing what it has is the trap
  // that hangs the worker.
  (
    window as unknown as { SpeechSynthesisUtterance: unknown }
  ).SpeechSynthesisUtterance = class {
    rate = 1;
    onend?: () => void;
    constructor(public text: string) {}
  };
  (window as unknown as { speechSynthesis: unknown }).speechSynthesis = {
    cancel: () => {},
    speak: (u: { text: string; onend?: () => void }) => said.push(u),
  };
}
function takeAwayItsVoice() {
  delete (window as unknown as Record<string, unknown>).speechSynthesis;
  delete (window as unknown as Record<string, unknown>)
    .SpeechSynthesisUtterance;
}

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
  vi.restoreAllMocks();
  takeAwayItsVoice();
});

describe("the tile task, by band", () => {
  it("runs the senior band on tile memory's 5x5 grid", () => {
    roster.value = { band: "ss", settled: true };
    render(<WarmUpRun dimension="wmc" />);

    expect(screen.getAllByRole("button")).toHaveLength(25);
  });

  it("asks the senior band for tile memory's four tiles, after its check", async () => {
    roster.value = { band: "ss", settled: true };
    // "7 + 5 = 13" is the first check, and it is false.
    await sitTheTileTask(4, "False");

    // The check, then the recall as one answer (B80).
    expect(trials()).toHaveLength(2);
    expect(trials()[0]).toMatchObject({
      dimension: "wmc",
      condition: "dual_check",
      response: "false",
      correct: true,
    });
    expect(trials()[1]).toMatchObject({
      dimension: "wmc",
      condition: "length_4",
      correct: true,
    });
    expect(JSON.stringify(trials())).not.toMatch(/band|"ss"/);
  });

  it("names the roster's band and the device beside the trials, and no motor step (B76)", async () => {
    // jsdom's pointer is not coarse, so a cursor. The warm-up has no motor
    // step to run or skip, so that key is not there at all.
    roster.value = { band: "ss", settled: true };
    await sitTheTileTask(4, "False");

    expect(context()).toEqual({
      ageBand: "senior_secondary",
      formFactor: "desktop_cursor",
    });
  });

  it("runs no check for the bands that do not have one", async () => {
    roster.value = { band: "jss", settled: true };
    render(<WarmUpRun dimension="wmc" />);
    await wait(6000);

    expect(screen.queryByText("Is this true or false?")).toBeNull();
    expect(screen.queryByText("True")).toBeNull();
    expect(
      screen.getByText("Tap the tiles you saw, in reverse order."),
    ).toBeInTheDocument();
  });

  it("runs the youngest band on a 3x3 grid", () => {
    roster.value = { band: "p13", settled: true };
    render(<WarmUpRun dimension="wmc" />);

    expect(screen.getAllByRole("button")).toHaveLength(9);
  });

  it("asks the youngest band for two tiles", async () => {
    roster.value = { band: "p13", settled: true };
    await sitTheTileTask(2);

    expect(trials().map((t) => t.condition)).toEqual(["length_2"]);
  });

  it("lights the youngest band's tiles for its own 800ms", () => {
    roster.value = { band: "p13", settled: true };
    vi.spyOn(Math, "random").mockReturnValue(0);
    render(<WarmUpRun dimension="wmc" />);

    sync(560); // the lead-in, then the first tile lights
    expect(litTile()).toBe(0);
    sync(790);
    expect(litTile()).toBe(0);
    sync(20);
    expect(litTile()).toBe(-1);
  });

  it("runs Primary 4-6's version when the roster gives no band, and claims none", async () => {
    await sitTheTileTask(3);

    expect(trials()).toHaveLength(1);
    expect(trials()[0]).toMatchObject({ condition: "length_3", correct: true });
    expect(JSON.stringify(trials())).not.toMatch(/band/);
    // The Primary 4-6 default is the task's size, not the child's age band.
    expect(context()).toEqual({ formFactor: "desktop_cursor" });
  });

  it("lights them for Primary 4-6's 700ms then, not the prototype's 660", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    render(<WarmUpRun dimension="wmc" />);

    sync(560 + 690);
    expect(litTile()).toBe(0);
    sync(20);
    expect(litTile()).toBe(-1);
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
});

describe("the reading task for Primary 1-3 is heard (D81)", () => {
  /*
   * The warm-up showed P1-3 the frame's written sentence. The architecture
   * defines that band as audio-led with no reading, so "a text sentence there
   * is a defect against the architecture rather than a gap in design".
   */
  beforeEach(() => {
    roster.value = { band: "p13", settled: true };
    giveJsdomAVoice();
  });

  it("says the baseline's sentence and shows its pictures, with nothing to read", () => {
    render(<WarmUpRun dimension="reading" />);

    expect(said.map((u) => u.text)).toEqual(["The bus is full of people."]);
    expect(screen.getByRole("button", { name: "A bus" })).toBeInTheDocument();
    expect(screen.getByText("I don't know")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(
      /Garri|The bus is full of people/,
    );
  });

  it("marks the picture against what was said, and times it from the end of the sentence", async () => {
    render(<WarmUpRun dimension="reading" />);
    await wait(1500); // the sentence being said
    act(() => said[0].onend?.());
    await wait(700);

    fireEvent.click(screen.getByRole("button", { name: "A bus" }));
    await wait(1000);

    expect(submitted()).toMatchObject({
      dimension: "reading",
      condition: "audio",
      correct: true,
      responseTimeMs: 700,
    });
  });

  it("gives no time to a picture tapped while the sentence is still being said", async () => {
    render(<WarmUpRun dimension="reading" />);
    await wait(300);

    fireEvent.click(screen.getByRole("button", { name: "A house" }));
    await wait(1000);

    expect(submitted()).toMatchObject({
      condition: "audio",
      correct: false,
      responseTimeMs: null,
    });
  });

  it("records 'I don't know' as declined, never wrong", async () => {
    render(<WarmUpRun dimension="reading" />);

    fireEvent.click(screen.getByText("I don't know"));
    await wait(1000);

    expect(submitted()).toMatchObject({
      response: "not_sure",
      correct: null,
    });
  });

  it("shows the nothing-state on a device that cannot speak, and sends nothing", async () => {
    takeAwayItsVoice();
    render(<WarmUpRun dimension="reading" />);
    await wait(2000);

    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Home" })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Garri|True or false/);
    expect(submit).not.toHaveBeenCalled();
  });
});

describe("the dot task, by band (D81)", () => {
  /** How many dots each array holds, larger first. */
  const arrays = () =>
    [...document.querySelectorAll("div.relative.overflow-hidden")]
      .map((box) => box.querySelectorAll("span.rounded-full").length)
      .sort((a, b) => b - a);
  const firstDot = () =>
    document.querySelector<HTMLElement>("span.rounded-full.bg-nevo-violet")!;

  it("shows the senior band its near-threshold pair in small dots", () => {
    roster.value = { band: "ss", settled: true };
    render(<WarmUpRun dimension="ans" />);

    expect(arrays()).toEqual([13, 12]);
    expect(firstDot().className).toContain("size-2.5");
  });

  it("shows the youngest band its 2:1 pair in large dots", () => {
    roster.value = { band: "p13", settled: true };
    render(<WarmUpRun dimension="ans" />);

    expect(arrays()).toEqual([8, 4]);
    expect(firstDot().className).toContain("size-[22px]");
  });

  it("masks the junior secondary band's arrays after its 500ms, not 850", () => {
    roster.value = { band: "jss", settled: true };
    render(<WarmUpRun dimension="ans" />);

    sync(490);
    expect(screen.getByText("Watch the dots")).toBeInTheDocument();
    sync(20);
    expect(screen.getByText("Which side had more dots?")).toBeInTheDocument();
  });

  it("runs Primary 4-6's pair and 600ms with no band, and times the answer from the mask", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1); // larger on the left
    render(<WarmUpRun dimension="ans" />);
    expect(arrays()).toEqual([9, 5]);

    sync(590);
    expect(screen.getByText("Watch the dots")).toBeInTheDocument();
    sync(10); // masked at 600
    await wait(400);
    fireEvent.click(screen.getByText("Left"));
    await wait(1000);

    expect(submitted()).toMatchObject({
      dimension: "ans",
      condition: "ratio_1.8",
      correct: true,
      responseTimeMs: 400,
    });
  });
});

describe("the pattern task, by band (D81)", () => {
  const icons = () =>
    [...document.querySelectorAll("div.size-1\\/2")].map((d) => d.innerHTML);

  it("shows the senior band its own complex symbols, a different pair", async () => {
    roster.value = { band: "ss", settled: true };
    render(<WarmUpRun dimension="ps" />);

    const [left, right] = icons();
    expect(left).toContain('rx="3"');
    expect(left).not.toEqual(right);

    fireEvent.click(screen.getByText("Different"));
    await wait(1000);
    expect(submitted()).toMatchObject({
      dimension: "ps",
      condition: "different",
      correct: true,
    });
  });

  it("shows the youngest band its object icons", () => {
    roster.value = { band: "p13", settled: true };
    render(<WarmUpRun dimension="ps" />);

    // 2A's P1-3 pair is a star and a fish.
    expect(icons()[0]).toContain("M12 2l2.9 6.3");
  });
});

describe("the flanker, by band (D81)", () => {
  const arrows = () => [...document.querySelectorAll("svg.lucide-arrow-right")];

  it("gives the youngest band its arrow alone, with no congruency to record", async () => {
    roster.value = { band: "p13", settled: true };
    render(<WarmUpRun dimension="attention" />);

    expect(arrows()).toHaveLength(1);

    fireEvent.click(screen.getByText("Right"));
    await wait(1000);
    expect(submitted()).toMatchObject({
      dimension: "attention",
      condition: null,
      correct: true,
    });
  });

  it("draws the senior band's flankers violet, as its Stroop-like flanker does", async () => {
    roster.value = { band: "ss", settled: true };
    render(<WarmUpRun dimension="attention" />);

    const flankers = arrows().filter((_, i) => i !== 2);
    expect(arrows()).toHaveLength(5);
    expect(flankers.every((a) => a.getAttribute("class")!.includes("text-nevo-violet"))).toBe(true);

    fireEvent.click(screen.getByText("Right"));
    await wait(1000);
    expect(submitted()).toMatchObject({
      condition: "incongruent",
      correct: true,
    });
  });

  it("keeps the other bands' flankers grey", () => {
    roster.value = { band: "jss", settled: true };
    render(<WarmUpRun dimension="attention" />);

    expect(
      arrows().some((a) => a.getAttribute("class")!.includes("text-nevo-violet")),
    ).toBe(false);
  });
});
