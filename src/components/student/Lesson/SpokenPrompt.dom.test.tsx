import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SpokenPrompt } from "./SpokenPrompt";

/**
 * A spoken question's prompt (B16). It says the question on arrival, says it
 * again on request, and when the recording will not load it says so - the
 * printed question beside it is the fallback, and that lives with the caller.
 *
 * jsdom implements no playback, so `play` is stubbed and the element's own
 * events stand in for the browser's.
 */

const play = vi.fn();
const pause = vi.fn();

beforeEach(() => {
  play.mockReset().mockResolvedValue(undefined);
  pause.mockReset();
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(play);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(pause);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const audio = () => document.querySelector("audio")!;

describe("a spoken prompt", () => {
  it("is set to play on arrival", () => {
    render(<SpokenPrompt src="https://cdn.example/q.mp3" />);

    expect(audio().autoplay).toBe(true);
    expect(audio().getAttribute("src")).toBe("https://cdn.example/q.mp3");
  });

  it("plays on request", () => {
    render(<SpokenPrompt src="https://cdn.example/q.mp3" />);

    fireEvent.click(screen.getByRole("button", { name: "Play" }));

    expect(play).toHaveBeenCalled();
  });

  it("says it again from the top once it has finished", () => {
    render(<SpokenPrompt src="https://cdn.example/q.mp3" />);
    fireEvent.play(audio());
    fireEvent.ended(audio());
    audio().currentTime = 4;

    fireEvent.click(screen.getByRole("button", { name: "Play" }));

    expect(audio().currentTime).toBe(0);
    expect(play).toHaveBeenCalled();
  });

  it("pauses while it is playing", () => {
    render(<SpokenPrompt src="https://cdn.example/q.mp3" />);
    fireEvent.play(audio());

    fireEvent.click(screen.getByRole("button", { name: "Pause" }));

    expect(pause).toHaveBeenCalled();
  });
});

describe("a recording that will not load", () => {
  it("says so, and stops offering to play", () => {
    render(<SpokenPrompt src="https://cdn.example/gone.mp3" />);

    fireEvent.error(audio());

    expect(screen.getByRole("status").textContent).toBe(
      "Couldn't load this recording",
    );
    expect(screen.getByRole("button", { name: "Play" })).toBeDisabled();
  });

  it("is not called broken when the browser only wants a tap first", async () => {
    // A refused autoplay or a pause while buffering is not a broken clip.
    play.mockRejectedValue(Object.assign(new Error("x"), { name: "NotAllowedError" }));
    render(<SpokenPrompt src="https://cdn.example/q.mp3" />);

    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    await Promise.resolve();
    await Promise.resolve();

    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("button", { name: "Play" })).toBeEnabled();
  });
});

describe("the busy window while it plays", () => {
  it("opens on play and closes on pause", () => {
    const onBusy = vi.fn();
    render(<SpokenPrompt src="https://cdn.example/q.mp3" onBusy={onBusy} />);

    fireEvent.play(audio());
    fireEvent.pause(audio());

    expect(onBusy.mock.calls).toEqual([["start"], ["end"]]);
  });

  it("closes when the prompt is left mid-sentence", () => {
    const onBusy = vi.fn();
    const { unmount } = render(
      <SpokenPrompt src="https://cdn.example/q.mp3" onBusy={onBusy} />,
    );
    fireEvent.play(audio());

    unmount();

    expect(onBusy.mock.calls).toEqual([["start"], ["end"]]);
  });
});
