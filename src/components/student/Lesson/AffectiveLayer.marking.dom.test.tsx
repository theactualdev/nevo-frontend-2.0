import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import {
  REASK_LEAD,
  SocraticPanel,
  type GuidedMarking,
  type PanelPrompt,
} from "./AffectiveLayer";

/**
 * THE PANEL, MARKED BY THE SERVER (audit, 2 Nov, launch-level; backend
 * `guided_panel.py`, c268404). Every written answer was refused 422 - a
 * length is not an answer - and the reply was never read, so the panel
 * marked nothing. Now:
 * - a choice goes as its value, a numeric entry as its answer, and free
 *   writing as its length only (the words never leave);
 * - right: the next prompt; a miss: the same question again, cleared, with
 *   17d's lead line over the step's explanation, or, with no explanation, no
 *   words and the soft violet pulse (Hub, 2 Nov, rule 10's reduced build);
 * - out of turn: the prompt the server is asking.
 */

afterEach(() => cleanup());

const FIRST: PanelPrompt = {
  id: "gq-1",
  prompt: "Which way does water move?",
  options: ["Into the cell", "Out of the cell"],
  optionValues: ["in", "out"],
  answerType: "single_choice",
};
const SECOND: PanelPrompt = {
  id: "gq-2",
  prompt: "How many sides does the membrane have?",
  answerType: "numeric",
};
const PROMPTS = [FIRST, SECOND];

const marking = (over: Partial<GuidedMarking>): GuidedMarking => ({
  correct: null,
  panelComplete: false,
  ...over,
});

const open = (onAnswer: (...a: never[]) => unknown, prompts = PROMPTS) => {
  render(
    <SocraticPanel
      prompts={prompts}
      entry="self"
      onTryAgain={() => {}}
      onAnswer={onAnswer as never}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Which part is unclear?" }),
  );
};
const pick = (label: string) => {
  fireEvent.click(screen.getByRole("button", { name: FIRST.prompt }));
  fireEvent.click(screen.getByRole("radio", { name: label }));
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
};
const settle = () => act(async () => {});

