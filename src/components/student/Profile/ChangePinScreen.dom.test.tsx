import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ChangePinScreen } from "./ChangePinScreen";
import { ApiError } from "@/lib/api/client";
import { STUDENT_PIN_LENGTH } from "@/lib/constants";

/**
 * Changing a PIN has to prove the old one as of 23 Sep, and the server
 * ENFORCES it - so without step 1 this screen simply stops working.
 *
 * The two assertions that carry weight are that `currentPin` actually reaches
 * the wire, and that a wrong one is named as the child's rather than as ours.
 */

const { setPin } = vi.hoisted(() => ({ setPin: vi.fn() }));
vi.mock("@/lib/api", () => ({ authApi: { setPin } }));

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
}));

const CURRENT = "1".repeat(STUDENT_PIN_LENGTH);
const NEXT = "2".repeat(STUDENT_PIN_LENGTH);

const type = (pin: string) => {
  for (const d of pin) {
    fireEvent.keyDown(window, { key: d });
  }
};

const continueButton = () => screen.getByRole("button", { name: "Continue" });

/** Step 1 through to the new-PIN screen. */
const passStepOne = (pin = CURRENT) => {
  type(pin);
  fireEvent.click(continueButton());
};

/** The new PIN is entered twice by the pattern; advance its 1.2s beat. */
const enterNewPinTwice = async () => {
  type(NEXT + NEXT);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1500);
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  setPin.mockReset();
  setPin.mockResolvedValue({});
  push.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("step 1", () => {
  it("asks for the current PIN before anything else", () => {
    render(<ChangePinScreen />);

    expect(
      screen.getByRole("heading", { name: /Enter your current PIN/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
  });

  it("will not continue on a part-typed PIN", () => {
    render(<ChangePinScreen />);

    type("12");

    expect(continueButton()).toBeDisabled();
  });

  it("takes a physical keyboard, not only taps", () => {
    /*
     * A child on a school laptop could not type into either PIN door until
     * 18 Sep. A new PIN screen that only took taps would put that straight
     * back, on the one door nobody would think to re-test.
     */
    render(<ChangePinScreen />);

    type(CURRENT);

    expect(continueButton()).toBeEnabled();
  });
});

describe("what reaches the wire", () => {
  it("sends the current PIN with the new one", async () => {
    render(<ChangePinScreen />);
    passStepOne();
    await enterNewPinTwice();

    expect(setPin).toHaveBeenCalledWith(NEXT, CURRENT);
  });

  it("returns to Profile once it lands", async () => {
    render(<ChangePinScreen />);
    passStepOne();
    await enterNewPinTwice();

    expect(push).toHaveBeenCalledWith("/student/profile");
  });
});

describe("a wrong current PIN", () => {
  const refused = () =>
    new ApiError(403, "no", {
      detail: { code: "current_pin_required", message: "x" },
    });

  it("goes back to step 1 and names it as theirs", async () => {
    /*
     * THE DECISIVE ONE. The next screen's failure copy is "that's on us, not
     * you", which is right for a dropped write and wrong for this - retyping
     * is exactly the fix here, and sending a child to find an adult about it
     * is the mirror of the bug that copy was written to escape.
     */
    setPin.mockRejectedValue(refused());

    render(<ChangePinScreen />);
    passStepOne("9".repeat(STUDENT_PIN_LENGTH));
    await enterNewPinTwice();

    expect(
      screen.getByRole("heading", { name: /Enter your current PIN/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/not your current PIN/i)).toBeInTheDocument();
  });

  it("does not say the change worked, and does not leave the screen", async () => {
    setPin.mockRejectedValue(refused());

    render(<ChangePinScreen />);
    passStepOne("9".repeat(STUDENT_PIN_LENGTH));
    await enterNewPinTwice();

    expect(push).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toMatch(/on us, not you/i);
  });

  it("clears the wrong PIN so it is retyped rather than edited", async () => {
    setPin.mockRejectedValue(refused());

    render(<ChangePinScreen />);
    passStepOne("9".repeat(STUDENT_PIN_LENGTH));
    await enterNewPinTwice();

    expect(continueButton()).toBeDisabled();
  });
});

describe("a failure that is not theirs", () => {
  it("is left to the pattern's own copy", async () => {
    // A dropped network is not a mistyped PIN, and this screen must not claim
    // it is. `PinCreationScreen` owns that sentence.
    setPin.mockRejectedValue(new TypeError("fetch failed"));

    render(<ChangePinScreen />);
    passStepOne();
    await enterNewPinTwice();

    expect(screen.queryByText(/not your current PIN/i)).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });
});
