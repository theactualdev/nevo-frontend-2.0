import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LessonComplete } from "./LessonComplete";
import { SAVING_LESSON_LINE, SLOW_MARK_MS } from "@/lib/lessons/verdict";
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

/**
 * LYDIA'S END-OF-LESSON WAIT (10 and 11 Nov): while the completion write is
 * on its way, past about two seconds, "Nevo is saving your lesson." in the
 * note's polite slot - and the note the caller hands in, once there is one,
 * in its place.
 */
describe("the end-of-lesson wait", () => {
  afterEach(() => vi.useRealTimers());

  it("says nothing for two seconds, then her line, read out politely", () => {
    vi.useFakeTimers();
    render(<LessonComplete onDone={() => {}} saving />);
    expect(screen.queryByText(SAVING_LESSON_LINE)).toBeNull();

    act(() => {
      vi.advanceTimersByTime(SLOW_MARK_MS);
    });

    const line = screen.getByText(SAVING_LESSON_LINE);
    expect(line.parentElement).toHaveAttribute("aria-live", "polite");
  });

  it("gives way to the note once the write has answered", () => {
    vi.useFakeTimers();
    const { rerender } = render(<LessonComplete onDone={() => {}} saving />);
    act(() => {
      vi.advanceTimersByTime(SLOW_MARK_MS);
    });

    rerender(
      <LessonComplete
        onDone={() => {}}
        saving={false}
        note="Your progress is saved."
      />,
    );

    expect(screen.queryByText(SAVING_LESSON_LINE)).toBeNull();
    expect(screen.getByText("Your progress is saved.")).toBeTruthy();
  });

  it("is never said where nothing is being saved", () => {
    vi.useFakeTimers();
    render(<LessonComplete onDone={() => {}} />);

    act(() => {
      vi.advanceTimersByTime(SLOW_MARK_MS * 5);
    });

    expect(screen.queryByText(SAVING_LESSON_LINE)).toBeNull();
  });
});