describe("what an answer sends", () => {
  it("sends a choice by its value, which is what the server marks", () => {
    const onAnswer = vi.fn();
    open(onAnswer);
    pick("Into the cell");

    expect(onAnswer).toHaveBeenCalledWith("gq-1", { option: "in" }, "moved_on");
  });

  it("sends a choice whose value is a number or true/false as the answer itself", () => {
    const onAnswer = vi.fn();
    open(onAnswer, [{ ...FIRST, optionValues: [2, 3] }]);
    pick("Into the cell");

    expect(onAnswer).toHaveBeenCalledWith("gq-1", { answer: 2 }, "moved_on");
  });

  it("sends a numeric step's entry as its answer", () => {
    const onAnswer = vi.fn();
    open(onAnswer, [SECOND]);
    fireEvent.click(screen.getByRole("button", { name: SECOND.prompt }));
    fireEvent.change(screen.getByRole("textbox", { name: SECOND.prompt }), {
      target: { value: " 2 " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(onAnswer).toHaveBeenCalledWith("gq-2", { answer: "2" }, "moved_on");
  });

  it("never sends free writing, only how much there was", () => {
    const onAnswer = vi.fn();
    open(onAnswer, [
      { id: "gq-3", prompt: "Say it in your words.", answerType: "text" },
    ]);
    fireEvent.click(
      screen.getByRole("button", { name: "Say it in your words." }),
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Say it in your words." }),
      {
        target: { value: "water goes in" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(onAnswer).toHaveBeenCalledWith(
      "gq-3",
      { responseLength: 13 },
      "moved_on",
    );
    expect(JSON.stringify(onAnswer.mock.calls)).not.toContain("water goes in");
  });
});

describe("what the server's marking does", () => {
  it("opens the next prompt after a right answer, the first taking the answered tint", async () => {
    open(vi.fn().mockResolvedValue(marking({ correct: true, next: "gq-2" })));
    pick("Into the cell");
    await settle();

    expect(
      screen.getByRole("textbox", { name: SECOND.prompt }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: FIRST.prompt }).className,
    ).toContain("bg-nevo-violet/14");
  });

  it("asks the same question again after a miss, with the lead line over the step's explanation", async () => {
    open(
      vi
        .fn()
        .mockResolvedValue(
          marking({
            correct: false,
            feedback: "Water moves towards more salt.",
          }),
        ),
    );
    pick("Out of the cell");
    await settle();

    expect(screen.getByText(REASK_LEAD)).toBeInTheDocument();
    expect(
      screen.getByText("Water moves towards more salt."),
    ).toBeInTheDocument();
    // The same question, still open, its pick cleared to try again.
    expect(screen.getByRole("button", { name: FIRST.prompt })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(
      screen
        .getAllByRole("radio")
        .every((r) => r.getAttribute("aria-checked") === "false"),
    ).toBe(true);
    // No verdict, no answered tint.
    expect(
      screen.getByRole("button", { name: FIRST.prompt }).className,
    ).not.toContain("bg-nevo-violet/14");
    expect(document.body.textContent).not.toMatch(
      /wrong|incorrect|try again\b/i,
    );
  });

  it("says nothing after a miss with no explanation, and plays the soft violet pulse instead", async () => {
    open(
      vi.fn().mockResolvedValue(marking({ correct: false, feedback: null })),
    );
    pick("Out of the cell");
    await settle();

    expect(screen.queryByText(REASK_LEAD)).toBeNull();
    const first = document.querySelector("[data-miss-pulse]");
    expect(first).not.toBeNull();
    expect(first?.className).toContain("motion-safe:animate-nevo-nudge");

    // Each miss plays it again.
    fireEvent.click(screen.getByRole("radio", { name: "Out of the cell" }));
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await settle();
    expect(document.querySelector("[data-miss-pulse]")).not.toBe(first);
  });

  it("clears a numeric step's field after a miss, ready to type again", async () => {
    open(vi.fn().mockResolvedValue(marking({ correct: false })), [SECOND]);
    fireEvent.click(screen.getByRole("button", { name: SECOND.prompt }));
    const field = screen.getByRole("textbox", { name: SECOND.prompt });
    fireEvent.change(field, { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await settle();

    expect(screen.getByRole("textbox", { name: SECOND.prompt })).toHaveValue(
      "",
    );
    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: SECOND.prompt }),
    );
  });

  /*
   * THE QUESTION IN OTHER WORDS (`reaskPrompt`, 8c67353; Hub, 4 Nov: "Use it
   * when present, with the frame's lead line, and keep the reduced build when
   * it's absent").
   */
  it("asks again in the server's other words, under the lead line, where it sends them", async () => {
    const REASK = "Does water move towards the salty side or away from it?";
    const onAnswer = vi
      .fn()
      .mockResolvedValue(marking({ correct: false, reask: REASK }));
    open(onAnswer);
    pick("Out of the cell");
    await settle();

    expect(screen.getByText(REASK_LEAD)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: REASK })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("radiogroup", { name: REASK })).toBeInTheDocument();
    expect(screen.queryByText(FIRST.prompt)).toBeNull();
    // The lead line over it alone: no explanation was sent, so none is drawn.
    expect(screen.getByRole("status").querySelectorAll("p")).toHaveLength(0);
    // The same step: its answer still goes under its own id.
    fireEvent.click(screen.getByRole("radio", { name: "Into the cell" }));
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await settle();
    expect(onAnswer).toHaveBeenLastCalledWith(
      "gq-1",
      { option: "in" },
      expect.any(String),
    );
  });

  it("draws the explanation too, with the other words, where both are sent", async () => {
    const REASK = "Which side has more salt?";
    open(
      vi.fn().mockResolvedValue(
        marking({
          correct: false,
          feedback: "Water moves towards more salt.",
          reask: REASK,
        }),
      ),
    );
    pick("Out of the cell");
    await settle();

    expect(screen.getByText(REASK_LEAD)).toBeInTheDocument();
    expect(
      screen.getByText("Water moves towards more salt."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: REASK })).toBeInTheDocument();
  });

  it("keeps the question as it was, and says nothing, where the other words are the same", async () => {
    open(
      vi
        .fn()
        .mockResolvedValue(marking({ correct: false, reask: FIRST.prompt })),
    );
    pick("Out of the cell");
    await settle();

    expect(screen.queryByText(REASK_LEAD)).toBeNull();
    expect(
      screen.getByRole("button", { name: FIRST.prompt }),
    ).toBeInTheDocument();
    expect(document.querySelector("[data-miss-pulse]")).not.toBeNull();
  });

  it("names a numeric step's field with the re-ask too", async () => {
    const REASK = "Count the membrane's sides again: how many?";
    open(
      vi.fn().mockResolvedValue(marking({ correct: false, reask: REASK })),
      [SECOND],
    );
    fireEvent.click(screen.getByRole("button", { name: SECOND.prompt }));
    fireEvent.change(screen.getByRole("textbox", { name: SECOND.prompt }), {
      target: { value: "3" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await settle();

    expect(screen.getByRole("textbox", { name: REASK })).toHaveValue("");
  });

  it("goes back to the question's own words once it is answered right", async () => {
    const REASK = "Does water move towards the salty side or away from it?";
    const onAnswer = vi
      .fn()
      .mockResolvedValueOnce(marking({ correct: false, reask: REASK }))
      .mockResolvedValueOnce(marking({ correct: true, next: "gq-2" }));
    open(onAnswer);
    pick("Out of the cell");
    await settle();
    fireEvent.click(screen.getByRole("radio", { name: "Into the cell" }));
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await settle();

    expect(
      screen.getByRole("button", { name: FIRST.prompt }),
    ).toBeInTheDocument();
    expect(screen.queryByText(REASK)).toBeNull();
  });

  it("ends on the way back to the question once every step is passed", async () => {
    open(
      vi
        .fn()
        .mockResolvedValue(marking({ correct: true, panelComplete: true })),
    );
    pick("Into the cell");
    await settle();

    expect(
      screen.getByText("Want to try the question again now?"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });

  it("opens the prompt the server is asking when one is answered out of turn", async () => {
    open(vi.fn().mockResolvedValue(marking({ current: "gq-1" })));
    fireEvent.click(screen.getByRole("button", { name: SECOND.prompt }));
    fireEvent.change(screen.getByRole("textbox", { name: SECOND.prompt }), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await settle();

    expect(
      screen.getByRole("radio", { name: "Into the cell" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: SECOND.prompt }).className,
    ).not.toContain("bg-nevo-violet/14");
  });

  it.each([
    ["no marking", () => Promise.resolve(null)],
    ["a refusal", () => Promise.reject(new Error("422"))],
  ])("closes an answer as answered, as before, on %s", async (_, reply) => {
    open(reply);
    pick("Into the cell");
    await settle();

    expect(screen.queryByRole("radio")).toBeNull();
    expect(
      screen.getByRole("button", { name: FIRST.prompt }).className,
    ).toContain("bg-nevo-violet/14");
  });

  it("sends one answer at a time: a second Send waits for the first reply", async () => {
    let land: (m: GuidedMarking) => void = () => {};
    const onAnswer = vi.fn(() => new Promise<GuidedMarking>((r) => (land = r)));
    open(onAnswer);
    pick("Out of the cell");
    fireEvent.click(screen.getByRole("radio", { name: "Out of the cell" }));
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(onAnswer).toHaveBeenCalledTimes(1);
    await act(async () => land(marking({ correct: false })));
  });
});
