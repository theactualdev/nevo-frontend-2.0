import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SentenceDotModule, dotPositions, scatterDots } from "./SentenceDotModule";
import { BaselineCapture, baselineTrials } from "@/lib/profiling/capture";
import { AGE_BANDS, dotPairs } from "@/lib/profiling/bands";

/**
 * Module 3 asked children questions and recorded none of their answers.
 *
 * The sentences were bare strings, the passage options a bare array, and the
 * P1-3 activity had no sentence at all - a play control with no `onClick` and
 * no asset, under "Listen, then tap the matching picture". A six-year-old
 * pressed a dead button and guessed between three drawings, twice, and that
 * guess became the youngest band's entire reading measure.
 *
 * These tests assert on the CAPTURE rather than the screen, because the capture
 * is the only part a child's profile is built from and the only part that was
 * wrong. Every one of them passes against a module that renders perfectly.
 */

/** The `trial_pick` payloads the module recorded, in order. */
const picks = (capture: BaselineCapture, act?: string) =>
  capture.stream
    .filter((e) => e.kind === "trial_pick")
    .map((e) => e.payload as Record<string, unknown>)
    .filter((p) => !act || p.act === act);

/** jsdom has no speech at all, so the P1-3 activity needs one supplied. */
const spoken: string[] = [];
/** What was handed to speech, so a test can say when it finished. */
const utterances: { text: string; onend?: () => void }[] = [];
function giveJsdomAVoice() {
  spoken.length = 0;
  utterances.length = 0;
  // Adding what jsdom LACKS, which is safe; replacing what it has is the trap
  // that hangs the worker.
  (
    window as unknown as { SpeechSynthesisUtterance: unknown }
  ).SpeechSynthesisUtterance = class {
    rate = 1;
    constructor(public text: string) {}
  };
  (window as unknown as { speechSynthesis: unknown }).speechSynthesis = {
    cancel: () => {},
    speak: (u: { text: string; onend?: () => void }) => {
      spoken.push(u.text);
      utterances.push(u);
    },
  };
}

function takeAwayItsVoice() {
  delete (window as unknown as Record<string, unknown>).speechSynthesis;
  delete (window as unknown as Record<string, unknown>)
    .SpeechSynthesisUtterance;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  takeAwayItsVoice();
});

describe("SentenceDotModule — the reading half is scored", () => {
  it("marks a child right for knowing Lagos is not the capital", () => {
    const capture = new BaselineCapture("s1");
    render(
      <SentenceDotModule band="p46" capture={capture} onComplete={() => {}} />,
    );
    // Trial 2 of the P4-6 set is the false one, so move past the first.
    fireEvent.click(screen.getByText("True"));
    act(() => void vi.advanceTimersByTime(500));

    expect(screen.getByText("Lagos is the capital of Nigeria.")).toBeVisible();
    fireEvent.click(screen.getByText("False"));

    expect(picks(capture, "reading")[1]).toMatchObject({ correct: true });
  });

  it("marks the same child wrong for answering True to it", () => {
    const capture = new BaselineCapture("s2");
    render(
      <SentenceDotModule band="p46" capture={capture} onComplete={() => {}} />,
    );
    fireEvent.click(screen.getByText("True"));
    act(() => void vi.advanceTimersByTime(500));
    fireEvent.click(screen.getByText("True"));

    expect(picks(capture, "reading")[1]).toMatchObject({ correct: false });
  });

  it("never marks 'Not sure' wrong", () => {
    // It is offered deliberately, and a child who says so has told the truth.
    const capture = new BaselineCapture("s3");
    render(
      <SentenceDotModule band="p46" capture={capture} onComplete={() => {}} />,
    );
    fireEvent.click(screen.getByText("Not sure"));

    const pick = picks(capture, "reading")[0];
    expect(pick.notSure).toBe(true);
    expect(pick.correct).toBeUndefined();
  });

  it("scores the SS passage question", () => {
    const capture = new BaselineCapture("s4");
    render(
      <SentenceDotModule band="ss" capture={capture} onComplete={() => {}} />,
    );
    fireEvent.click(screen.getByText("To track her savings for school fees"));

    expect(picks(capture, "reading")[0]).toMatchObject({ correct: true });
  });
});

