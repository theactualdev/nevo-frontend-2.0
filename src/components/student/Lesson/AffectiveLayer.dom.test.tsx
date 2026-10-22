import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HintOverlay, SocraticPanel, type PanelPrompt } from "./AffectiveLayer";

/**
 * SCRUM-241: THE PANEL'S TWO ENDINGS, and it is told which (frame 38 §4, 38a).
 *
 * A child who opened the panel themselves ends on "Want to try the question
 * again now?" and the way back to it. A child the system handed off ends on
 * "Let's keep going." and goes on, with no Try again - sending them back to
 * the question is the loop the hand-off exists to break. The ending is set by
 * the way in, never worked out from what the child does inside the panel.
 *
 * The player wires both: the child's own way in, and the server's hand-off on
 * its reply to a quick check (B94, `LessonPlayer.handoff.dom.test.tsx`). Both
 * endings are pinned here.
 */

afterEach(() => cleanup());

const PROMPTS: PanelPrompt[] = [
  { id: "p-1", prompt: "Where does the energy come from?", options: ["The sun", "The soil"] },
];

const SELF = "Want to try the question again now?";
const HANDOFF = "Let's keep going.";

const answerAll = () => {
  fireEvent.click(screen.getByRole("button", { name: PROMPTS[0].prompt }));
  fireEvent.click(screen.getByRole("radio", { name: "The sun" }));
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
};

