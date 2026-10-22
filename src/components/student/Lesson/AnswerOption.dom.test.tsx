import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AnswerOption, AnswerRadio } from "./AnswerOption";

/**
 * THE ANSWER CARD'S NAME IS ON THE BUTTON ITSELF (21 Oct production run: "The
 * end-of-lesson answer options have no accessible names"). The label lives in
 * a child span beside the trailing marker, and a reader walking the tree met
 * an unnamed button. And the after-lesson check's picked answer was shown only
 * by a drawn radio, so nothing said which one was picked.
 */

afterEach(() => {
  cleanup();
});

describe("the answer card", () => {
  it("carries its label as the button's own name", () => {
    render(<AnswerOption label="Osmosis" tone="idle" trailing={<AnswerRadio selected={false} />} />);

    expect(screen.getByRole("button").getAttribute("aria-label")).toBe("Osmosis");
  });

  it("keeps its name when the answer is resolved and the card is disabled", () => {
    render(<AnswerOption label="Diffusion" tone="muted" />);

    expect(screen.getByRole("button").getAttribute("aria-label")).toBe("Diffusion");
  });

  it("says it is the picked answer in a select-then-confirm flow", () => {
    render(<AnswerOption label="Osmosis" tone="idle" selected />);

    expect(screen.getByRole("button", { name: "Osmosis" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("says it is not picked when another one is", () => {
    render(<AnswerOption label="Diffusion" tone="idle" selected={false} />);

    expect(screen.getByRole("button", { name: "Diffusion" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("says nothing about picking where a tap answers at once", () => {
    render(<AnswerOption label="Osmosis" tone="idle" />);

    expect(screen.getByRole("button", { name: "Osmosis" }).hasAttribute("aria-pressed")).toBe(false);
  });
});
