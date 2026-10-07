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
 * FOUR DIGITS, FOUR BOXES (D58, 6 Oct).
 *
 * The one-tap unlock sends the PIN the moment the boxes fill (28c). It used to
 * draw whatever length the device remembered for a child - six for one it
 * predated - and after a PIN that did not match, grew the boxes up to eight
 * and waited for the check key. Design: "SCRUM-179 settles it and the
 * six-digit reference is stale wherever it appears." Five to eight were only
 * ever a 422 from `PinLoginRequest`.
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
  WAITING_ROUTE: "/student/waiting",
}));

const roster = vi.hoisted(() => ({
  pinLength: undefined as number | undefined,
  rememberChild: vi.fn(),
  entries: [
    { id: "a", name: "Ada", shapeIndex: 0 },
    { id: "k", name: "Kofi", shapeIndex: 1 },
  ],
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

/** The four boxes are drawn, not inputs: each is a 10px-radius tile. */
const boxes = () =>
  document.querySelectorAll("main .rounded-\\[10px\\].border-\\[1\\.5px\\]")
    .length;

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

describe("the one-tap unlock, now that every PIN is four", () => {
  it("draws four boxes and submits on the fourth digit", async () => {
    loginPin.mockResolvedValue(SESSION);
    await chooseAda();

    expect(boxes()).toBe(4);
    await tap("1234");

    await waitFor(() => expect(sentPins()).toEqual(["1234"]));
  });

  it("draws four for a child the device remembers as six", async () => {
    // A device that recorded six (or recorded nothing, from before 25 Sep)
    // used to draw six boxes and wait for the last two.
    roster.pinLength = 6;
    loginPin.mockResolvedValue(SESSION);
    await chooseAda();

    expect(boxes()).toBe(4);
    await tap("1234");

    await waitFor(() => expect(sentPins()).toEqual(["1234"]));
  });

  it("never sends more than four, whatever a keyboard types", async () => {
    // A hardware keyboard can land several digits in one event; the fifth
    // and sixth are a shape the server 422s.
    loginPin.mockResolvedValue(SESSION);
    await chooseAda();

    fireEvent.change(
      document.querySelector('input[aria-label="PIN"]') as HTMLInputElement,
      { target: { value: "123456" } },
    );

    await waitFor(() => expect(sentPins()).toEqual(["1234"]));
  });

  it("still submits on the fourth digit after a PIN that did not match", async () => {
    // The boxes used to stop trusting the length here, grow to eight, and
    // wait for the check key.
    loginPin.mockRejectedValueOnce(wrongPin()).mockResolvedValue(SESSION);
    await chooseAda();

    await tap("1234");
    await screen.findByText(/didn't match/);

    expect(boxes()).toBe(4);
    await tap("5678");

    await waitFor(() => expect(sentPins()).toEqual(["1234", "5678"]));
  });

  it("does not send fewer than four digits from the check key", async () => {
    await chooseAda();

    await tap("123");
    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(loginPin).not.toHaveBeenCalled();
  });

  it("remembers no length for the child, and never the PIN", async () => {
    // "The length arrives with the PIN rather than being remembered by the
    // device" (D58, 4 Oct).
    loginPin.mockResolvedValue(SESSION);
    await chooseAda();

    await tap("9753");

    await waitFor(() => expect(roster.rememberChild).toHaveBeenCalled());
    expect(roster.rememberChild.mock.calls[0][0]).not.toHaveProperty(
      "pinLength",
    );
    expect(JSON.stringify(roster.rememberChild.mock.calls)).not.toContain(
      "9753",
    );
  });
});

describe("which account a remembered child is", () => {
  it("is recorded on the first unlock, so a signed-in screen can find this child", async () => {
    // Without it, every signed-in screen fell back to whichever child the
    // device remembered last - and called this child by that child's name.
    loginPin.mockResolvedValue(SESSION);
    await chooseAda();

    await tap("1234");

    await waitFor(() =>
      expect(roster.rememberChild).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "student-1" }),
      ),
    );
  });
});
