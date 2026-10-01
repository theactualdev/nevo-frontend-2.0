import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { A11Y_BOOT_SCRIPT } from "./accessibilityBoot";
import {
  AccessibilityProvider,
  TEXT_ZOOM,
  useAccessibility,
} from "./AccessibilityContext";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * Rule 6: accommodations before the first paint, never after.
 *
 * The provider reads in an effect, after hydration and after paint, so every
 * load drew default text, contrast and motion and then snapped. The boot
 * script sets the same attributes while the HTML is still parsing. What these
 * pin is that it reaches the SAME answer the provider does - same keys, same
 * child - and that the provider then never paints defaults over it.
 */

const ATTRS = ["data-reduced-motion", "data-contrast", "data-text-size"];
const root = () => document.documentElement;
const attrs = () =>
  Object.fromEntries(ATTRS.map((a) => [a, root().getAttribute(a)]));
const resetRoot = () => ATTRS.forEach((a) => root().removeAttribute(a));

/** What the browser does with the inline `<script>` in `<head>`. */
const boot = () => new Function(A11Y_BOOT_SCRIPT)();

const signInAs = (userId: string, expiresAt = Date.now() + 3600_000) =>
  setSession({
    token: `tok-${userId}`,
    expiresAt: new Date(expiresAt).toISOString(),
    userId,
    role: "student",
  });

function Chooser() {
  const a11y = useAccessibility();
  return (
    <button
      type="button"
      onClick={() => {
        a11y.setTextSize("xl");
        a11y.setHighContrast(true);
        a11y.setReducedMotion(true);
      }}
    >
      choose
    </button>
  );
}

const settle = () => act(async () => {});

beforeEach(() => {
  window.localStorage.clear();
  clearSession();
  resetRoot();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  clearSession();
  resetRoot();
});

describe("the boot script", () => {
  it("applies what the child chose, exactly as the provider does", async () => {
    // Choose through the real provider, so the keys are the real ones.
    signInAs("ada");
    render(
      <AccessibilityProvider>
        <Chooser />
      </AccessibilityProvider>,
    );
    await settle();
    act(() => screen.getByText("choose").click());
    const applied = attrs();
    cleanup();

    // The next page load: a bare root, then the script.
    resetRoot();
    boot();

    expect(attrs()).toEqual(applied);
    expect(applied).toEqual({
      "data-reduced-motion": "true",
      "data-contrast": "high",
      "data-text-size": "xl",
    });
  });

  it("reads the signed-in child's settings, not the tablet's", () => {
    window.localStorage.setItem(
      "nevo:a11y",
      JSON.stringify({ textSize: "s" }),
    );
    window.localStorage.setItem(
      "nevo:a11y:ada",
      JSON.stringify({ textSize: "l" }),
    );
    signInAs("ada");

    boot();

    expect(root().getAttribute("data-text-size")).toBe("l");
  });

  it("reads the tablet's when nobody is signed in, or the session has lapsed", () => {
    window.localStorage.setItem(
      "nevo:a11y",
      JSON.stringify({ textSize: "s" }),
    );
    window.localStorage.setItem(
      "nevo:a11y:ada",
      JSON.stringify({ textSize: "l" }),
    );
    // Written straight to storage: `setSession` would clear a lapsed one.
    window.localStorage.setItem(
      "nevo.auth.session",
      JSON.stringify({
        token: "t",
        userId: "ada",
        role: "student",
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      }),
    );

    boot();

    expect(root().getAttribute("data-text-size")).toBe("s");
  });

  it("leaves the root as the server sent it when nothing was chosen", () => {
    signInAs("ada");
    boot();
    expect(attrs()).toEqual({
      "data-reduced-motion": null,
      "data-contrast": null,
      "data-text-size": null,
    });
  });

  it("survives storage it cannot read", () => {
    window.localStorage.setItem("nevo.auth.session", "{not json");
    expect(boot).not.toThrow();
    expect(root().getAttribute("data-text-size")).toBeNull();
  });

  it("puts an unknown size nowhere rather than somewhere", () => {
    window.localStorage.setItem(
      "nevo:a11y",
      JSON.stringify({ textSize: "huge" }),
    );
    boot();
    expect(root().getAttribute("data-text-size")).toBeNull();
  });
});

describe("the provider after the boot script", () => {
  it("never paints the defaults over the child's settings on its way in", async () => {
    signInAs("ada");
    window.localStorage.setItem(
      "nevo:a11y:ada",
      JSON.stringify({ textSize: "xl", highContrast: true, reducedMotion: true }),
    );
    boot();

    // Every value each attribute held before it was overwritten - the
    // callback runs late, so the record's `oldValue` is the only witness to
    // a value that was written and then replaced in the same pass.
    const seen: (string | null)[] = [];
    const record = (records: MutationRecord[]) => {
      for (const r of records) seen.push(r.oldValue);
    };
    const watcher = new MutationObserver(record);
    watcher.observe(root(), {
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ATTRS,
    });

    render(
      <AccessibilityProvider>
        <Chooser />
      </AccessibilityProvider>,
    );
    await settle();
    // Flush anything still queued, then stop.
    record(watcher.takeRecords());
    watcher.disconnect();

    // THE BUG: the first effect pass wrote "normal", "false" and "m" before
    // the stored prefs had been read.
    const everyValueWritten = new Set(seen);
    expect(everyValueWritten.has("normal")).toBe(false);
    expect(everyValueWritten.has("false")).toBe(false);
    expect(everyValueWritten.has("m")).toBe(false);
    expect(attrs()).toEqual({
      "data-reduced-motion": "true",
      "data-contrast": "high",
      "data-text-size": "xl",
    });
  });
});

describe("high contrast in CSS", () => {
  it("reaches the faint sentences it used to miss", () => {
    // The sign-out reassurance (/62) and the session-ended copy (/66) stayed
    // faint with High Contrast on.
    const css = readFileSync(
      join(process.cwd(), "src", "app", "globals.css"),
      "utf8",
    );
    for (const opacity of [42, 48, 62, 66]) {
      expect(css).toContain(
        `html[data-contrast="high"] .text-nevo-near-black\\/${opacity},`,
      );
    }
  });
});

describe("the text-size zoom in CSS", () => {
  it("uses TEXT_ZOOM's numbers, so the CSS and the teacher shell agree", () => {
    const css = readFileSync(
      join(process.cwd(), "src", "app", "globals.css"),
      "utf8",
    );
    for (const [size, zoom] of Object.entries(TEXT_ZOOM)) {
      if (size === "m") continue;
      const rule = new RegExp(
        `html\\[data-text-size="${size}"\\] \\.nevo-text-zoom \\{\\s*zoom: ${zoom};`,
      );
      expect(css, `the rule for "${size}"`).toMatch(rule);
    }
  });
});
