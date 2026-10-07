import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { AccessibilityProvider, useAccessibility } from "./AccessibilityContext";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * ONE CHILD'S SETTINGS, NOT THE TABLET'S.
 *
 * Text size, contrast and motion lived under one device key. On a shared
 * classroom tablet the next child inherited the last child's zoom. These pin
 * that each account keeps its own, and that a change of child is noticed
 * without a reload.
 */

const signInAs = (userId: string) =>
  setSession({
    token: `tok-${userId}`,
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userId,
    role: "student",
  });

function Probe() {
  const a11y = useAccessibility();
  return (
    <div>
      <span data-testid="size">{a11y.textSize}</span>
      <span data-testid="contrast">{String(a11y.highContrast)}</span>
      <button type="button" onClick={() => a11y.setTextSize("xl")}>
        bigger
      </button>
      <button type="button" onClick={() => a11y.setHighContrast(true)}>
        contrast
      </button>
    </div>
  );
}

const size = () => screen.getByTestId("size").textContent;
const contrast = () => screen.getByTestId("contrast").textContent;

/** The session store announces a microtask later; let it land. */
const settle = () => act(async () => {});

beforeEach(() => {
  window.localStorage.clear();
  clearSession();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  clearSession();
});

describe("accessibility settings on a shared tablet", () => {
  it("does not hand one child's text size to the next child", async () => {
    signInAs("ada");
    render(
      <AccessibilityProvider>
        <Probe />
      </AccessibilityProvider>,
    );
    await settle();
    act(() => screen.getByText("bigger").click());
    expect(size()).toBe("xl");

    // Ada signs out; Bayo signs in on the same tablet, same tab.
    clearSession();
    signInAs("bayo");
    await settle();

    expect(size()).toBe("m");
  });

  it("gives a child their own settings back when they return", async () => {
    signInAs("ada");
    render(
      <AccessibilityProvider>
        <Probe />
      </AccessibilityProvider>,
    );
    await settle();
    act(() => screen.getByText("contrast").click());

    signInAs("bayo");
    await settle();
    expect(contrast()).toBe("false");

    signInAs("ada");
    await settle();
    expect(contrast()).toBe("true");
  });

  it("never writes one child's settings under another child's name", async () => {
    signInAs("ada");
    render(
      <AccessibilityProvider>
        <Probe />
      </AccessibilityProvider>,
    );
    await settle();
    act(() => screen.getByText("bigger").click());

    signInAs("bayo");
    await settle();

    const bayo = window.localStorage.getItem("nevo:a11y:bayo");
    expect(bayo === null || !bayo.includes('"xl"')).toBe(true);
  });

  it("keeps the old shared setting away from whichever child signs in first", async () => {
    // Written by the build before this one, by nobody in particular.
    window.localStorage.setItem(
      "nevo:a11y",
      JSON.stringify({ textSize: "xl" }),
    );
    signInAs("ada");
    render(
      <AccessibilityProvider>
        <Probe />
      </AccessibilityProvider>,
    );
    await settle();

    expect(size()).toBe("m");
  });
});

describe("the break preference, removed (D87)", () => {
  it("keeps a child's settings and drops the old break switch from storage", async () => {
    // Written by a build that still had "Suggest breaks automatically".
    window.localStorage.setItem(
      "nevo:a11y:ada",
      JSON.stringify({ textSize: "l", suggestBreaks: false }),
    );
    signInAs("ada");
    render(
      <AccessibilityProvider>
        <Probe />
      </AccessibilityProvider>,
    );
    await settle();

    expect(size()).toBe("l");
    const stored = JSON.parse(window.localStorage.getItem("nevo:a11y:ada")!);
    expect(stored).toEqual({
      reducedMotion: false,
      highContrast: false,
      textSize: "l",
    });
  });
});
