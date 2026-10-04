import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AFTER_NEW_PIN, NewPinAfterClear } from "./NewPinAfterClear";
import { PinCreationScreen } from "@/components/student/Onboarding/PinCreationScreen";

/**
 * 15 PIN Creation, "New PIN after a clear" (1 Oct, D3).
 *
 * A teacher has cleared the old PIN and the child chooses the next one. Same
 * screen and components; only the opening line changes, so it reads as
 * choosing a new PIN rather than starting again - and on done it goes Home,
 * not to You're In, which welcomes a NEW account.
 */

const { setPin } = vi.hoisted(() => ({ setPin: vi.fn() }));
vi.mock("@/lib/api", () => ({ authApi: { setPin } }));
// The child whose PIN was cleared, signed in.
vi.mock("@/lib/auth/session", () => ({
  getSession: () => ({ role: "student", userId: "child-1" }),
}));

const { replace, push } = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push, back: vi.fn() }),
}));

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

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  setPin.mockReset();
  replace.mockReset();
  push.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("New PIN after a clear", () => {
  it("opens on choosing a new PIN, with the same rows as creating one", () => {
    render(<NewPinAfterClear />);

    expect(
      screen.getByRole("heading", { name: "Choose a new PIN" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Create a PIN")).toBeNull();
    expect(
      screen.getByText("You'll use this to log in next time"),
    ).toBeInTheDocument();
    expect(screen.getByText("Type it again to confirm")).toBeInTheDocument();
  });

  it("stores it for the signed-in child, and goes Home once it is saved", async () => {
    let land: () => void = () => {};
    setPin.mockReturnValue(new Promise<void>((r) => (land = () => r())));
    render(<NewPinAfterClear />);

    enterTwice();
    await settle(500);
    expect(setPin).toHaveBeenCalledWith("1234");
    // Not before the save has landed.
    expect(replace).not.toHaveBeenCalled();

    await act(async () => land());
    expect(
      screen.getByRole("heading", { name: "You're all set" }),
    ).toBeInTheDocument();

    await settle(1300);
    expect(replace).toHaveBeenCalledWith("/student/dashboard");
    expect(AFTER_NEW_PIN).toBe("/student/dashboard");
    expect(push).not.toHaveBeenCalled();
  });

  it("stays put on a save that is refused", async () => {
    setPin.mockRejectedValue(new Error("403"));
    render(<NewPinAfterClear />);

    enterTwice();
    await settle(3000);

    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

describe("PIN creation without the clear", () => {
  it("still opens on creating a PIN", () => {
    render(<PinCreationScreen onComplete={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: "Create a PIN" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Choose a new PIN")).toBeNull();
  });
});