describe("SentenceDotModule — P1-3 is actually asked something", () => {
  it("speaks the sentence when the trial arrives", () => {
    giveJsdomAVoice();
    render(
      <SentenceDotModule
        band="p13"
        capture={undefined}
        onComplete={() => {}}
      />,
    );

    expect(spoken).toEqual(["The bus is full of people."]);
  });

  it("says it again when a child presses play", () => {
    giveJsdomAVoice();
    render(
      <SentenceDotModule
        band="p13"
        capture={undefined}
        onComplete={() => {}}
      />,
    );

    fireEvent.click(screen.getByLabelText("Play the sentence again"));

    expect(spoken).toHaveLength(2);
  });

  it("scores the picture a child taps against what they heard", () => {
    giveJsdomAVoice();
    const capture = new BaselineCapture("s5");
    render(
      <SentenceDotModule band="p13" capture={capture} onComplete={() => {}} />,
    );

    fireEvent.click(screen.getByLabelText("A bus"));

    expect(picks(capture, "reading")[0]).toMatchObject({ correct: true });
  });

  it("skips the activity entirely rather than mime it", () => {
    // No speech in this browser. Miming the question produced a three-way
    // guess filed as a reading measure, which is worse than measuring nothing.
    const capture = new BaselineCapture("s6");
    render(
      <SentenceDotModule band="p13" capture={capture} onComplete={() => {}} />,
    );

    expect(screen.queryByLabelText("Play the sentence again")).toBeNull();
    expect(screen.queryByLabelText("A bus")).toBeNull();
    // Straight to the dots, which need no voice.
    expect(screen.getByText("Watch the dots")).toBeVisible();
  });

  /*
   * B117, 13 Oct: "skipped means an activity could not be presented". It sent
   * nothing, so the engine could not tell a reading the device could not give
   * from one nobody tried to give.
   */
  it("tells the engine each heard trial was not presented, once (B117)", () => {
    const capture = new BaselineCapture("s7");
    // Strict mode runs the effect twice; the report still goes once.
    render(
      <StrictMode>
        <SentenceDotModule band="p13" capture={capture} onComplete={() => {}} />
      </StrictMode>,
    );

    const skipped = {
      dimension: "reading",
      condition: "audio",
      response: null,
      correct: null,
      responseTimeMs: null,
      probeItemId: null,
      skipped: true,
    };
    expect(baselineTrials(capture)).toEqual([skipped, skipped]);
  });

  it("reports nothing skipped on a device that can speak", () => {
    giveJsdomAVoice();
    const capture = new BaselineCapture("s8");
    render(
      <SentenceDotModule band="p13" capture={capture} onComplete={() => {}} />,
    );

    expect(capture.ofKind("unpresented")).toEqual([]);
  });

  it("reports nothing skipped for a band that reads its sentences", () => {
    // Only the heard activity needs a voice; a sentence read needs none.
    const capture = new BaselineCapture("s9");
    render(
      <SentenceDotModule band="p46" capture={capture} onComplete={() => {}} />,
    );

    expect(capture.ofKind("unpresented")).toEqual([]);
  });
});

describe("SentenceDotModule — the dots have no fixed answer", () => {
  /*
   * Every pair drew its larger count on the left, in every band, so the first
   * button was always right and a child who tapped it every time scored full
   * marks on a number-sense measure. The side is now drawn per run.
   */
  const toTheDots = () => {
    // No voice, so the P1-3 run goes straight to the dots.
    const capture = new BaselineCapture("dots");
    render(
      <SentenceDotModule band="p13" capture={capture} onComplete={() => {}} />,
    );
    act(() => void vi.advanceTimersByTime(1000)); // past the reveal, masked
    return capture;
  };
  const first = () => screen.getByRole("button", { name: /Top|Left/ });

  afterEach(() => vi.restoreAllMocks());

  it("marks the first button wrong when the larger array is on the right", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const capture = toTheDots();

    fireEvent.click(first());

    const [p] = picks(capture, "dots");
    expect(p).toMatchObject({ correct: false });
    expect(Number(p.a)).toBeLessThan(Number(p.b));
  });

  it("marks it right when the larger array is on the left", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.9);
    const capture = toTheDots();

    fireEvent.click(first());

    expect(picks(capture, "dots")[0]).toMatchObject({ correct: true });
  });

  it("records how close the two counts were", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.9);
    const capture = toTheDots();

    fireEvent.click(first());

    // P1-3's first pair is 8 against 4.
    expect(picks(capture, "dots")[0]).toMatchObject({ ratio: 2 });
  });
});

