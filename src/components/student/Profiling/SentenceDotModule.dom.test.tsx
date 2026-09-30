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
function giveJsdomAVoice() {
  spoken.length = 0;
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
    speak: (u: { text: string }) => spoken.push(u.text),
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
