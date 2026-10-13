import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LessonComplete } from "./LessonComplete";
import {
  preloadSettlingCharacter,
  SettlingCharacter,
} from "@/components/shared";

/**
 * The lesson's ending draws a picture, and the ending can come after the
 * connection has dropped - there is no service worker to answer for it. It
 * showed a broken box with the alt text in it, on the screen that closes a
 * lesson. The player now fetches the picture while it has a connection, and
 * a picture that still will not load is left out.
 */

const ALT = "A student settling in comfortably";

afterEach(cleanup);

describe("the ending's picture", () => {
  it("is fetched ahead at the very URLs the screen's picture asks for", () => {
    render(<SettlingCharacter />);
    const shown = screen.getByRole("img", { name: ALT });

    const early = preloadSettlingCharacter();

    // Same optimised URLs, so the browser hands over what it already has.
    expect(early.getAttribute("src")).toBe(shown.getAttribute("src"));
    expect(early.getAttribute("srcset")).toBe(shown.getAttribute("srcset"));
    expect(early.getAttribute("src")).toContain("welcome-settling.png");
  });

  it("is left out, not drawn as a broken box, when it will not load", () => {
    render(<LessonComplete onDone={() => {}} />);

    fireEvent.error(screen.getByRole("img", { name: ALT }));

    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByText(ALT)).toBeNull();
    // The rest of the screen stands.
    expect(
      screen.getByRole("heading", { name: "That's the lesson done." }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back to lessons" })).toBeTruthy();
  });
});
