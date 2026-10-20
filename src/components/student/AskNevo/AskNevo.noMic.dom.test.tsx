import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AskNevo } from "./AskNevo";

/**
 * ASK NEVO HAS NO MICROPHONE (Lydia, 19 Oct: "Switch the microphone off, and
 * it is SCRUM-256 for v1.5").
 *
 * The mic in the composer was the browser's own speech service, which in
 * Chrome sends a child's voice to Google: a provider nobody chose and none of
 * our documents name. It is gone, not hidden: no button, no "Listening…", no
 * permission asked for, and nothing that starts the browser listening. The
 * static guard (`src/lib/noBrowserDictation.test.ts`) keeps the API out of
 * the source; this keeps the drawer from offering a child something to speak
 * into.
 */

vi.mock("@/lib/api/askNevo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/askNevo")>();
  return {
    ...actual,
    askNevoApi: {
      ...actual.askNevoApi,
      ask: vi.fn().mockRejectedValue(new Error("offline")),
      threads: vi.fn().mockResolvedValue([]),
      thread: vi.fn(),
    },
  };
});
vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => true }));
vi.mock("@/lib/auth/session", () => ({ getToken: () => "tok" }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/student/dashboard",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/hooks", () => ({
  useAuth: () => ({ user: { id: "stu-1" } }),
  useSignals: () => ({ trackEvent: vi.fn(), flush: vi.fn() }),
}));

/** Stands in for the browser's recogniser, so any use of it is seen. */
const recogniser = vi.fn(function Recogniser(this: Record<string, unknown>) {
  this.start = vi.fn();
  this.stop = vi.fn();
});
const getUserMedia = vi.fn();
// Built from parts so this file does not itself trip the static guard.
const API = ["Speech", "Recognition"].join("");

const openDrawer = () => {
  render(<AskNevo />);
  fireEvent.click(screen.getAllByRole("button", { name: /ask nevo/i })[0]);
};

/** The composer's own row: the question box and whatever sits beside it. */
const composerRow = () => screen.getByLabelText("Ask a question").parentElement!;

beforeAll(() => {
  Element.prototype.scrollTo = () => {};
});

beforeEach(() => {
  vi.useFakeTimers();
  recogniser.mockClear();
  getUserMedia.mockClear();
  const w = window as unknown as Record<string, unknown>;
  w[API] = recogniser;
  w[`webkit${API}`] = recogniser;
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  const w = window as unknown as Record<string, unknown>;
  delete w[API];
  delete w[`webkit${API}`];
});

describe("Ask Nevo's composer", () => {
  it("offers a child nothing to speak into: a question box and Send, no microphone", () => {
    openDrawer();

    expect(
      screen.queryByRole("button", { name: /speak|listen|microphone|voice/i }),
    ).toBeNull();
    const labels = Array.from(document.querySelectorAll("[aria-label]")).map(
      (el) => el.getAttribute("aria-label"),
    );
    expect(labels.filter((l) => /speak|listen|microphone|voice/i.test(l ?? ""))).toEqual([]);
    expect(
      Array.from(composerRow().querySelectorAll("button")).map((b) =>
        b.getAttribute("aria-label"),
      ),
    ).toEqual(["Send"]);
  });

  it("never starts the browser listening, whatever in it is pressed", () => {
    openDrawer();

    composerRow()
      .querySelectorAll("button")
      .forEach((b) => fireEvent.click(b));
    fireEvent.focus(screen.getByLabelText("Ask a question"));

    expect(recogniser).not.toHaveBeenCalled();
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Ask a question")).toHaveAttribute(
      "placeholder",
      "Ask a question",
    );
    expect(document.body.textContent).not.toMatch(/listening|microphone|voice input/i);
  });
});
