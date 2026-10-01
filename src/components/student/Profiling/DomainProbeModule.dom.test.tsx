import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DomainProbeModule, PROBE_QUESTIONS } from "./DomainProbeModule";
import { BaselineCapture } from "@/lib/profiling/capture";

/**
 * Module 4 seeds the Knowledge Graph's entry node, and recorded no answers.
 *
 * The note above the questions argued that a prior-knowledge probe has "no
 * correct option" - but that described the data structure, not the questions.
 * Abuja is the capital and 15% of 200 is 30. A knowledge probe is precisely the
 * thing that needs the key, and an entry node cannot be seeded from "they
 * tapped the third option in 4.2 seconds". The comment is why it survived a
 * read: it made a gap look like a property.
 */

const picks = (capture: BaselineCapture) =>
  capture.stream
    .filter((e) => e.kind === "trial_pick")
    .map((e) => e.payload as Record<string, unknown>);

describe("DomainProbeModule", () => {
  it("records that a child knew three-quarters of 12", () => {
    const capture = new BaselineCapture("d1");
    render(
      <DomainProbeModule band="p46" capture={capture} onComplete={() => {}} />,
    );

    fireEvent.click(screen.getByText("9"));

    expect(picks(capture)[0]).toMatchObject({ correct: true });
  });

  it("records that a child did not", () => {
    const capture = new BaselineCapture("d2");
    render(
      <DomainProbeModule band="p46" capture={capture} onComplete={() => {}} />,
    );

    fireEvent.click(screen.getByText("16"));

    expect(picks(capture)[0]).toMatchObject({ correct: false });
  });

  it.each(["p13", "p46", "jss", "ss"] as const)(
    "does not put every %s answer in the same place",
    (band) => {
      // They sat at index 0 for all three P1-3 items and index 1 for three of
      // four at P4-6 - so a child who pressed the top option every time, or the
      // second every time, was recorded as a knowledgeable one.
      const places = PROBE_QUESTIONS[band].map((q) => q.answer);

      expect(new Set(places).size).toBeGreaterThan(1);
    },
  );

  it.each(["p13", "p46", "jss", "ss"] as const)(
    "points every %s answer at an option that exists",
    (band) => {
      // A key is silent when it is wrong: an out-of-range index marks every
      // child incorrect and nothing anywhere says so.
      for (const q of PROBE_QUESTIONS[band]) {
        expect(q.options[q.answer], q.question).toBeDefined();
      }
    },
  );

  it("keeps the subject a child chose with their answer", () => {
    // JSS and SS pick a subject first; it is the key the entry node hangs off.
    const capture = new BaselineCapture("d4");
    render(
      <DomainProbeModule band="jss" capture={capture} onComplete={() => {}} />,
    );

    fireEvent.click(screen.getByText("Basic Science"));
    fireEvent.click(screen.getByText("25%"));

    expect(picks(capture)[0]).toMatchObject({
      subject: "Basic Science",
      correct: true,
    });
  });

  it("does not ask P4-6 a fact Module 3 already asked them", () => {
    // Module 3's second P4-6 sentence is "Lagos is the capital of Nigeria."
    // Asking it again here made two modules agree about a child for no reason
    // but the overlap.
    render(<DomainProbeModule band="p46" onComplete={() => {}} />);

    expect(screen.queryByText("The capital of Nigeria is:")).toBeNull();
  });
});

describe("DomainProbeModule — the subject question", () => {
  it("asks it in the frame's words", () => {
    // It asked "Which subject do you feel most at home in?" - a question about
    // the child, where the frame asks which subject to start with.
    render(<DomainProbeModule band="ss" onComplete={() => {}} />);

    expect(
      screen.getByText("Which subject would you like to start with?"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/most at home/i)).toBeNull();
  });

  it("records where the subject tap landed", () => {
    const capture = new BaselineCapture("d5");
    render(
      <DomainProbeModule band="jss" capture={capture} onComplete={() => {}} />,
    );

    fireEvent.click(screen.getByText("Basic Science"), {
      detail: 1,
      clientX: 210,
      clientY: 388.5,
    });

    const chose = capture.stream.find((e) => e.kind === "probe_subject");
    expect(chose?.payload).toMatchObject({ x: 210, y: 388.5 });
  });
});