describe("a panel the child opened", () => {
  it("waits for the child to open it", () => {
    render(<SocraticPanel prompts={PROMPTS} onTryAgain={() => {}} />);

    expect(screen.queryByText(PROMPTS[0].prompt)).toBeNull();
  });

  it("ends on the way back to the question, once it is worked through", () => {
    const onTryAgain = vi.fn();
    const onKeepGoing = vi.fn();
    render(
      <SocraticPanel
        prompts={PROMPTS}
        entry="self"
        onTryAgain={onTryAgain}
        onKeepGoing={onKeepGoing}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Which part is unclear?" }));
    expect(screen.queryByText(SELF)).toBeNull();

    answerAll();

    expect(screen.getByRole("status")).toHaveTextContent(SELF);
    expect(screen.queryByText(HANDOFF)).toBeNull();
    // Keep going stays beside it (SCRUM-275): the child can still leave.
    expect(screen.getByRole("button", { name: "Keep going" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(onTryAgain).toHaveBeenCalledTimes(1);
    expect(onKeepGoing).not.toHaveBeenCalled();
    // The panel steps aside for the question.
    expect(screen.queryByText(SELF)).toBeNull();
  });

  it("has no ending without a question to go back to", () => {
    render(<SocraticPanel prompts={PROMPTS} entry="self" />);
    fireEvent.click(screen.getByRole("button", { name: "Which part is unclear?" }));

    answerAll();

    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });
});

describe("a panel the system handed off to", () => {
  it("arrives open, with nothing to accept, and says so once", () => {
    const onShown = vi.fn();
    render(
      <SocraticPanel
        prompts={PROMPTS}
        entry="handoff"
        onKeepGoing={() => {}}
        onShown={onShown}
      />,
    );

    expect(screen.getByRole("button", { name: PROMPTS[0].prompt })).toBeTruthy();
    expect(onShown).toHaveBeenCalledTimes(1);
    expect(onShown).toHaveBeenCalledWith(["p-1"]);
  });

  it("ends on into the next segment, with no Try again", () => {
    const onTryAgain = vi.fn();
    const onKeepGoing = vi.fn();
    render(
      <SocraticPanel
        prompts={PROMPTS}
        entry="handoff"
        onTryAgain={onTryAgain}
        onKeepGoing={onKeepGoing}
      />,
    );
    expect(screen.queryByText(HANDOFF)).toBeNull();

    answerAll();

    expect(screen.getByRole("status")).toHaveTextContent(HANDOFF);
    expect(screen.queryByText(SELF)).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Keep going" }));

    expect(onKeepGoing).toHaveBeenCalledTimes(1);
    expect(onTryAgain).not.toHaveBeenCalled();
  });

  it("always has a way on, even with nothing to answer", () => {
    render(
      <SocraticPanel
        prompts={[{ prompt: "Why is a leaf green?" }]}
        entry="handoff"
        onKeepGoing={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: "Keep going" })).toBeTruthy();
  });
});

/*
 * SCRUM-275 (Lydia, 21 Oct): "Keep going is present and pressable from the
 * moment the panel opens, before anything is answered. The panel is support,
 * not a test, and a child has to be able to leave it." And a panel the child
 * opened, with no unpassed check, "is closed by the child. No completion
 * condition, nothing to answer first."
 */
describe("Keep going, from the moment the panel opens (SCRUM-275)", () => {
  it("is there and pressable as a hand-off arrives, before anything is answered", () => {
    const onKeepGoing = vi.fn();
    const onAnswer = vi.fn();
    render(
      <SocraticPanel
        prompts={PROMPTS}
        entry="handoff"
        onKeepGoing={onKeepGoing}
        onAnswer={onAnswer}
      />,
    );

    const keepGoing = screen.getByRole("button", { name: "Keep going" });
    expect(keepGoing).toBeEnabled();
    // Not yet the ending: nothing has been worked through.
    expect(screen.queryByText(HANDOFF)).toBeNull();

    fireEvent.click(keepGoing);

    expect(onKeepGoing).toHaveBeenCalledTimes(1);
    expect(onAnswer).not.toHaveBeenCalled();
    expect(screen.queryByText(PROMPTS[0].prompt)).toBeNull();
  });

  it("is there and pressable as the child opens it, before anything is answered", () => {
    render(<SocraticPanel prompts={PROMPTS} entry="self" onTryAgain={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Which part is unclear?" }));

    expect(screen.getByRole("button", { name: "Keep going" })).toBeEnabled();
    // The way back to the question still waits for the dialogue.
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("is there while a prompt is being answered, too", () => {
    render(<SocraticPanel prompts={PROMPTS} entry="handoff" onKeepGoing={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: PROMPTS[0].prompt }));

    expect(screen.getByRole("button", { name: "Keep going" })).toBeEnabled();
  });

  it("closes a panel the child opened, with nothing answered, and does nothing more", () => {
    const onTryAgain = vi.fn();
    const onAnswer = vi.fn();
    // No unpassed check here: no way back to a question, so no onTryAgain.
    render(<SocraticPanel prompts={PROMPTS} entry="self" onAnswer={onAnswer} />);
    fireEvent.click(screen.getByRole("button", { name: "Which part is unclear?" }));
    expect(screen.getByText(PROMPTS[0].prompt)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Keep going" }));

    expect(screen.queryByText(PROMPTS[0].prompt)).toBeNull();
    expect(screen.queryByRole("button", { name: "Keep going" })).toBeNull();
    expect(onAnswer).not.toHaveBeenCalled();
    expect(onTryAgain).not.toHaveBeenCalled();
    // Theirs to open again.
    expect(
      screen.getByRole("button", { name: "Which part is unclear?" }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("leaves an opened prompt as abandoned, as closing does", () => {
    const onAbandon = vi.fn();
    render(<SocraticPanel prompts={PROMPTS} entry="self" onAbandon={onAbandon} />);
    fireEvent.click(screen.getByRole("button", { name: "Which part is unclear?" }));
    fireEvent.click(screen.getByRole("button", { name: PROMPTS[0].prompt }));

    fireEvent.click(screen.getByRole("button", { name: "Keep going" }));

    expect(onAbandon).toHaveBeenCalledTimes(1);
    expect(onAbandon).toHaveBeenCalledWith("p-1");
  });
});

/*
 * Teslim, 21 Oct: the hand-off uses the failed question's own stored guided
 * questions, and "if none are stored, no dialogue is sent". Nothing is made
 * up in their place - not a prompt, and not a panel of nothing.
 */
describe("a panel with no questions (rule 5)", () => {
  it.each(["handoff", "self"] as const)(
    "draws nothing at all (%s)",
    (entry) => {
      const onShown = vi.fn();
      const { container } = render(
        <SocraticPanel
          prompts={[]}
          entry={entry}
          onKeepGoing={() => {}}
          onTryAgain={() => {}}
          onShown={onShown}
        />,
      );

      expect(container).toBeEmptyDOMElement();
      expect(document.body.textContent).not.toMatch(
        /think it through|keep going|which part/i,
      );
      expect(onShown).not.toHaveBeenCalled();
    },
  );
});

/*
 * SCRUM-275: "The panel does not cover Back and Next. It sits above them."
 * jsdom lays nothing out, so this pins what keeps it there: the panel is drawn
 * into the row the player gives it, in flow, and nothing pins it to the
 * screen at any width.
 */
describe("where the panel opens", () => {
  /** Pinned to the screen at any breakpoint, or lifted out of the flow. */
  const PINNED = /(^|\s)((sm|md|lg|xl|2xl):)?(fixed|absolute|inset-[^\s]+|bottom-[^\s]+|z-[^\s]+)(\s|$)/;

  it("is drawn into the row it is given, in flow", () => {
    const dock = document.createElement("div");
    document.body.appendChild(dock);
    const { container } = render(
      <SocraticPanel prompts={PROMPTS} entry="handoff" onKeepGoing={() => {}} dock={dock} />,
    );

    const label = screen.getByText(/think it through/i);
    expect(dock.contains(label)).toBe(true);
    // The way in stays where it was mounted; only the open panel moves.
    expect(container.contains(label)).toBe(false);
    const sheet = dock.firstElementChild as HTMLElement;
    expect(sheet.className).not.toMatch(PINNED);
    // It may shrink with the row and scroll inside, under its own cap.
    expect(sheet.className.split(" ")).toEqual(
      expect.arrayContaining(["min-h-0", "overflow-y-auto", "max-h-[85dvh]"]),
    );
    dock.remove();
  });

  it("is in flow where it is mounted, when there is no row to go to", () => {
    render(<SocraticPanel prompts={PROMPTS} entry="handoff" onKeepGoing={() => {}} />);

    const sheet = screen.getByText(/think it through/i).closest(
      ".rounded-t-\\[16px\\]",
    ) as HTMLElement;
    expect(sheet.className).not.toMatch(PINNED);
  });
});

describe("either ending", () => {
  it.each(["self", "handoff"] as const)(
    "claims nothing the panel cannot know (%s)",
    (entry) => {
      // The frame's "You've got it" and "That's photosynthesis." need a
      // marked answer and a named idea; neither is on the contract.
      render(
        <SocraticPanel
          prompts={PROMPTS}
          entry={entry}
          onTryAgain={() => {}}
          onKeepGoing={() => {}}
        />,
      );
      if (entry === "self")
        fireEvent.click(
          screen.getByRole("button", { name: "Which part is unclear?" }),
        );

      answerAll();

      expect(document.body.textContent).not.toMatch(/got it|that's photo/i);
    },
  );
});

describe("the pill's focus ring", () => {
  it("rings the drawn pill, not the square 44px hit area around it", () => {
    // jsdom has no :focus-visible, so it is asserted where it lives.
    render(<SocraticPanel prompts={PROMPTS} onTryAgain={() => {}} />);

    const hit = screen.getByRole("button", { name: "Which part is unclear?" });
    expect(hit.className).toMatch(/focus-visible:outline-none/);
    const drawn = screen.getByText("Which part is unclear?");
    expect(drawn).not.toBe(hit);
    expect(drawn.className).toMatch(/rounded-\[20px\]/);
    expect(drawn.className).toMatch(/group-focus-visible:outline-2/);
  });

  it("names the pill on the button itself, not only in the drawn pill", () => {
    // The key-term chips' pattern, found unnamed on the 20 Oct production run.
    render(<SocraticPanel prompts={PROMPTS} onTryAgain={() => {}} />);

    expect(
      screen.getByRole("button", { name: "Which part is unclear?" }),
    ).toHaveAttribute("aria-label", "Which part is unclear?");
  });
});

describe("the offered hint's panel (Lesson Player frame, 13 Oct)", () => {
  it("is the frame's soft violet panel with no accent bar, and keeps its labelled Close", () => {
    render(<HintOverlay hint="Start with the leaf." onClose={() => {}} />);

    const panel = screen.getByText("Start with the leaf.").parentElement;
    const c = panel?.className ?? "";
    expect(c).toMatch(/(^|\s)bg-nevo-violet\/14(\s|$)/);
    expect(c).toMatch(/(^|\s)rounded-\[10px\](\s|$)/);
    expect(c).not.toMatch(/border-l|bg-\[#e5dfd3\]/);
    // D29: a labelled control, not the frame's nothing or a faint X.
    expect(screen.getByRole("button", { name: "Close hint" }).textContent).toBe("Close");
  });
});
