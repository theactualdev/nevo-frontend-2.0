import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import LoginPage from "./page";
import { clearSession } from "@/lib/auth/session";

/**
 * A LAPTOP COULD NOT TYPE ITS PIN.
 *
 * The four boxes are not an input - they are drawn from `digits`, and the thing
 * that receives typing is an off-screen field. Nothing ever focused it, so on
 * any device with a real keyboard the screen looked ready and swallowed every
 * keystroke until the child happened to click the page. There is no cue to do
 * that, because on a tablet you tap the pad and never need one.
 *
 * It had been that way since the screen shipped. The picker made it look like a
 * new fault rather than an old one: choosing a face IS a click, so it feels as
 * though the page should now be listening, and that click is consumed by the
 * tile instead.
 *
 * `preventScroll` matters as much as the focus: the field sits at -9999px, and
 * focusing it without that scrolls the whole page sideways to reveal it.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/hooks", () => ({ useAuth: () => ({ signIn: vi.fn() }) }));
vi.mock("@/lib/api", () => ({ authApi: { loginPin: vi.fn() } }));

// Two children, so the door is the shared tablet's picker (28c); one would
// open straight on 00's PIN.
const roster = vi.hoisted(() => ({
  entries: [
    { id: "a", name: "Ada", shapeIndex: 0 },
    { id: "k", name: "Kofi", shapeIndex: 1 },
  ],
}));
vi.mock("@/lib/auth/deviceRoster", () => ({
  // `ChildAvatar` imports this from the same module, so a partial mock blanks
  // the tile and takes the render down with it.
  SHAPE_COUNT: 6,
  pickerEntries: () => roster.entries,
  childById: (id: string) =>
    roster.entries.find((e) => e.id === id)
      ? {
          id,
          schoolCode: "NEVO-1",
          loginIdentifier: "ada.o",
          displayName: "Ada",
          initials: "AO",
          shapeIndex: 0,
          lastUsedAt: new Date().toISOString(),
        }
      : null,
  rememberChild: vi.fn(),
}));

const pinField = () =>
  document.querySelector('input[aria-label="PIN"]') as HTMLInputElement | null;

beforeEach(() => {
  clearSession();
});

afterEach(() => {
  cleanup();
});

describe("typing a PIN on a device with a real keyboard", () => {
  it("puts the caret where the keystrokes will land, with no click first", async () => {
    render(<LoginPage />);

    // Choose a child, exactly as a click on their tile does.
    const tile = await screen.findByRole("button", { name: "Ada" });
    tile.click();

    await waitFor(() => expect(pinField()).not.toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(pinField()));
  });

  it("focuses without dragging the page sideways to the hidden field", async () => {
    /*
     * The field is at -9999px. A plain `focus()` scrolls the viewport to reveal
     * it, which on this screen means the whole layout slides off to the left -
     * a worse bug than the one being fixed.
     */
    const focus = vi.fn();
    const proto = window.HTMLInputElement.prototype;
    const original = proto.focus;
    proto.focus = focus as typeof proto.focus;

    render(<LoginPage />);
    const tile = await screen.findByRole("button", { name: "Ada" });
    tile.click();

    await waitFor(() => expect(focus).toHaveBeenCalled());
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });

    proto.focus = original;
  });

  it("keeps the field ready again after Not you? sends them back", async () => {
    // The pick can be made twice, and the second time has to work too.
    render(<LoginPage />);
    (await screen.findByRole("button", { name: "Ada" })).click();
    await waitFor(() => expect(document.activeElement).toBe(pinField()));

    (await screen.findByRole("button", { name: /Not you/ })).click();
    (await screen.findByRole("button", { name: "Ada" })).click();

    await waitFor(() => expect(document.activeElement).toBe(pinField()));
  });
});
