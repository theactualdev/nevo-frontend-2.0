import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import {
  AccessibilityProvider,
  accountPrefs,
  useAccessibility,
} from "./AccessibilityContext";
import { clearSession, setSession } from "@/lib/auth/session";

const { personalGet, personalUpdate } = vi.hoisted(() => ({
  personalGet: vi.fn(),
  personalUpdate: vi.fn(),
}));
vi.mock("@/lib/api/settings", () => ({
  personalSettingsApi: { get: personalGet, update: personalUpdate },
}));

/**
 * ONE CHILD'S SETTINGS, NOT THE TABLET'S.
 *
 * Text size, contrast and motion lived under one device key. On a shared
 * classroom tablet the next child inherited the last child's zoom. These pin
 * that each account keeps its own, and that a change of child is noticed
 * without a reload.
 */

const signInAs = (userId: string, role = "student") =>
  setSession({
    token: `tok-${userId}`,
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userId,
    role,
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
      <button
        type="button"
        onClick={() =>
          void a11y.setReducedMotion(true).then((ok) => {
            kept.push(ok);
          })
        }
      >
        calm
      </button>
    </div>
  );
}

/** What each `setReducedMotion` from the probe resolved: kept, or not. */
let kept: boolean[] = [];
const size = () => screen.getByTestId("size").textContent;
const contrast = () => screen.getByTestId("contrast").textContent;

/** The session store announces a microtask later; let it land. */
const settle = () => act(async () => {});

beforeEach(() => {
  window.localStorage.clear();
  clearSession();
  kept = [];
  personalGet.mockReset();
  // No account preferences by default: these cases are about the device.
  personalGet.mockResolvedValue({ userId: "x", preferences: {} });
  personalUpdate.mockReset();
  personalUpdate.mockResolvedValue({ userId: "x", preferences: {} });
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

/**
 * SCRUM-226 (8 Oct): "Preferences are account-level and persist through
 * GET/PUT /api/v1/settings/me. They are not tablet-local."
 *
 * The device's copy still paints first (rule 6, the boot script); the
 * account's values win once read, and every change is written through.
 */
describe("a child's settings, kept on their account", () => {
  const renderProbe = () =>
    render(
      <AccessibilityProvider>
        <Probe />
      </AccessibilityProvider>,
    );
  const held = (accessibility: Record<string, unknown>) => ({
    userId: "ada",
    preferences: { accessibility },
  });

  it("paints the device's copy, then takes the account's once read", async () => {
    window.localStorage.setItem(
      "nevo:a11y:ada",
      JSON.stringify({ reducedMotion: false, highContrast: false, textSize: "l" }),
    );
    let answer: (v: unknown) => void = () => {};
    personalGet.mockReturnValue(new Promise((r) => (answer = r)));
    signInAs("ada");
    renderProbe();
    await settle();

    // The device's copy first, before the account has answered.
    expect(size()).toBe("l");

    await act(async () =>
      answer(held({ textSize: "xl", highContrast: true, reducedMotion: false })),
    );

    expect(size()).toBe("xl");
    expect(contrast()).toBe("true");
    expect(document.documentElement.dataset.textSize).toBe("xl");
    // Kept on the device too, so the next load paints it before React runs.
    expect(
      JSON.parse(window.localStorage.getItem("nevo:a11y:ada")!).textSize,
    ).toBe("xl");
  });

  it("keeps the device's copy when the account cannot be read", async () => {
    window.localStorage.setItem(
      "nevo:a11y:ada",
      JSON.stringify({ textSize: "l" }),
    );
    personalGet.mockRejectedValue(new Error("503"));
    signInAs("ada");
    renderProbe();
    await settle();
    await settle();

    expect(size()).toBe("l");
  });

  it("takes only the well-formed fields the account holds", () => {
    expect(
      accountPrefs({
        accessibility: { textSize: "huge", highContrast: "yes", reducedMotion: true },
      }),
    ).toEqual({ reducedMotion: true });
    expect(accountPrefs({ somethingElse: 1 })).toEqual({});
    expect(accountPrefs(null)).toEqual({});
  });

  it("writes a change through to the account, all three under one key", async () => {
    signInAs("ada");
    renderProbe();
    await settle();

    await act(async () => screen.getByText("bigger").click());

    expect(personalUpdate).toHaveBeenCalledWith({
      accessibility: { reducedMotion: false, highContrast: false, textSize: "xl" },
    });
  });

  it("resolves kept only once the account's write lands, and not kept when it fails", async () => {
    signInAs("ada");
    renderProbe();
    await settle();

    personalUpdate.mockRejectedValueOnce(new Error("503"));
    await act(async () => screen.getByText("calm").click());
    await act(async () => screen.getByText("calm").click());

    expect(kept).toEqual([false, true]);
  });

  it("does not let the account's older answer undo a choice made while it was out", async () => {
    let answer: (v: unknown) => void = () => {};
    personalGet.mockReturnValue(new Promise((r) => (answer = r)));
    signInAs("ada");
    renderProbe();
    await settle();

    await act(async () => screen.getByText("bigger").click());
    await act(async () => answer(held({ textSize: "s" })));

    expect(size()).toBe("xl");
  });

  it("asks the account again when the child signs in again", async () => {
    signInAs("ada");
    renderProbe();
    await settle();
    expect(personalGet).toHaveBeenCalledTimes(1);

    clearSession();
    await settle();
    personalGet.mockResolvedValue(held({ textSize: "l" }));
    signInAs("ada");
    await settle();
    await settle();

    expect(personalGet).toHaveBeenCalledTimes(2);
    expect(size()).toBe("l");
  });

  it("leaves a staff account's settings on the device", async () => {
    signInAs("teacher-1", "teacher");
    renderProbe();
    await settle();

    await act(async () => screen.getByText("calm").click());

    expect(personalGet).not.toHaveBeenCalled();
    expect(personalUpdate).not.toHaveBeenCalled();
    expect(kept).toEqual([true]);
  });
});
