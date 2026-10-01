import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { SentenceDotModule } from "./SentenceDotModule";
import { BaselineCapture } from "@/lib/profiling/capture";

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