describe("SentenceDotModule — each band's dots", () => {
  /*
   * 16px dots in a 200px box for 850ms, for every band. The Dot Comparison
   * frame gives 22 / 16 / 13 / 10px dots and a 220px box for P1-3, and 09c
   * gives P1-3 800ms and JSS 500ms.
   */
  const dotsOf = () => document.querySelectorAll<HTMLElement>("span.absolute.bg-nevo-violet");
  const box = () => dotsOf()[0].parentElement!;

  it("draws P1-3 large dots in the larger box", () => {
    // No voice in jsdom, so P1-3 opens on the dots.
    render(<SentenceDotModule band="p13" onComplete={() => {}} />);

    expect(dotsOf()[0].className).toContain("size-[22px]");
    expect(box().className).toContain("sm:size-[220px]");
  });

  it("draws SS near-threshold dots small", () => {
    render(<SentenceDotModule band="ss" onComplete={() => {}} />);
    // Past the passage, which "Not sure" answers.
    fireEvent.click(screen.getByText("Not sure"));
    act(() => void vi.advanceTimersByTime(500));

    expect(dotsOf()[0].className).toContain("size-2.5");
  });

  it("masks JSS's arrays after 500ms, not 850", () => {
    render(<SentenceDotModule band="jss" onComplete={() => {}} />);
    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByText("Not sure"));
      act(() => void vi.advanceTimersByTime(500));
    }
    act(() => void vi.advanceTimersByTime(10));
    expect(screen.getByText("Watch the dots")).toBeVisible();

    act(() => void vi.advanceTimersByTime(520));

    expect(screen.queryByText("Watch the dots")).toBeNull();
  });

  it("masks P1-3's after 800ms", () => {
    render(<SentenceDotModule band="p13" onComplete={() => {}} />);
    act(() => void vi.advanceTimersByTime(790));
    expect(screen.getByText("Watch the dots")).toBeVisible();

    act(() => void vi.advanceTimersByTime(20));

    expect(screen.queryByText("Watch the dots")).toBeNull();
  });

  /*
   * P4-6 and SS ran the prototype's 850ms while 09c disagreed with it or said
   * nothing. Design settled both at 600ms on 6 Oct (D75); SS "not shorter:
   * ratio is already at threshold". The mask is when the dots open for an
   * answer, so `openAfterMs` on the first dot trial is the display time.
   */
  const firstDotDisplay = (band: "p46" | "ss", readings: number) => {
    const capture = new BaselineCapture(`reveal-${band}`);
    render(
      <SentenceDotModule band={band} capture={capture} onComplete={() => {}} />,
    );
    for (let i = 0; i < readings; i++) {
      fireEvent.click(screen.getByText("Not sure"));
      act(() => void vi.advanceTimersByTime(500));
    }
    act(() => void vi.advanceTimersByTime(1_000));
    return capture.stream.find(
      (e) => e.kind === "response_open" && e.payload?.act === "dots",
    )?.payload?.openAfterMs;
  };

  it("shows the frame's pair, then the two its ratio derives (D76)", () => {
    // P1-3 ran 7:3 and 9:5 after the frame's 8:4: one easier than 2:1 and
    // one harder. Its trials 2 and 3 are now 6:3 and 10:5 (see `dotPairs`).
    const capture = new BaselineCapture("pairs");
    render(
      <SentenceDotModule band="p13" capture={capture} onComplete={() => {}} />,
    );
    for (let i = 0; i < 3; i++) {
      act(() => void vi.advanceTimersByTime(1_000)); // past the reveal
      fireEvent.click(screen.getByRole("button", { name: /Top|Left/ }));
      act(() => void vi.advanceTimersByTime(500)); // the pressed beat
    }

    const shown = picks(capture, "dots").map(({ a, b }) => [
      Math.max(Number(a), Number(b)),
      Math.min(Number(a), Number(b)),
    ]);
    expect(shown).toEqual([
      [8, 4],
      [6, 3],
      [10, 5],
    ]);
  });

  it("masks P4-6's after 600ms (D75)", () => {
    expect(firstDotDisplay("p46", 3)).toBe(600);
  });

  it("masks SS's after 600ms, no shorter (D75)", () => {
    expect(firstDotDisplay("ss", 1)).toBe(600);
  });
});

