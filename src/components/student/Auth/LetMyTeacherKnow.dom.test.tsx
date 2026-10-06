import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ForgotPinPage from "@/app/auth/forgot-pin/page";
import { rememberChild } from "@/lib/auth/deviceRoster";

/**
 * 00a's "Let my teacher know" (design, D3; SCRUM-217).
 *
 * Nobody but the child ever sets a PIN: this asks, an adult clears, the child
 * sets a new one. What these pin is that the ask goes for the RIGHT child,
 * that the screen says it was sent only once the server took it, and that
 * there is no button when there is nobody to ask for.
 */

const { requestPinReset } = vi.hoisted(() => ({ requestPinReset: vi.fn() }));
vi.mock("@/lib/api", () => ({ authApi: { requestPinReset } }));

const page = async (query: { next?: string; child?: string }) =>
  render(await ForgotPinPage({ searchParams: Promise.resolve(query) }));

/** Remember two children, as a shared tablet would, and return Ada's id. */
function rememberAdaAndKofi(): string {
  rememberChild({ schoolCode: "NEVO-1", loginIdentifier: "kofi.b", initials: "KB" });
  const roster = rememberChild({
    schoolCode: "NEVO-1",
    loginIdentifier: "ada.o",
    initials: "AO",
  });
  return roster.find((c) => c.loginIdentifier === "ada.o")!.id;
}

beforeEach(() => {
  requestPinReset.mockReset();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("Let my teacher know", () => {
  it("asks for the child who forgot, by the pair the device holds", async () => {
    requestPinReset.mockResolvedValue({});
    const ada = rememberAdaAndKofi();
    await page({ child: ada });

    fireEvent.click(
      await screen.findByRole("button", { name: "Let my teacher know" }),
    );

    expect(requestPinReset).toHaveBeenCalledWith({
      schoolCode: "NEVO-1",
      loginIdentifier: "ada.o",
    });
  });

  it("puts the ask first and the way back under it, as 00a draws them", async () => {
    const ada = rememberAdaAndKofi();
    await page({ child: ada });

    const ask = await screen.findByRole("button", {
      name: "Let my teacher know",
    });
    const back = screen.getByRole("link", { name: "Back to sign in" });
    expect(
      ask.compareDocumentPosition(back) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // The Button's default is the primary; the way back is the quiet one.
    expect(ask).not.toHaveAttribute("data-variant");
    expect(back).toHaveAttribute("data-variant", "ghost");
  });

  it("says the teacher knows only once the server has taken it, and cannot be sent twice", async () => {
    let accept: (v: unknown) => void = () => {};
    requestPinReset.mockReturnValue(new Promise((r) => (accept = r)));
    const ada = rememberAdaAndKofi();
    await page({ child: ada });

    fireEvent.click(
      await screen.findByRole("button", { name: "Let my teacher know" }),
    );
    expect(screen.queryByText("Your teacher knows")).toBeNull();
    expect(screen.getByText("Forgot your PIN?")).toBeInTheDocument();

    accept({});
    expect(await screen.findByText("Your teacher knows")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Let my teacher know" }),
    ).toBeNull();
    expect(requestPinReset).toHaveBeenCalledTimes(1);
  });

  it("draws 00a's sent state whole, with one way back to sign in", async () => {
    requestPinReset.mockResolvedValue({});
    const ada = rememberAdaAndKofi();
    await page({ child: ada, next: "/student/lessons" });

    fireEvent.click(
      await screen.findByRole("button", { name: "Let my teacher know" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Your teacher knows" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Once they've cleared your old PIN, sign in again and choose your new one.",
      ),
    ).toBeInTheDocument();
    // The ask's screen is replaced, not added to.
    expect(screen.queryByText("Forgot your PIN?")).toBeNull();
    expect(document.querySelector('img[src*="error"]')).toBeNull();
    expect(
      screen.getByRole("link", { name: "Back to sign in" }),
    ).toHaveAttribute("href", "/auth/login?next=%2Fstudent%2Flessons");
  });

  it("says a refused ask was not sent, and lets them try again", async () => {
    requestPinReset.mockRejectedValueOnce(new Error("503"));
    const ada = rememberAdaAndKofi();
    await page({ child: ada });

    fireEvent.click(
      await screen.findByRole("button", { name: "Let my teacher know" }),
    );

    expect(
      await screen.findByText(/couldn.t send that just now/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Your teacher knows")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Let my teacher know" }),
    ).toBeEnabled();
  });

  it("is not there when there is no remembered child to ask for", async () => {
    // Opened directly, or the entry aged out: nothing to send, so no button.
    rememberAdaAndKofi();
    await page({});
    await screen.findByRole("link", { name: "Back to sign in" });

    expect(
      screen.queryByRole("button", { name: "Let my teacher know" }),
    ).toBeNull();
  });

  it("is not there for an id this device does not hold", async () => {
    rememberAdaAndKofi();
    await page({ child: "not-a-child-here" });
    await screen.findByRole("link", { name: "Back to sign in" });

    expect(
      screen.queryByRole("button", { name: "Let my teacher know" }),
    ).toBeNull();
  });

  it("never shows a PIN or a credential on the screen", async () => {
    requestPinReset.mockResolvedValue({});
    const ada = rememberAdaAndKofi();
    await page({ child: ada });
    fireEvent.click(
      await screen.findByRole("button", { name: "Let my teacher know" }),
    );
    await screen.findByText("Your teacher knows");

    expect(document.body.textContent).not.toMatch(/ada\.o|NEVO-1|\d{4}/);
  });
});
