import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

/**
 * 28b: "the lesson the child was on stays visible but goes quiet behind a soft
 * scrim, and a calm card explains in two lines ... After they tap Okay it
 * settles into a full paused screen with the same two lines and nothing
 * further to do."
 *
 * The pause flag is sticky for the life of a page by design, so every test
 * takes a fresh copy of the module and the host that reads it.
 */

/*
 * Every test re-imports the host on a reset module registry, so each one pays
 * a cold import of Radix and `next/image`. Alone that is quick; on a contended
 * worker the first test wore it and timed out at 5s.
 */
vi.setConfig({ testTimeout: 30_000 });

const clearSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  clearSession,
}));

async function fresh() {
  vi.resetModules();
  const pause = await import("@/lib/auth/accountPause");
  const { AccountPauseHost } = await import("./AccountPauseHost");
  return { pause, AccountPauseHost };
}

function Lesson() {
  return <p>How a leaf makes food</p>;
}

beforeEach(() => {
  clearSession.mockClear();
});

describe("a pause that lands while a child is reading", () => {
  it("draws nothing until there is a pause", async () => {
    const { AccountPauseHost } = await fresh();
    render(
      <>
        <Lesson />
        <AccountPauseHost />
      </>,
    );

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("is the host the client looks for before it decides not to leave", async () => {
    const { pause, AccountPauseHost } = await fresh();
    const { unmount } = render(<AccountPauseHost />);

    expect(pause.pauseHostsMounted()).toBe(1);
    unmount();
    expect(pause.pauseHostsMounted()).toBe(0);
  });

  it("puts the card over the lesson, which stays where it was", async () => {
    const { pause, AccountPauseHost } = await fresh();
    render(
      <>
        <Lesson />
        <AccountPauseHost />
      </>,
    );

    act(() => pause.announceAccountPause());

    expect(
      screen.getByRole("dialog", { name: "Your Nevo account is on pause." }),
    ).toBeInTheDocument();
    expect(screen.getByText("If you have questions, talk to your teacher.")).toBeInTheDocument();
    // Still there, not navigated away from: it is behind the scrim.
    expect(document.body.textContent).toContain("How a leaf makes food");
    // And the session is kept until Okay - clearing it here would turn the
    // lesson behind the scrim into the signed-out sample walkthrough.
    expect(clearSession).not.toHaveBeenCalled();
  });

  it("cannot be waved away, because there is nothing behind it to go back to", async () => {
    const { pause, AccountPauseHost } = await fresh();
    render(<AccountPauseHost />);
    act(() => pause.announceAccountPause());

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("settles into the full paused screen on Okay, with nothing for the paused child to retry", async () => {
    const { pause, AccountPauseHost } = await fresh();
    render(<AccountPauseHost />);
    act(() => pause.announceAccountPause());

    fireEvent.click(screen.getByRole("button", { name: "Okay" }));

    expect(clearSession).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Your Nevo account is on pause.",
    );
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    // The one control is the way back to the picker (D52), not a retry.
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("leaves a way back to the picker, by a full page load (D52)", async () => {
    // A shared tablet showing a screen with no controls locks every other
    // child out of it. A FULL load, not a client push: the pause is sticky
    // for this page, and the next child must not inherit it.
    const { pause, AccountPauseHost } = await fresh();
    render(<AccountPauseHost />);
    act(() => pause.announceAccountPause());
    fireEvent.click(screen.getByRole("button", { name: "Okay" }));

    const back = screen.getByRole("link", { name: "Back to sign in" });
    expect(back).toHaveAttribute("href", "/auth/login");
    expect(screen.queryByText(/try again|log back in/i)).toBeNull();
  });

  it("still shows a pause that landed before it mounted", async () => {
    // A route change racing the 401: the flag is sticky so the card is not lost.
    const { pause, AccountPauseHost } = await fresh();
    pause.announceAccountPause();

    render(<AccountPauseHost />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