describe("SentenceDotModule — a child sees every dot that is counted", () => {
  /*
   * Dots went anywhere between 8% and 84% of the box with no spacing, so some
   * landed on others: SS's 12 read as 11 beside a 13 that read as 10, and
   * P1-3's 3 read as 2. The count recorded was not the count on screen.
   * Sizes are the Dot Comparison frame's; the box is the smallest any band
   * draws, 200px less its 2px border.
   */
  const DOT_PX = { p13: 22, p46: 16, jss: 13, ss: 10 } as const;
  const INNER = 196;
  const MIN = 1.5;
  const px = (p: { x: number; y: number }) => ({
    x: (p.x / 100) * INNER,
    y: (p.y / 100) * INNER,
  });
  /** The closest two centres in an array, in px. */
  const closest = (dots: { x: number; y: number }[]) => {
    let best = Infinity;
    for (let i = 0; i < dots.length; i++)
      for (let j = i + 1; j < dots.length; j++)
        best = Math.min(best, Math.hypot(dots[i].x - dots[j].x, dots[i].y - dots[j].y));
    return best;
  };

  it("keeps every pair of dots apart, in every band's pairs, on both sides", () => {
    for (const band of Object.values(AGE_BANDS)) {
      const d = DOT_PX[band];
      dotPairs(band).forEach((pair, trial) => {
        for (const side of [0, 1])
          for (const count of [pair.a, pair.b]) {
            const dots = dotPositions(band, trial, side, count).map(px);
            // Exactly as many as the pair says: only where they go changed.
            expect(dots).toHaveLength(count);
            expect(closest(dots), `${band} trial ${trial} side ${side} ${count}`)
              .toBeGreaterThanOrEqual(d * MIN);
            // Inside the box, clear of its edge.
            for (const p of dots) {
              expect(p.x).toBeGreaterThanOrEqual(14);
              expect(p.y).toBeGreaterThanOrEqual(14);
              expect(p.x + d).toBeLessThanOrEqual(INNER - 14 + 1e-9);
              expect(p.y + d).toBeLessThanOrEqual(INNER - 14 + 1e-9);
            }
          }
      });
    }
  });

  it("places them the same way every time", () => {
    expect(dotPositions("ss", 0, 1, 12)).toEqual(dotPositions("ss", 0, 1, 12));
  });

  it("falls back to an even lattice where random places run out, still apart", () => {
    // Sixteen 30px dots: too crowded to place at random, not for the lattice.
    const dots = scatterDots(16, 7, 30).map(px);

    expect(dots).toHaveLength(16);
    expect(closest(dots)).toBeGreaterThanOrEqual(30 * MIN);
  });

  it("draws the arrays it promises, spaced, on screen", () => {
    // The larger on the right: P1-3's 8, which overlapped there, on side 1.
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    render(<SentenceDotModule band="p13" onComplete={() => {}} />);

    const boxes = [
      ...new Set(
        [...document.querySelectorAll<HTMLElement>("span.absolute.bg-nevo-violet")].map(
          (s) => s.parentElement!,
        ),
      ),
    ];
    const arrays = boxes.map((b) =>
      [...b.querySelectorAll<HTMLElement>("span")].map((s) =>
        px({ x: parseFloat(s.style.left), y: parseFloat(s.style.top) }),
      ),
    );
    expect(arrays.map((a) => a.length)).toEqual([4, 8]);
    for (const a of arrays) expect(closest(a)).toBeGreaterThanOrEqual(22 * MIN);
    vi.restoreAllMocks();
  });
});

