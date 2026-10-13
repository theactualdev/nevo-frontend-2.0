import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PinCreationScreen } from "./PinCreationScreen";

/**
 * D8, 1 Oct: "The check mark waits for the save to confirm, and a failed save
 * says so while keeping what the child typed."
 *
 * It did neither. The check mark and "You're all set" appeared the moment the
 * two rows matched, held for a beat while the write went - so a PIN the server
 * then refused had already been celebrated. And a refusal cleared the confirm
 * row, asking the child to retype something retyping could not fix.
 */

vi.mock("@/lib/api", () => ({ authApi: { setPin: vi.fn() } }));
vi.mock("@/lib/auth/session", () => ({ getSession: () => null }));

vi.setConfig({ testTimeout: 30_000 });

const enterTwice = (pin = "1234") => {
  for (const digit of [...pin, ...pin]) {
    fireEvent.click(screen.getByRole("button", { name: digit }));
  }
};

const settle = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

/** Filled boxes are the ones holding a dot. */
const filledBoxes = () =>
  document.querySelectorAll("span.rounded-full.bg-nevo-near-black").length;

const allSet = () => screen.queryByRole("heading", { name: "You're all set" });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("the check mark", () => {
  it("does not appear while the PIN is still being saved", async () => {
    // A write that has not answered yet.
    const storePin = vi.fn(() => new Promise<void>(() => {}));
    render(<PinCreationScreen storePin={storePin} onComplete={vi.fn()} />);

    enterTwice();
    await settle(3000);

    expect(storePin).toHaveBeenCalledWith("1234");
    expect(allSet()).toBeNull();
  });

  it("shows frame 15's saving state while it goes, with the rows hidden (D61)", async () => {
    const storePin = vi.fn(() => new Promise<void>(() => {}));
    render(<PinCreationScreen storePin={storePin} onComplete={vi.fn()} />);

    enterTwice();
    await settle(3000);

    expect(screen.getByText("Saving your PIN…")).toBeInTheDocument();
    expect(
      document.querySelector("span.motion-safe\\:animate-spin"),
    ).not.toBeNull();
    // The heading stays the step's own; only the line under it changes.
    expect(screen.getByRole("heading", { name: "Create a PIN" })).toBeInTheDocument();
    expect(filledBoxes()).toBe(0);
    expect(screen.queryByText("Type it again to confirm")).toBeNull();
  });

  it("appears once the save lands, and only then moves on", async () => {
    let land: () => void = () => {};
    const storePin = vi.fn(() => new Promise<void>((r) => (land = r)));
    const onComplete = vi.fn();
    render(<PinCreationScreen storePin={storePin} onComplete={onComplete} />);

    enterTwice();
    await settle(500);
    expect(allSet()).toBeNull();

    await act(async () => land());
    expect(allSet()).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();

    await settle(1300);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("never appears for a save that is refused", async () => {
    const storePin = vi.fn().mockRejectedValue(new Error("403"));
    const onComplete = vi.fn();
    render(<PinCreationScreen storePin={storePin} onComplete={onComplete} />);

    enterTwice();
    await settle(3000);

    expect(allSet()).toBeNull();
    expect(onComplete).not.toHaveBeenCalled();
  });
});

describe("a save that fails", () => {
  it("says so in frame 15's own state, with the rows hidden (D61)", async () => {
    const storePin = vi.fn().mockRejectedValue(new Error("503"));
    render(<PinCreationScreen storePin={storePin} onComplete={vi.fn()} />);

    enterTwice();
    await settle(1000);

    expect(
      screen.getByRole("heading", { name: "That didn't save" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Your PIN is kept. That's on us - try again.",
    );
    expect(filledBoxes()).toBe(0);
    expect(screen.queryByText("Saving your PIN…")).toBeNull();
    // A primary Try again, not the ghost one it was.
    expect(screen.getByRole("button", { name: "Try again" }).className).toContain(
      "bg-nevo-navy",
    );
  });

  it("tries the same PIN again, without retyping, and celebrates only when it lands", async () => {
    const storePin = vi
      .fn()
      .mockRejectedValueOnce(new Error("503"))
      .mockResolvedValueOnce(undefined);
    const onComplete = vi.fn();
    render(<PinCreationScreen storePin={storePin} onComplete={onComplete} />);

    enterTwice("5678");
    await settle(1000);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    // Straight back to saving: the kept PIN is not shown again on the way.
    expect(screen.getByText("Saving your PIN…")).toBeInTheDocument();
    expect(filledBoxes()).toBe(0);
    await settle(1000);

    expect(storePin).toHaveBeenCalledTimes(2);
    expect(storePin).toHaveBeenLastCalledWith("5678");
    expect(allSet()).toBeInTheDocument();
    await settle(1300);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
