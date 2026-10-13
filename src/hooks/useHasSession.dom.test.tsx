import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { useHasSession } from "./useHasSession";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * It listened to `storage` alone, which only fires for writes made in ANOTHER
 * tab. A child signing in in THIS tab left every root-mounted reader - the
 * bell among them - on its signed-out answer.
 */

function Probe() {
  return <span data-testid="signed-in">{String(useHasSession())}</span>;
}

afterEach(() => {
  cleanup();
  clearSession();
});

describe("useHasSession", () => {
  it("notices a sign-in made in this tab", async () => {
    clearSession();
    render(<Probe />);
    expect(screen.getByTestId("signed-in").textContent).toBe("false");

    setSession({
      token: "tok",
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      userId: "ada",
      role: "student",
    });
    await act(async () => {});

    expect(screen.getByTestId("signed-in").textContent).toBe("true");
  });

  it("notices a sign-out made in this tab", async () => {
    setSession({
      token: "tok",
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      userId: "ada",
      role: "student",
    });
    render(<Probe />);
    await act(async () => {});
    expect(screen.getByTestId("signed-in").textContent).toBe("true");

    clearSession();
    await act(async () => {});

    expect(screen.getByTestId("signed-in").textContent).toBe("false");
  });
});
