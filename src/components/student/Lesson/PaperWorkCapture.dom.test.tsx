import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { PaperWorkCapture, type PaperWorkVerdict } from "./PaperWorkCapture";

/**
 * Paper work (design 17g): the frame's states in its words, the camera read
 * into memory and nowhere else, and the two lines the 12 Nov never-stored
 * ruling makes untrue held back. Unreachable from the player until the lesson
 * read says an item is on paper and the camera route exists (SCRUM-343).
 */

const INSTRUCTION =
  "Draw the triangle and label each angle, then take a photo of your page.";

const track = { stop: vi.fn() };
const stream = { getTracks: () => [track] };
const getUserMedia = vi.fn();
const drawImage = vi.fn();
const createObjectURL = vi.fn(() => "blob:photo-1");
const revokeObjectURL = vi.fn();

const button = (name: string) => screen.getByRole("button", { name });

function mount(
  over: Partial<Parameters<typeof PaperWorkCapture>[0]> = {},
) {
  const onSend = vi.fn<(photo: Blob) => Promise<PaperWorkVerdict>>();
  const onContinue = vi.fn();
  const view = render(
    <PaperWorkCapture
      instruction={INSTRUCTION}
      onSend={onSend}
      onContinue={onContinue}
      {...over}
    />,
  );
  return { onSend, onContinue, ...view };
}

/** Through P1 to the viewfinder. */
async function toCamera() {
  fireEvent.click(button("Take a photo"));
  await screen.findByText("Line your page up inside the frame");
}

/** The shutter, then P3. */
async function snap() {
  const shutter = screen
    .getAllByRole("button", { name: "Take a photo" })
    .at(-1)!;
  fireEvent.click(shutter);
  await screen.findByText("Happy with this?");
}

beforeEach(() => {
  track.stop.mockReset();
  getUserMedia.mockReset().mockResolvedValue(stream);
  drawImage.mockReset();
  createObjectURL.mockClear();
  revokeObjectURL.mockReset();
  Object.defineProperty(navigator, "mediaDevices", {
    value: { getUserMedia },
    configurable: true,
  });
  vi.spyOn(HTMLVideoElement.prototype, "videoWidth", "get").mockReturnValue(4000);
  vi.spyOn(HTMLVideoElement.prototype, "videoHeight", "get").mockReturnValue(3000);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage,
  } as never);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
    function (this: HTMLCanvasElement, done: BlobCallback) {
      done(new Blob(["page"], { type: "image/jpeg" }));
    },
  );
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("what the lesson asks for (P1)", () => {
  it("renders nothing without the lesson's instruction (rule 5)", () => {
    const { container } = mount({ instruction: null });
    expect(container).toBeEmptyDOMElement();
  });

  it("says what to do in the lesson's words, with both ways on", () => {
    mount();

    expect(screen.getByText("On paper")).toBeVisible();
    expect(screen.getByRole("heading", { name: INSTRUCTION })).toBeVisible();
    expect(button("Take a photo")).toBeVisible();
    expect(button("I can't use a camera right now")).toBeVisible();
  });

  it("says the teacher asked only when the server says so", () => {
    const { rerender, onSend, onContinue } = mount();
    expect(
      screen.queryByText("Your teacher asked for this one on paper."),
    ).toBeNull();

    rerender(
      <PaperWorkCapture
        instruction={INSTRUCTION}
        teacherAsked
        onSend={onSend}
        onContinue={onContinue}
      />,
    );

    expect(
      screen.getByText("Your teacher asked for this one on paper."),
    ).toBeVisible();
  });
});