describe("SentenceDotModule — the question matches the buttons", () => {
  it("asks top or bottom on a phone, and which had more from tablet up", () => {
    // It asked which SIDE had more above buttons reading Top and Bottom.
    render(<SentenceDotModule band="p13" onComplete={() => {}} />);
    act(() => void vi.advanceTimersByTime(1000));

    const phone = screen.getByText("Which had more dots: top or bottom?");
    const wide = screen.getByText("Which had more dots?");
    expect(phone.className).toContain("sm:hidden");
    expect(wide.className).toContain("hidden sm:inline");
    expect(document.body.textContent).not.toMatch(/which side/i);
  });
});

describe("SentenceDotModule — 3A says only what a frame gives it", () => {
  /*
   * "Listen, then tap the matching picture" and "Read it, then answer" sat
   * in a bubble over the heard pictures and the passage. No frame has either:
   * `Nevo Sentence Verify Frame` draws 3A with no avatar row.
   */
  const bubble = () => screen.queryByRole("status");

  it("puts no bubble over the heard pictures", () => {
    giveJsdomAVoice();
    render(<SentenceDotModule band="p13" onComplete={() => {}} />);

    expect(screen.getByLabelText("A bus")).toBeInTheDocument();
    expect(bubble()).toBeNull();
    expect(document.body.textContent).not.toMatch(/listen, then tap/i);
  });

  it("puts none over the passage", () => {
    render(<SentenceDotModule band="ss" onComplete={() => {}} />);

    expect(screen.getByText("Why does Ada keep a notebook?")).toBeInTheDocument();
    expect(bubble()).toBeNull();
    expect(document.body.textContent).not.toMatch(/read it, then answer/i);
  });

  it("puts none over a sentence either, in any band that reads one (D198)", () => {
    // "Is this true or false?" was the playable prototype's (11:324). Lydia,
    // 13 Oct: "Drop it. It came from the prototype, no frame draws it."
    for (const band of ["p46", "jss"] as const) {
      render(<SentenceDotModule band={band} onComplete={() => {}} />);

      expect(screen.getByRole("button", { name: "True" })).toBeInTheDocument();
      expect(bubble()).toBeNull();
      expect(document.body.textContent).not.toMatch(/true or false/i);
      cleanup();
    }
  });
});

describe("SentenceDotModule — a new trial paints clean", () => {
  /*
   * The buttons eased their colour, and the same button carries on into the
   * next trial, so the last answer's violet faded out over a fresh one. The
   * frames move only the scale (`.sv-tap`, `.dc-tap`).
   */
  const easesColour = /transition-(colors|all)|transition-\[[^\]]*(background|border|color)/;

  it("draws the next sentence's buttons unpressed, with no colour to fade", () => {
    render(<SentenceDotModule band="p46" onComplete={() => {}} />);
    fireEvent.click(screen.getByText("True"));
    act(() => void vi.advanceTimersByTime(500));

    for (const label of ["True", "False", "Not sure"]) {
      const b = screen.getByText(label);
      expect(b.className).not.toContain("bg-nevo-violet");
      expect(b.className).not.toMatch(easesColour);
    }
  });

  it("does the same for the dots' buttons and the heard pictures' I don't know", () => {
    render(<SentenceDotModule band="p13" onComplete={() => {}} />);
    act(() => void vi.advanceTimersByTime(1000));
    for (const b of screen.getAllByRole("button"))
      expect(b.className).not.toMatch(easesColour);
    cleanup();

    giveJsdomAVoice();
    render(<SentenceDotModule band="p13" onComplete={() => {}} />);
    expect(
      screen.getByRole("button", { name: /I don.t know/ }).className,
    ).not.toMatch(easesColour);
  });
});

