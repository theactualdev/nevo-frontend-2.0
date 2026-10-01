import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { createPortal } from "react-dom";
import { RotateLock } from "./RotateLock";

/**
 * Covering the app is not the same as stopping it.
 *
 * `RotatePrompt` is a `fixed inset-0` overlay shown by a media query when a
 * touch device is held landscape. It hid the app and left it running: every
 * control still in the tab order, every heading still in the accessibility
 * tree. A child on a keyboard or on switch access could tab into the lesson
 * they had just been asked to turn away from and activate things they could not
 * see, and a screen reader read the whole page out as if nothing had happened.
 *
 * None of that is visible to anyone testing with a mouse on a desktop, which
 * never matches the query at all - which is why it lasted.
 */

let listeners: (() => void)[] = [];
let sideways = false;

/**
 * A `matchMedia` that can be turned. Replacing the one in `vitest.setup.ts` is
 * safe - it is ours, not jsdom's; jsdom implements none.
 */
function installMatchMedia() {
  listeners = [];
  sideways = false;
  window.matchMedia = ((query: string) =>
    ({
      get matches() {
        return sideways;
      },
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: (_: string, fn: () => void) => listeners.push(fn),
      removeEventListener: (_: string, fn: () => void) => {
        listeners = listeners.filter((l) => l !== fn);
      },
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
}

/** Turn the tablet, and tell everyone watching. */
function turn(to: "sideways" | "upright") {
  act(() => {
    sideways = to === "sideways";
    listeners.forEach((l) => l());
  });
}

const app = () => document.querySelector("div[inert], div:has(> button)");

beforeEach(() => {
  installMatchMedia();
  // The continue-sideways choice is per device and persisted, so it has to be
  // cleared or one test decides the next one.
  window.localStorage.clear();
});

afterEach(() => {
  listeners = [];
});

function Lesson() {
  return (
    <RotateLock>
      <button type="button">Next</button>
    </RotateLock>
  );
}

describe("RotateLock", () => {
  it("leaves the app alone while the tablet is upright", () => {
    render(<Lesson />);

    expect(app()?.hasAttribute("inert")).toBe(false);
  });

  it("makes the app inert when the tablet is turned", () => {
    // The regression: without this the button below is still tabbable and
    // still in the accessibility tree, behind an opaque overlay.
    render(<Lesson />);

    turn("sideways");

    expect(app()?.hasAttribute("inert")).toBe(true);
  });

  it("gives it back when the tablet comes upright again", () => {
    render(<Lesson />);
    turn("sideways");

    turn("upright");

    expect(app()?.hasAttribute("inert")).toBe(false);
  });

  it("moves focus to the prompt, so it is announced at all", () => {
    // `role="status"` on a region whose content never changes - only its CSS
    // `display` - is not reliably announced by anything. Focus is.
    render(<Lesson />);
    screen.getByRole("button", { name: "Next" }).focus();

    turn("sideways");

    expect(document.activeElement).toBe(screen.getByRole("status"));
    expect(document.activeElement).toHaveTextContent(
      "Turn your tablet upright",
    );
  });

  it("puts focus back where the child left it", () => {
    render(<Lesson />);
    const next = screen.getByRole("button", { name: "Next" });
    next.focus();
    turn("sideways");

    turn("upright");

    expect(document.activeElement).toBe(next);
  });

  it("never renders inert on the server", () => {
    // The server cannot know which way a tablet is held. Reading the media
    // query there would throw, and guessing would hydrate into a mismatch - so
    // the server snapshot is always upright and the client settles after
    // mount. Asserted through an actual server render, because that is the
    // only place the server snapshot is ever used.
    sideways = true;

    const markup = renderToStaticMarkup(<Lesson />);

    expect(markup).not.toContain("inert");
  });
});

/*
 * THE WAY THROUGH.
 *
 * "Portrait only, v1" was a layout decision and it became an exclusion: a
 * tablet clamped to a wheelchair tray, mounted on a stand, or with rotation
 * locked by an accessibility setting does not turn. The prompt asked such a
 * child for the one thing they could not do and offered nothing else, so the
 * screen was a wall between them and the lesson rather than a nudge.
 *
 * The app behind it must then be genuinely usable, not merely un-inerted -
 * verified in a 700x300 viewport, where the Welcome illustration alone filled
 * the screen and both buttons sat below the fold.
 */
describe("a tablet that does not turn", () => {
  it("offers a way through, and the app is live again once taken", async () => {
    render(<Lesson />);
    turn("sideways");

    // Held, as before.
    expect(app()?.hasAttribute("inert")).toBe(true);

    const through = screen.getByRole("button", {
      name: /my tablet doesn.t turn/i,
    });
    act(() => through.click());

    // The prompt is gone and the lesson is usable, still sideways.
    expect(screen.queryByRole("button", { name: /my tablet doesn.t turn/i })).toBeNull();
    expect(app()?.hasAttribute("inert")).toBe(false);
    expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
  });

  it("does not ask again on the next lesson", () => {
    render(<Lesson />);
    turn("sideways");
    act(() =>
      screen
        .getByRole("button", { name: /my tablet doesn.t turn/i })
        .click(),
    );

    // A fresh mount, the same device, still sideways. Asking again is the same
    // wall arriving more often, and the child has already answered.
    cleanup();
    render(<Lesson />);
    turn("sideways");

    expect(screen.queryByRole("button", { name: /my tablet doesn.t turn/i })).toBeNull();
    expect(app()?.hasAttribute("inert")).toBe(false);
  });

  it("still holds the app for a child who has not said that", () => {
    // The guard that matters: the escape must not weaken the lock for everyone
    // else. A child who can turn their tablet should still be stopped.
    render(<Lesson />);
    turn("sideways");

    expect(app()?.hasAttribute("inert")).toBe(true);
    expect(
      screen.getByRole("button", { name: /my tablet doesn.t turn/i }),
    ).toBeInTheDocument();
  });
});

/*
 * A SHEET IS NOT INSIDE THE APP. Radix portals a sheet or a dialog into
 * `document.body`, outside the subtree `RotateLock` made inert - so an open
 * one stayed live behind the prompt: its buttons tabbable and pressable, its
 * text read out over "Turn your tablet upright".
 */
describe("what is portalled out of the app", () => {
  function LessonWithSheet() {
    return (
      <RotateLock>
        <button type="button">Next</button>
        {createPortal(
          <div data-testid="sheet">
            <button type="button">Close sheet</button>
          </div>,
          document.body,
        )}
      </RotateLock>
    );
  }
  const sheet = () => screen.getByTestId("sheet");

  it("is held still with the app while the tablet is turned", () => {
    render(<LessonWithSheet />);

    turn("sideways");

    expect(sheet().closest("[inert]")).not.toBeNull();
  });

  it("is given back when the tablet comes upright", () => {
    render(<LessonWithSheet />);
    turn("sideways");

    turn("upright");

    expect(sheet().closest("[inert]")).toBeNull();
  });

  it("is held even when it opens while the prompt is up", async () => {
    // The pause card can arrive at any moment, sideways or not.
    render(<Lesson />);
    turn("sideways");

    const late = document.createElement("div");
    document.body.appendChild(late);
    await act(async () => {
      await Promise.resolve();
    });

    expect(late.hasAttribute("inert")).toBe(true);
    late.remove();
  });

  it("never stills the prompt itself", () => {
    render(<LessonWithSheet />);

    turn("sideways");

    expect(screen.getByRole("status").closest("[inert]")).toBeNull();
  });
});
