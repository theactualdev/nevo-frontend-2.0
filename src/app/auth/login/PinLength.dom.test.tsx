import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import LoginPage from "./page";
import { ApiError } from "@/lib/api/client";
import { clearSession } from "@/lib/auth/session";

/**
 * FOUR-DIGIT PINS, ON A SCREEN THAT SUBMITS BY ITSELF.
 *
 * The one-tap unlock sends the PIN the moment the boxes fill (28c). That was
 * safe while every PIN was six. From 25 Sep a new PIN is four, while every
 * earlier one - and every adult's reset - is still six, so the screen has to
 * know WHICH, per child, or it sends two-thirds of a six-digit PIN and tells
 * the child it did not match.
 *
 * What these pin down is that a remembered length can cost a child one retry
 * and can never lock them out: the length is a hint, the check key is always
 * there, and a PIN that did not match stops the hint being trusted.
 */

/*
 * ONE router and ONE roster array for the whole file. The page's hydrate
 * effect depends on `router`, and a fresh object per render re-runs it; a
 * fresh entries array per call then re-renders, and the two loop until the
 * worker runs out of memory.
 */
const router = vi.hoisted(() => ({
  push: () => {},
  replace: () => {},
  back: () => {},
}));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/hooks", () => ({ useAuth: () => ({ signIn: vi.fn() }) }));

const { loginPin } = vi.hoisted(() => ({ loginPin: vi.fn() }));
vi.mock("@/lib/api", () => ({ authApi: { loginPin } }));
vi.mock("@/lib/auth/entryGate", () => ({
  studentDestination: async () => "/student/dashboard",
}));

const roster = vi.hoisted(() => ({
  pinLength: undefined as number | undefined,
  rememberChild: vi.fn(),
  entries: [{ id: "a", name: "Ada", shapeIndex: 0 }],
}));
vi.mock("@/lib/auth/deviceRoster", () => ({
  SHAPE_COUNT: 6,
  pickerEntries: () => roster.entries,
  childById: (id: string) =>
    id === "a"
      ? {
          id,
          schoolCode: "NEVO-1",
          loginIdentifier: "ada.o",
          displayName: "Ada",
          initials: "AO",
          shapeIndex: 0,
          lastUsedAt: new Date().toISOString(),
          ...(roster.pinLength ? { pinLength: roster.pinLength } : {}),
        }
      : null,
  rememberChild: roster.rememberChild,
}));

const SESSION = {
  accessToken: "tok",
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  userId: "student-1",
  role: "student",
};

const wrongPin = () =>
  new ApiError(401, "Unauthorized", {
    detail: { code: "authentication_failed", message: "no" },
  });

async function chooseAda() {
  render(<LoginPage />);
  fireEvent.click(await screen.findByRole("button", { name: "Ada" }));
  await screen.findByText("Enter your PIN to keep going");
}

/** Tap digits on the pad, as a child on a tablet does. */
async function tap(digits: string) {
  for (const d of digits) {
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: d }));
    });
  }
}

const sentPins = () => loginPin.mock.calls.map(([body]) => body.pin);

beforeEach(() => {
  clearSession();
  loginPin.mockReset();
  roster.rememberChild.mockReset();
  roster.pinLength = undefined;
});

afterEach(() => {
  cleanup();
});

describe("the one-tap unlock, now that a PIN may be four or six", () => {
  it("submits a four-digit PIN on the fourth digit for a child who has one", async () => {
    roster.pinLength = 4;
    loginPin.mockResolvedValue(SESSION);
    await chooseAda();

    await tap("1234");

    await waitFor(() => expect(sentPins()).toEqual(["1234"]));
  });

  it("waits for six from a child remembered before four-digit PINs existed", async () => {
    // No recorded length means an older device, and every PIN it has seen
    // was six. Submitting at four is the 31 Aug lockout.
    loginPin.mockResolvedValue(SESSION);
    await chooseAda();

    await tap("1234");
    expect(loginPin).not.toHaveBeenCalled();

    await tap("56");
    await waitFor(() => expect(sentPins()).toEqual(["123456"]));
  });

  it("lets a child whose PIN is shorter than remembered send it with the check key", async () => {
    // A child who changed a six-digit PIN to a new four-digit one, on a
    // device that still remembers six.
    loginPin.mockResolvedValue(SESSION);
    await chooseAda();

    await tap("1234");
    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    await waitFor(() => expect(sentPins()).toEqual(["1234"]));
  });

  it("does not send fewer than four digits, which the server would refuse by shape", async () => {
    await chooseAda();

    await tap("123");
    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(loginPin).not.toHaveBeenCalled();
  });

  it("stops trusting the remembered length after a PIN that did not match", async () => {
    /*
     * THE RESET CASE. The device remembers four; an adult has since reset the
     * PIN, and resets issue six. Trusting four forever would submit the first
     * four digits of the new PIN on every attempt and lock the child out of
     * this screen for good.
     */
    roster.pinLength = 4;
    loginPin.mockRejectedValueOnce(wrongPin()).mockResolvedValue(SESSION);
    await chooseAda();

    await tap("1234");
    await screen.findByText(/didn't match/);

    await tap("1234");
    expect(loginPin).toHaveBeenCalledTimes(1);

    await tap("56");
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(sentPins()).toEqual(["1234", "123456"]));
  });

  it("records the length that worked, so tomorrow's boxes are right", async () => {
    loginPin.mockResolvedValue(SESSION);
    await chooseAda();

    await tap("1234");
    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    await waitFor(() =>
      expect(roster.rememberChild).toHaveBeenCalledWith(
        expect.objectContaining({ loginIdentifier: "ada.o", pinLength: 4 }),
      ),
    );
  });

  it("records the length, never the PIN", async () => {
    loginPin.mockResolvedValue(SESSION);
    await chooseAda();

    await tap("123456");

    await waitFor(() => expect(roster.rememberChild).toHaveBeenCalled());
    expect(JSON.stringify(roster.rememberChild.mock.calls)).not.toContain(
      "123456",
    );
  });
});