describe("SentenceDotModule — buttons at the frames' sizes", () => {
  it("draws True, False and Not sure 52px tall, full width on a phone and 168px up", () => {
    // They were the module's 180x56 default.
    render(<SentenceDotModule band="p46" onComplete={() => {}} />);

    for (const label of ["True", "False", "Not sure"]) {
      const b = screen.getByText(label);
      expect(b.className).toContain("h-[52px]");
      expect(b.className).toMatch(/(^| )w-full( |$)/);
      expect(b.className).toContain("sm:w-[168px]");
    }
  });

  it("draws the dots' buttons full width at 16px on a phone, 200x64 at 18px up", () => {
    // They were 170x56 from tablet up, and 300 wide at 18px on a phone.
    render(<SentenceDotModule band="p13" onComplete={() => {}} />);
    act(() => void vi.advanceTimersByTime(1000));

    const b = screen.getByRole("button", { name: /Top|Left/ });
    expect(b.className).toMatch(/(^| )w-full( |$)/);
    expect(b.className).toContain("text-base");
    expect(b.className).toContain("sm:h-16");
    expect(b.className).toContain("sm:w-[200px]");
    expect(b.className).toContain("sm:text-lg");
    expect(b.parentElement!.className).not.toContain("max-w-[300px]");
  });
});

describe("SentenceDotModule — the listening task has an honest non-answer", () => {
  it("offers 'I don't know' and records it as declined, never wrong", () => {
    giveJsdomAVoice();
    const capture = new BaselineCapture("idk");
    render(
      <SentenceDotModule band="p13" capture={capture} onComplete={() => {}} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /I don.t know/ }));

    const pick = picks(capture, "reading")[0];
    expect(pick.notSure).toBe(true);
    expect(pick.correct).toBeUndefined();
  });
});

describe("SentenceDotModule — response time starts when the child can answer", () => {
  /*
   * rtMs ran from presentation, so it carried the dot reveal (now different
   * per band) and the device's speech, and the offset went nowhere.
   */
  it("times a dot answer from the mask, and says how long the reveal was", () => {
    const capture = new BaselineCapture("rt-dots");
    render(
      <SentenceDotModule band="p13" capture={capture} onComplete={() => {}} />,
    );
    act(() => void vi.advanceTimersByTime(800)); // the mask lands
    act(() => void vi.advanceTimersByTime(300)); // the child thinks

    fireEvent.click(screen.getByRole("button", { name: /Top|Left/ }));

    expect(picks(capture, "dots")[0]).toMatchObject({
      rtMs: 300,
      openAfterMs: 800,
    });
  });

  it("times a heard answer from the end of the sentence", () => {
    giveJsdomAVoice();
    const capture = new BaselineCapture("rt-audio");
    render(
      <SentenceDotModule band="p13" capture={capture} onComplete={() => {}} />,
    );
    act(() => void vi.advanceTimersByTime(2000)); // the sentence is spoken
    act(() => utterances[0].onend?.());
    act(() => void vi.advanceTimersByTime(700));

    fireEvent.click(screen.getByLabelText("A bus"));

    expect(picks(capture, "reading")[0]).toMatchObject({
      rtMs: 700,
      openAfterMs: 2000,
    });
  });

  it("gives no time at all to an answer made while it was still speaking", () => {
    // Timing it from presentation would put the device's speech back in.
    giveJsdomAVoice();
    const capture = new BaselineCapture("rt-early");
    render(
      <SentenceDotModule band="p13" capture={capture} onComplete={() => {}} />,
    );
    act(() => void vi.advanceTimersByTime(600));

    fireEvent.click(screen.getByLabelText("A bus"));

    expect(picks(capture, "reading")[0]).toMatchObject({
      rtMs: null,
      beforeOpen: true,
      correct: true,
    });
  });

  it("ignores the end of a sentence that was cut off by a replay", () => {
    giveJsdomAVoice();
    const capture = new BaselineCapture("rt-replay");
    render(
      <SentenceDotModule band="p13" capture={capture} onComplete={() => {}} />,
    );
    fireEvent.click(screen.getByLabelText("Play the sentence again"));
    // The first, cancelled utterance reports its end late.
    act(() => utterances[0].onend?.());

    fireEvent.click(screen.getByLabelText("A bus"));

    expect(picks(capture, "reading")[0]).toMatchObject({ beforeOpen: true });
  });
});

