import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { AudioSegment } from "./AudioSegment";

const mediaUrl = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/content", () => ({
  contentApi: { mediaUrl: (...a: unknown[]) => mediaUrl(...a) },
}));

/**
 * This card used to lie.
 *
 * It animated the waveform on a `setInterval` against a hardcoded 40-second
 * duration, with `TODO(audio): play the real narrated clip` where the playback
 * should have been. That was honest while no narration existed. It stopped
 * being honest the moment the backend started producing assets: a child would
 * have pressed play and watched a progress line run over silence, with nothing
 * on screen admitting it.
 *
 * So these tests are mostly about the difference between playing and appearing
 * to play - and about what happens when the clip will not load, since a child
 * who cannot hear it still needs the words.
 */

const CONTENT = {
  heading: "Numerators",
  title: "Narrated: Numerators",
  src: "https://cdn.example/a.mp3",
  transcript: "The number on top is the numerator.",
};

let play: ReturnType<typeof vi.fn>;
let pause: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  // jsdom DEFINES both and throws "Not implemented" from them, so they have to
  // be stood in for. `vi.spyOn` rather than assigning to the prototype:
  // replacing a prototype method jsdom already has is what hangs the worker for
  // 60s with a timeout that names no file (the same trap as `window.location`).
  play = vi
    .spyOn(HTMLMediaElement.prototype, "play")
    .mockResolvedValue(undefined) as unknown as ReturnType<typeof vi.fn>;
  pause = vi
    .spyOn(HTMLMediaElement.prototype, "pause")
    .mockImplementation(() => {}) as unknown as ReturnType<typeof vi.fn>;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const audioEl = (container: HTMLElement) =>
  container.querySelector("audio") as HTMLAudioElement;