describe("the camera on the page (P2) and the retake (P3)", () => {
  it("asks for the back camera, and no microphone", async () => {
    mount();
    await toCamera();

    expect(getUserMedia).toHaveBeenCalledExactlyOnceWith({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
    expect(button("Cancel")).toBeVisible();
  });

  it("switches the camera off when the child cancels, and goes back to the instruction", async () => {
    mount();
    await toCamera();

    fireEvent.click(button("Cancel"));

    expect(track.stop).toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: INSTRUCTION })).toBeVisible();
  });

  it("takes the picture at no more than 2,000 on its longest side, and switches the camera off", async () => {
    mount();
    await toCamera();

    await snap();

    // No box measured here (jsdom): the whole frame, scaled.
    expect(drawImage).toHaveBeenCalledWith(
      expect.anything(),
      0,
      0,
      4000,
      3000,
      0,
      0,
      2000,
      1500,
    );
    expect(track.stop).toHaveBeenCalled();
    expect(button("Retake")).toBeVisible();
    expect(button("Use this photo")).toBeVisible();
  });

  it("sends only what the viewfinder showed, not the whole sensor", async () => {
    mount();
    await toCamera();
    // A portrait viewfinder over a landscape camera: the sides are cropped.
    vi.spyOn(HTMLVideoElement.prototype, "getBoundingClientRect").mockReturnValue(
      { width: 300, height: 400 } as DOMRect,
    );

    await snap();

    // 3:4 out of 4000 x 3000 is 2250 x 3000, centred; then at most 2,000.
    expect(drawImage).toHaveBeenCalledWith(
      expect.anything(),
      875,
      0,
      2250,
      3000,
      0,
      0,
      1500,
      2000,
    );
  });

  it("drops the picture on a retake, and opens the camera again", async () => {
    mount();
    await toCamera();
    await snap();

    fireEvent.click(button("Retake"));

    await screen.findByText("Line your page up inside the frame");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:photo-1");
    expect(getUserMedia).toHaveBeenCalledTimes(2);
  });

  it("switches the camera off when the screen goes", async () => {
    const { unmount } = mount();
    await toCamera();

    unmount();

    expect(track.stop).toHaveBeenCalled();
  });
});

describe("sending the photo", () => {
  it("sends the picture, and hands back to the lesson when it is read - no P4 words", async () => {
    const { onSend, onContinue } = mount();
    onSend.mockResolvedValue("read");
    await toCamera();
    await snap();

    fireEvent.click(button("Use this photo"));

    await waitFor(() => expect(onContinue).toHaveBeenCalledWith("read"));
    expect(onSend.mock.calls[0][0]).toBeInstanceOf(Blob);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:photo-1");
    // Held for Lydia: untrue under the never-stored rule (SCRUM-343).
    expect(screen.queryByText(/your page is saved/)).toBeNull();
    expect(screen.queryByText(/Your teacher will see/)).toBeNull();
  });

  it("says calmly when the photo could not be read, and never blames the child (P6)", async () => {
    const { onSend, onContinue } = mount();
    onSend.mockResolvedValue("unreadable");
    await toCamera();
    await snap();

    fireEvent.click(button("Use this photo"));

    expect(
      await screen.findByText("We couldn't quite read that one"),
    ).toBeVisible();
    expect(
      screen.getByText(
        "That's the photo, not your working. Try again in better light, or carry on without it.",
      ),
    ).toBeVisible();
    fireEvent.click(button("Continue without it"));
    expect(onContinue).toHaveBeenCalledWith("without_photo");
  });

  it("keeps the photo to send again when the send fails, and calls nothing unreadable", async () => {
    const { onSend } = mount();
    onSend.mockRejectedValueOnce(new Error("Network"));
    await toCamera();
    await snap();

    fireEvent.click(button("Use this photo"));

    await waitFor(() => expect(button("Use this photo")).toBeVisible());
    expect(screen.queryByText("We couldn't quite read that one")).toBeNull();
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it("keeps the picture out of device storage", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const { onSend } = mount();
    onSend.mockResolvedValue("read");
    await toCamera();
    await snap();

    await act(async () => {
      fireEvent.click(button("Use this photo"));
    });

    expect(setItem).not.toHaveBeenCalled();
  });
});

describe("a child who can't or won't use the camera (P5)", () => {
  it("is never blocked, and the untrue second sentence is held", () => {
    const { onContinue } = mount();

    fireEvent.click(button("I can't use a camera right now"));

    expect(screen.getByRole("heading", { name: "No problem" })).toBeVisible();
    expect(screen.getByText("Do this one on paper and carry on.")).toBeVisible();
    expect(screen.queryByText(/photograph it later/)).toBeNull();
    fireEvent.click(button("Keep going"));
    expect(onContinue).toHaveBeenCalledWith("no_camera");
  });

  it("is where a refused camera lands", async () => {
    getUserMedia.mockRejectedValue(new DOMException("Denied", "NotAllowedError"));
    mount();

    fireEvent.click(button("Take a photo"));

    expect(
      await screen.findByRole("heading", { name: "No problem" }),
    ).toBeVisible();
  });

  it("is where a device with no camera lands", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: undefined,
      configurable: true,
    });
    mount();

    fireEvent.click(button("Take a photo"));

    expect(
      await screen.findByRole("heading", { name: "No problem" }),
    ).toBeVisible();
  });

  it("can try the camera again", async () => {
    mount();
    fireEvent.click(button("I can't use a camera right now"));

    fireEvent.click(button("Try the camera again"));

    expect(
      await screen.findByText("Line your page up inside the frame"),
    ).toBeVisible();
  });
});
