import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AudioSegment } from "./AudioSegment";

/**
 * `narration_played` is in the ingest enum and nothing sent it, so the engine
 * could not tell a child who listened from one who never pressed play. It
 * fires on what the ELEMENT says - a clip that refuses to play has not been
 * heard - and once per visit, so a pause and resume is not a second listen.
 */

const CONTENT = {
  title: "Narrated: Numerators",
  src: "https://cdn.example/a.mp3",
  transcript: "The number on top is the numerator.",
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("narration played", () => {
  it("is said once, when the clip itself starts", () => {
    const onPlayed = vi.fn();
    const { container } = render(
      <AudioSegment content={CONTENT} onPlayed={onPlayed} />,
    );
    const el = container.querySelector("audio")!;

    expect(onPlayed).not.toHaveBeenCalled();
    fireEvent.play(el);
    fireEvent.pause(el);
    fireEvent.play(el);

    expect(onPlayed).toHaveBeenCalledTimes(1);
  });

  it("is never said for the demo's simulated clip, where nothing played", () => {
    vi.useFakeTimers();
    const onPlayed = vi.fn();
    render(
      <AudioSegment
        content={{ ...CONTENT, src: undefined }}
        onPlayed={onPlayed}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /play/i }));

    expect(onPlayed).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
