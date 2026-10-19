import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WarmUpRun } from "./WarmUpRun";
import type { RosterBand } from "@/hooks/useRosterBand";
import type { WarmUpPrompt } from "@/hooks/useWarmUpDimension";
import { clearSession, setSession } from "@/lib/auth/session";
import { markWarmUpDone } from "@/lib/profiling/warmUpDone";

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
const { holdBaseline } = vi.hoisted(() => ({ holdBaseline: vi.fn() }));
vi.mock("@/lib/profiling/pendingBaseline", () => ({ holdBaseline }));
const engine = vi.hoisted(() => ({
  prompt: { state: "waiting" } as WarmUpPrompt,
}));
vi.mock("@/hooks/useWarmUpDimension", () => ({
  useWarmUpPrompt: () => engine.prompt,
}));
// Consent has answered, and not withdrawn: a skip report waits for that.
vi.mock("@/hooks/useConsentGate", () => ({
  useConsentGate: () => ({ withdrawn: false, known: true }),
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
  holdBaseline.mockReset();
  engine.prompt = { state: "waiting" };
  roster.value = { band: null, settled: true };
  window.localStorage.clear();
  clearSession();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  takeAwayItsVoice();
  clearSession();
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

  it("hands focus to the grid once the senior band's check is answered", async () => {
    // As in tile memory: the pressed button went with the check, and focus
    // fell to the page past the grid, so the next Tab left the screen.
    roster.value = { band: "ss", settled: true };
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    render(<WarmUpRun dimension="wmc" />);
    await wait(6000);
    const answer = screen.getByText("False");
    answer.focus();
    fireEvent.click(answer);

    const grid = screen.getByTestId("warmup-grid");
    expect(document.activeElement).toBe(grid);
    expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });
    focus.mockRestore();
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

    // The loading state (D169), and only its way Home.
    expect(screen.getByText("Getting your warm-up ready")).toBeInTheDocument();
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

describe("the reading task says how many words it showed (Teslim 18 Oct #6)", () => {
  /*
   * "For a timed reading trial, send the number of words actually displayed
   * as `readingWordCount`." The warm-up's reading round sent none, as the
   * baseline's did not, so a recalibration could not move a child's reading
   * speed off the 120 wpm default either. Counted from the text on screen:
   * the passage or the sentence, never the question or the options.
   */
  it("sends the senior band's passage words, and not its question's or options'", async () => {
    roster.value = { band: "ss", settled: true };
    render(<WarmUpRun dimension="reading" />);
    await wait(18_000);

    fireEvent.click(screen.getByText("To track her savings for school fees"));
    await wait(1000);

    expect(submitted()).toMatchObject({
      condition: "passage",
      responseTimeMs: 18_000,
      readingWordCount: 60,
    });
  });

  it("sends the junior secondary band's sentence words", async () => {
    roster.value = { band: "jss", settled: true };
    render(<WarmUpRun dimension="reading" />);
    await wait(3000);

    fireEvent.click(screen.getByText("True"));
    await wait(1000);

    expect(submitted()).toMatchObject({
      condition: "sentence",
      responseTimeMs: 3000,
      readingWordCount: 16,
    });
  });

  it("sends the frame's sentence's words with no band, a 'Not sure' included", async () => {
    // "Garri is made from cassava.", Primary 4-6's.
    render(<WarmUpRun dimension="reading" />);
    await wait(2000);

    fireEvent.click(screen.getByText("Not sure"));
    await wait(1000);

    expect(submitted()).toMatchObject({
      response: "not_sure",
      readingWordCount: 5,
    });
  });

  it("sends none for Primary 1-3's sentence, which is heard and not read", async () => {
    roster.value = { band: "p13", settled: true };
    giveJsdomAVoice();
    render(<WarmUpRun dimension="reading" />);
    await wait(1500);
    act(() => said[0].onend?.());
    await wait(700);

    fireEvent.click(screen.getByRole("button", { name: "A bus" }));
    await wait(1000);

    expect(submitted()).toMatchObject({ condition: "audio", responseTimeMs: 700 });
    expect(submitted()).not.toHaveProperty("readingWordCount");
  });

  it("sends none for a task that is not reading", async () => {
    roster.value = { band: "ss", settled: true };
    render(<WarmUpRun dimension="ps" />);
    await wait(1200);

    fireEvent.click(screen.getByText("Different"));
    await wait(1000);

    expect(submitted()).toMatchObject({ dimension: "ps", responseTimeMs: 1200 });
    expect(submitted()).not.toHaveProperty("readingWordCount");
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

  it("writes no line above the pictures, which no frame gives it", () => {
    // It carried the baseline's "Listen, then tap the matching picture",
    // and neither the baseline's frame nor the warm-up's has those words.
    render(<WarmUpRun dimension="reading" />);

    expect(document.body.textContent).not.toMatch(/listen, then tap/i);
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

  it("shows the nothing-state on a device that cannot speak, with no task in its place (D139)", async () => {
    takeAwayItsVoice();
    render(<WarmUpRun dimension="reading" />);
    await wait(2000);

    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Home" })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Garri|True or false/);
    // Nothing to give is not still asking.
    expect(screen.queryByText("Getting your warm-up ready")).toBeNull();
  });

  /*
   * B117, 13 Oct: "skipped means an activity could not be presented". It sent
   * nothing, so the engine heard nothing and would ask for the same again.
   */
  it("tells the engine the heard round could not be given, once, with its band", async () => {
    takeAwayItsVoice();
    signIn();
    render(<WarmUpRun dimension="reading" />);
    await wait(2000);

    expect(submit).toHaveBeenCalledTimes(1);
    expect(trials()).toEqual([
      {
        dimension: "reading",
        condition: "audio",
        response: null,
        correct: null,
        responseTimeMs: null,
        probeItemId: null,
        skipped: true,
      },
    ]);
    // P1-3 is why it is heard, so it is the band the round was sized for.
    expect(context()).toEqual({
      ageBand: "early_primary",
      formFactor: "desktop_cursor",
    });
    // Sent, never parked: it must not take a real run's place in the slot.
    expect(holdBaseline).not.toHaveBeenCalled();
  });

  it("does not park the report when its write fails", async () => {
    takeAwayItsVoice();
    signIn();
    submit.mockResolvedValue(false);
    render(<WarmUpRun dimension="reading" />);
    await wait(2000);

    expect(submit).toHaveBeenCalledTimes(1);
    expect(holdBaseline).not.toHaveBeenCalled();
  });

  it("reports nothing on a day already done", async () => {
    takeAwayItsVoice();
    signIn();
    markWarmUpDone("child-1");
    render(<WarmUpRun dimension="reading" />);
    await wait(2000);

    expect(submit).not.toHaveBeenCalled();
  });

  it("reports nothing skipped where the device can speak", async () => {
    signIn();
    render(<WarmUpRun dimension="reading" />);
    await wait(2000);

    expect(submit).not.toHaveBeenCalled();
  });
});

describe("the band beside a served question (B118)", () => {
  /*
   * B118, 13 Oct: "ageBand is the band the activity was sized for. Omit it
   * when unknown." A served question is the engine's item as it came; the
   * device sizes nothing about it, so it claims no band.
   */
  it("claims none, whatever the roster's band", async () => {
    roster.value = { band: "ss", settled: true };
    engine.prompt = {
      state: "ready",
      dimension: "domain",
      live: true,
      item: {
        itemId: "6f1c2b0e-8a7d-4e57-9b8e-2c4d5f6a7b8c",
        question: "What is 7 times 8?",
        options: [
          { value: "opt-a", label: "54" },
          { value: "opt-b", label: "56" },
        ],
      },
    };
    render(<WarmUpRun />);

    fireEvent.click(screen.getByText("56"));
    await wait(1000);

    expect(submitted()).toMatchObject({ dimension: "domain", response: "opt-b" });
    expect(context()).toEqual({ formFactor: "desktop_cursor" });
  });

  it("claims none for a question task it could not give either (B117)", async () => {
    signIn();
    roster.value = { band: "ss", settled: true };
    engine.prompt = { state: "none", cannotPresent: "domain" };
    render(<WarmUpRun />);
    await wait(1000);

    expect(submitted()).toMatchObject({ dimension: "domain", skipped: true });
    expect(context()).toEqual({ formFactor: "desktop_cursor" });
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

  it("scatters each band's dots as the baseline does, 1.5 dots apart on the phone's box (D197)", () => {
    // They flowed in rows 10px apart. Design: "the warm-up scatters them the
    // way the baseline does instead of flowing them in rows". Measured on
    // the phone's 150px box, the smaller, less its 2px border.
    const INNER = 146;
    const sizes = { p13: 22, p46: 16, jss: 13, ss: 10 } as const;
    const expected = { p13: [8, 4], p46: [9, 5], jss: [12, 8], ss: [13, 12] };
    for (const band of ["p13", "p46", "jss", "ss"] as const) {
      roster.value = { band, settled: true };
      render(<WarmUpRun dimension="ans" />);
      const d = sizes[band];

      // Counts unchanged: only where the dots go is new.
      expect(arrays()).toEqual(expected[band]);
      for (const box of screen.getAllByTestId("warmup-dot-box")) {
        expect(box.className).not.toMatch(/flex-wrap/);
        const dots = [...box.querySelectorAll<HTMLElement>("span.rounded-full")].map(
          (s) => {
            expect(s.className).toContain("absolute");
            return {
              x: (parseFloat(s.style.left) / 100) * INNER,
              y: (parseFloat(s.style.top) / 100) * INNER,
            };
          },
        );
        let closest = Infinity;
        for (let i = 0; i < dots.length; i++)
          for (let j = i + 1; j < dots.length; j++)
            closest = Math.min(
              closest,
              Math.hypot(dots[i].x - dots[j].x, dots[i].y - dots[j].y),
            );
        expect(closest, band).toBeGreaterThanOrEqual(d * 1.5);
        // Inside the box, clear of its edge, as the baseline keeps them.
        for (const p of dots) {
          expect(p.x).toBeGreaterThanOrEqual(14);
          expect(p.y).toBeGreaterThanOrEqual(14);
          expect(p.x + d).toBeLessThanOrEqual(INNER - 14 + 1e-9);
          expect(p.y + d).toBeLessThanOrEqual(INNER - 14 + 1e-9);
        }
      }
      cleanup();
    }
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
    fireEvent.click(screen.getByRole("button", { name: "Left" }));
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
  /** The stimulus's arrows, not the answer buttons'. */
  const arrows = () => [
    ...document.querySelectorAll('[data-testid="warmup-flanker"] svg.lucide-arrow-right'),
  ];

  it("answers with the baseline's arrow buttons, never the words, P1-3 included", () => {
    // It was two buttons reading "Left" and "Right" for every band, where
    // the baseline's flanker answers with arrows - which a child who cannot
    // yet read can use - at each band's size.
    roster.value = { band: "p13", settled: true };
    render(<WarmUpRun dimension="attention" />);

    const left = screen.getByRole("button", { name: "Left" });
    const right = screen.getByRole("button", { name: "Right" });
    for (const b of [left, right]) {
      expect(b.textContent).toBe("");
      expect(b.querySelector("svg.lucide-arrow-right")).not.toBeNull();
      // P1-3's 160x80 from tablet up (`Nevo Flanker Frame`).
      expect(b.className).toContain("sm:h-20");
      expect(b.className).toContain("sm:w-[160px]");
    }
    expect(left.querySelector("svg")!.getAttribute("class")).toContain("rotate-180");
  });

  it("sizes them as each band's flanker does", () => {
    roster.value = { band: "jss", settled: true };
    render(<WarmUpRun dimension="attention" />);

    const right = screen.getByRole("button", { name: "Right" });
    expect(right.textContent).toBe("");
    expect(right.className).toContain("sm:h-[68px]");
    expect(right.className).toContain("sm:w-[150px]");
  });

  it("gives the youngest band its arrow alone, with no congruency to record", async () => {
    roster.value = { band: "p13", settled: true };
    render(<WarmUpRun dimension="attention" />);

    expect(arrows()).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Right" }));
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

    fireEvent.click(screen.getByRole("button", { name: "Right" }));
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