describe("SentenceDotModule — a read trial says how many words it showed", () => {
  /*
   * Teslim, 18 Oct #6: "For a timed reading trial, send the number of words
   * actually displayed as `readingWordCount`." The reading trials sent none,
   * so the server could derive no reading speed and every child's reading
   * starting point was the 120 wpm default (Lydia's 17 Oct order of work).
   *
   * The counts below are counted by hand from the text on screen: whitespace
   * apart, punctuation with its word, "mid-morning" and "brother's" one each.
   */
  const readingTrials = (capture: BaselineCapture) =>
    baselineTrials(capture).filter((t) => t.dimension === "reading");
  /** Answer each sentence in turn, a little while after it appears. */
  const answerTheSentences = (labels: string[]) => {
    for (const label of labels) {
      act(() => void vi.advanceTimersByTime(1500)); // the child reads
      fireEvent.click(screen.getByText(label));
      act(() => void vi.advanceTimersByTime(500)); // the pressed beat
    }
  };

  it("sends the words of each P4-6 sentence, a 'Not sure' included", () => {
    const capture = new BaselineCapture("wc-p46");
    render(
      <SentenceDotModule band="p46" capture={capture} onComplete={() => {}} />,
    );

    answerTheSentences(["True", "False", "Not sure"]);

    // "Garri is made from cassava." / "Lagos is the capital of Nigeria." /
    // "The danfo bus runs from Oshodi to CMS."
    expect(readingTrials(capture)).toMatchObject([
      { condition: "sentence", responseTimeMs: 1500, readingWordCount: 5 },
      { condition: "sentence", responseTimeMs: 1500, readingWordCount: 6 },
      { response: "not_sure", responseTimeMs: 1500, readingWordCount: 8 },
    ]);
  });

  it("sends the words of each JSS sentence", () => {
    const capture = new BaselineCapture("wc-jss");
    render(
      <SentenceDotModule band="jss" capture={capture} onComplete={() => {}} />,
    );

    answerTheSentences(["True", "True", "True"]);

    expect(readingTrials(capture).map((t) => t.readingWordCount)).toEqual([
      16, 7, 10,
    ]);
  });

  it("sends the passage's words for SS, and not its question's or options'", () => {
    const capture = new BaselineCapture("wc-ss");
    render(
      <SentenceDotModule band="ss" capture={capture} onComplete={() => {}} />,
    );
    act(() => void vi.advanceTimersByTime(20_000));

    fireEvent.click(screen.getByText("To track her savings for school fees"));

    // The passage alone is 60. With "Why does Ada keep a notebook?" it would
    // be 66, and the four options would add 23 more.
    expect(readingTrials(capture)).toMatchObject([
      { condition: "passage", responseTimeMs: 20_000, readingWordCount: 60 },
    ]);
  });

  it("sends them when SS declines the passage too", () => {
    const capture = new BaselineCapture("wc-ss-declined");
    render(
      <SentenceDotModule band="ss" capture={capture} onComplete={() => {}} />,
    );

    fireEvent.click(screen.getByText("Not sure"));

    expect(readingTrials(capture)[0]).toMatchObject({
      response: "not_sure",
      readingWordCount: 60,
    });
  });

  it("sends none for a sentence P1-3 hears, which is not timed reading", () => {
    giveJsdomAVoice();
    const capture = new BaselineCapture("wc-p13");
    render(
      <SentenceDotModule band="p13" capture={capture} onComplete={() => {}} />,
    );
    act(() => utterances[0].onend?.());
    act(() => void vi.advanceTimersByTime(700));

    fireEvent.click(screen.getByLabelText("A bus"));

    expect(picks(capture, "reading")[0]).not.toHaveProperty("readingWordCount");
    expect(readingTrials(capture)[0]).toMatchObject({ responseTimeMs: 700 });
    expect(readingTrials(capture)[0]).not.toHaveProperty("readingWordCount");
  });

  it("sends none for a dot trial", () => {
    const capture = new BaselineCapture("wc-dots");
    render(
      <SentenceDotModule band="p46" capture={capture} onComplete={() => {}} />,
    );
    answerTheSentences(["True", "True", "True"]);
    act(() => void vi.advanceTimersByTime(1_000)); // past the reveal

    fireEvent.click(screen.getByRole("button", { name: /Top|Left/ }));

    const [dots] = baselineTrials(capture).filter((t) => t.dimension === "ans");
    expect(dots.responseTimeMs).not.toBeNull();
    expect(dots).not.toHaveProperty("readingWordCount");
  });
});
