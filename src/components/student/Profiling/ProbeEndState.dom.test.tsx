import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ProbeEndState } from "./ProbeEndState";
import { QuestSegments } from "./QuestMap";

/**
 * Module 4's two ends after the PIN, as design 5bb9ee2 (28 Oct) writes them:
 * the frame's words exactly, one way onward each, inside Module 4's shell.
 */

afterEach(cleanup);

function show(end: "done" | "nothing", onGo = vi.fn()) {
  render(
    <QuestSegments.Provider value={4}>
      <ProbeEndState end={end} onGo={onGo} />
    </QuestSegments.Provider>,
  );
  return onGo;
}

describe("already done", () => {
  it("says the part is done and the answers saved, in the frame's words", () => {
    show("done");

    expect(screen.getByRole("heading").textContent).toBe(
      "You've already done this part",
    );
    expect(
      screen.getByText(
        "Your answers from before are saved, so there's nothing to do again here. You can carry straight on to Nevo.",
      ),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/conflict/i);
  });

  it("has one way on, Continue to Nevo, in navy", () => {
    const onGo = show("done");

    const buttons = screen.getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["Continue to Nevo"]);
    expect(buttons[0].className).toContain("bg-nevo-navy");
    fireEvent.click(buttons[0]);
    expect(onGo).toHaveBeenCalledTimes(1);
  });

  it("marks it with a navy check", () => {
    show("done");

    const mark = document.querySelector("span[aria-hidden='true']")!;
    expect(mark.className).toContain("bg-nevo-navy");
    expect(mark.querySelector("path")?.getAttribute("d")).toBe(
      "M5 12.5l4.5 4.5L19 7.5",
    );
  });
});

describe("nothing to do", () => {
  it("says there is nothing here right now, in the frame's words", () => {
    show("nothing");

    expect(screen.getByRole("heading").textContent).toBe(
      "Nothing to do here right now",
    );
    expect(
      screen.getByText(
        "There's no warm-up waiting at the moment. You can go on to Nevo and come back any time.",
      ),
    ).toBeInTheDocument();
  });

  it("has one way on, Go to my lessons", () => {
    const onGo = show("nothing");

    const buttons = screen.getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["Go to my lessons"]);
    fireEvent.click(buttons[0]);
    expect(onGo).toHaveBeenCalledTimes(1);
  });

  it("marks it with a quiet dash, not the check", () => {
    show("nothing");

    const mark = document.querySelector("span[aria-hidden='true']")!;
    expect(mark.className).toContain("bg-nevo-violet/22");
    expect(mark.className).not.toContain("bg-nevo-navy");
    expect(mark.querySelector("path")?.getAttribute("d")).toBe("M6 12h12");
  });
});

it("sits in Module 4's shell: the map with three stops done and the fourth active", () => {
  show("nothing");

  expect(screen.getByAltText("Nevo")).toBeInTheDocument();
  const map = screen.getByRole("progressbar");
  expect(map).toHaveAttribute("aria-valuenow", "3");
  expect(map).toHaveAttribute("aria-valuemax", "4");
  expect(map).toHaveAttribute("aria-label", "Part 4 of 4");
});
