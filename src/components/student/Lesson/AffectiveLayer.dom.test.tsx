import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SocraticPanel, type PanelPrompt } from "./AffectiveLayer";

/**
 * SCRUM-241: THE PANEL'S TWO ENDINGS, and it is told which (frame 38 §4, 38a).
 *
 * A child who opened the panel themselves ends on "Want to try the question
 * again now?" and the way back to it. A child the system handed off ends on
 * "Let's keep going." and goes on, with no Try again - sending them back to
 * the question is the loop the hand-off exists to break. The ending is set by
 * the way in, never worked out from what the child does inside the panel.
 *
 * The player wires only the child's own way in (see `LessonPlayer`); the
 * hand-off waits on a backend trigger. Both are pinned here.
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
    expect(screen.queryByRole("button", { name: "Keep going" })).toBeNull();

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