describe("AudioSegment", () => {
  it("plays the real clip rather than running a timer", () => {
    const { container } = render(<AudioSegment content={CONTENT} />);

    fireEvent.click(screen.getByRole("button", { name: "Play" }));

    expect(play).toHaveBeenCalledTimes(1);
    expect(audioEl(container).getAttribute("src")).toBe(CONTENT.src);

    // And pausing stops the CLIP, not a timer.
    fireEvent.play(audioEl(container));
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(pause).toHaveBeenCalledTimes(1);
  });

  it("takes its progress from the clip, not from a clock", () => {
    const { container } = render(<AudioSegment content={CONTENT} />);
    const el = audioEl(container);

    Object.defineProperty(el, "duration", { value: 100, configurable: true });
    Object.defineProperty(el, "currentTime", { value: 25, configurable: true });
    fireEvent.loadedMetadata(el);
    fireEvent.timeUpdate(el);

    // A quarter through a 100-second clip.
    expect(screen.getByText(/0:25 \/ 1:40/)).toBeTruthy();

    // And time passing on its own moves nothing, which is the whole point.
    vi.advanceTimersByTime(10_000);
    expect(screen.getByText(/0:25 \/ 1:40/)).toBeTruthy();
  });

  it("shows a real duration rather than a hardcoded 40 seconds", () => {
    const { container } = render(<AudioSegment content={CONTENT} />);
    const el = audioEl(container);

    Object.defineProperty(el, "duration", { value: 12, configurable: true });
    fireEvent.loadedMetadata(el);

    expect(screen.getByText(/0:12/)).toBeTruthy();
    expect(screen.queryByText(/0:40/)).toBeNull();
  });

  it("admits it does not know the length yet, rather than inventing one", () => {
    // Before `loadedMetadata`, nothing knows how long the clip is. The old code
    // filled that gap with `content.durationSec ?? 40` and showed "0:40" for a
    // clip it had never opened. "--:--" is the honest shape of not knowing, and
    // this is the only moment it is visible - which is why it needs its own
    // test rather than riding on the one above.
    render(<AudioSegment content={CONTENT} />);

    expect(screen.getByText(/0:00 \/ --:--/)).toBeTruthy();
    expect(screen.queryByText(/0:40/)).toBeNull();
  });

  it("ignores a supplied duration outright when there is a real clip", () => {
    // Nothing covered this, and it is the rule that stops a nullable wire field
    // becoming a fabricated length. `durationMs` can now arrive as null, and the
    // tempting repair - "fall back to the backend's duration" - would put a
    // number nobody measured on a real clip's card. The element is the only
    // thing that knows, so a supplied `durationSec` must lose to it every time.
    const { container } = render(
      <AudioSegment content={{ ...CONTENT, durationSec: 40 }} />,
    );
    const el = audioEl(container);

    expect(screen.getByText(/0:00 \/ --:--/)).toBeTruthy();
    expect(screen.queryByText(/0:40/)).toBeNull();

    Object.defineProperty(el, "duration", { value: 12, configurable: true });
    fireEvent.loadedMetadata(el);

    expect(screen.getByText(/0:12/)).toBeTruthy();
    expect(screen.queryByText(/0:40/)).toBeNull();
  });

  it("follows the element when something else pauses it", () => {
    // A headphone unplug, the lock screen, another tab taking the audio focus.
    // The card has to stay truthful about what is happening.
    const { container } = render(<AudioSegment content={CONTENT} />);
    const el = audioEl(container);

    fireEvent.play(el);
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();

    fireEvent.pause(el);
    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
  });

  it("says so when the clip will not load, and points at the words", () => {
    const { container } = render(<AudioSegment content={CONTENT} />);

    fireEvent.error(audioEl(container));

    expect(screen.getByText(/didn.t load/i)).toBeTruthy();
    expect(screen.getByText(/read the same words below/i)).toBeTruthy();
    // Not "0:00 / 0:00", which reads as a clip of no length.
    expect(screen.getByText(/Couldn.t load this recording/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Play" })).toBeDisabled();
  });

  it("does not pretend to play a clip that failed", () => {
    const { container } = render(<AudioSegment content={CONTENT} />);
    fireEvent.error(audioEl(container));

    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    vi.advanceTimersByTime(5000);

    expect(play).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
  });

  it("keeps the designed placeholder for demo content with no clip", () => {
    // The two authored mock lessons carry no `src`. There the animation is the
    // designed walkthrough, seen only by a signed-out visitor - not a claim
    // that anything played.
    const { container } = render(
      <AudioSegment content={{ ...CONTENT, src: undefined }} />,
    );

    expect(container.querySelector("audio")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(play).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
  });
});

/**
 * A recording that is fine, marked broken for good; one that is broken, with
 * its words still folded away; and one whose link had merely aged out.
 */
describe("AudioSegment - when playback does not simply start", () => {
  beforeEach(() => {
    vi.useRealTimers();
    mediaUrl.mockReset();
  });

  const refuse = (name: string) =>
    play.mockRejectedValue(Object.assign(new Error(name), { name }));

  it("does not mark the clip broken when a pause interrupts its loading", async () => {
    // `AbortError` is what pausing while it buffers produces. It disabled
    // Play until the child left the segment.
    refuse("AbortError");
    render(<AudioSegment content={CONTENT} />);

    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    await act(async () => {});

    expect(screen.getByRole("button", { name: "Play" })).toBeEnabled();
    expect(screen.queryByText(/didn.t load/i)).toBeNull();
  });

  it("does not mark it broken when the browser wants a tap first", async () => {
    refuse("NotAllowedError");
    render(<AudioSegment content={CONTENT} />);

    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    await act(async () => {});

    expect(screen.getByRole("button", { name: "Play" })).toBeEnabled();
  });

  it("opens the words it points at when the clip fails", () => {
    const { container } = render(<AudioSegment content={CONTENT} />);

    fireEvent.error(audioEl(container));

    // "Read the same words below" - and now they are there to read.
    expect(screen.getByText(CONTENT.transcript)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /hide transcript/i }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("re-issues a link that has aged out before giving up on it", async () => {
    mediaUrl.mockResolvedValue({ url: "https://cdn.example/fresh.mp3" });
    const { container } = render(
      <AudioSegment content={{ ...CONTENT, storagePath: "audio/a.mp3" }} />,
    );

    fireEvent.error(audioEl(container));

    await waitFor(() =>
      expect(audioEl(container).getAttribute("src")).toBe(
        "https://cdn.example/fresh.mp3",
      ),
    );
    expect(mediaUrl).toHaveBeenCalledWith("audio/a.mp3");
    expect(screen.queryByText(/didn.t load/i)).toBeNull();

    // Once only: the fresh link failing too is a clip that is really gone.
    fireEvent.error(audioEl(container));
    expect(screen.getByText(/didn.t load/i)).toBeTruthy();
    expect(mediaUrl).toHaveBeenCalledTimes(1);
  });

  it("tries again when the connection comes back", () => {
    const { container } = render(<AudioSegment content={CONTENT} />);
    fireEvent.error(audioEl(container));
    expect(screen.getByRole("button", { name: "Play" })).toBeDisabled();

    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    expect(screen.getByRole("button", { name: "Play" })).toBeEnabled();
    expect(audioEl(container)).not.toBeNull();
  });
});
