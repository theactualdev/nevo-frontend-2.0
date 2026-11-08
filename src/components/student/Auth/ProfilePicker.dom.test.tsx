import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ProfilePicker } from "./ProfilePicker";
import type { PickerEntry } from "@/lib/auth/deviceRoster";

/**
 * 28c-1 — "Who's learning?"
 *
 * The screen that replaces the single-identity lock screen. What it is allowed
 * to say is the interesting part: this is a pre-authentication screen in a room
 * full of other people's children, so the frame permits "first names and
 * avatars only, nowhere a username, surname, class, school code or last-used
 * time".
 *
 * That rule is enforced in `deviceRoster` rather than here - a `PickerEntry`
 * structurally cannot carry a credential - so these cover what this component
 * adds on top: that a nameless child is still reachable, that the shape is
 * decorative rather than an identity, and that choosing reports an opaque id.
 */

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const entry = (id: string, shapeIndex: number, name?: string): PickerEntry => ({
  id,
  shapeIndex,
  ...(name ? { name } : {}),
});

const SIX: PickerEntry[] = [
  entry("1", 0, "Ada"),
  entry("2", 1, "Kofi"),
  entry("3", 2, "Zara"),
  entry("4", 3, "Emeka"),
  entry("5", 4, "Lola"),
  entry("6", 5, "Tobi"),
];

const show = (entries: PickerEntry[], onChoose = vi.fn()) => {
  render(
    <ProfilePicker
      entries={entries}
      onChoose={onChoose}
      someoneElseHref="/auth/sign-in"
    />,
  );
  return onChoose;
};

afterEach(() => {
  cleanup();
});

describe("the children this tablet remembers", () => {
  it("offers every one of them by first name", () => {
    show(SIX);

    for (const name of ["Ada", "Kofi", "Zara", "Emeka", "Lola", "Tobi"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("works on a week-one device with only two", () => {
    // 28c-1 partial. No filler tiles, no placeholder children.
    show([entry("1", 0, "Ada"), entry("2", 1, "Kofi")]);

    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("reports the opaque id, never the name, when one is chosen", () => {
    // What the caller gets back has to be the thing it can look a credential
    // up by - and a name is not a key: two children on one classroom tablet
    // can share one.
    const onChoose = show(SIX);
    screen.getByRole("button", { name: "Zara" }).click();

    expect(onChoose).toHaveBeenCalledWith("3");
  });
});

describe("a child whose name we never learned", () => {
  it("is still reachable, by a tile that claims no identity", () => {
    /*
     * 28c-4. A PIN login returns a session rather than a profile, so a child
     * can be remembered before we ever learn their name. The old lock screen
     * papered over this by showing their LOGIN IDENTIFIER as the name, which
     * put half a credential on a screen anyone in the room can read.
     */
    const onChoose = show([entry("1", 0, "Ada"), entry("2", 3)]);

    const nameless = screen.getByRole("button", {
      name: "Choose this account",
    });
    nameless.click();

    expect(onChoose).toHaveBeenCalledWith("2");
  });

  it("invents no name and borrows no shape name", () => {
    // "Triangle" is not who anybody is, and a child who cannot yet read is not
    // helped by a screen reader calling them one.
    show([entry("2", 4)]);

    expect(document.body.textContent).not.toMatch(
      /triangle|diamond|circle|hexagon|unknown|guest/i,
    );
  });
});

describe("the way out for a child this tablet does not know", () => {
  it("offers the full sign-in rather than stranding them", () => {
    // Without it, the only way past other children's faces was to onboard
    // again - a second account, no history, and a class they may not rejoin.
    show(SIX);

    expect(screen.getByRole("link", { name: "Someone else" })).toHaveAttribute(
      "href",
      "/auth/sign-in",
    );
  });
});

describe("what the screen must not show", () => {
  it("shows no shape where a child has a name, only beside it", () => {
    // The frame calls the enlarged first name the primary identifier and the
    // shape a secondary cue, so the shape must not be the accessible name.
    show([entry("1", 0, "Ada")]);

    const tile = screen.getByRole("button", { name: "Ada" });
    expect(tile.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});

/**
 * SCRUM-324 and 28c (928cf30): "a child's avatar is a shape and a tone
 * together, the pair they picked in 27 Profile and Settings, and it belongs to
 * the child rather than to the tile they happen to sit in". Drawn by the one
 * `StudentAvatar`.
 */
describe("each tile's avatar", () => {
  const lookOf = (name: string) =>
    screen
      .getByRole("button", { name })
      .querySelector("[data-avatar-look]")
      ?.getAttribute("data-avatar-look");

  it("is the child's own look, wherever they sit in the list", () => {
    show([
      { ...entry("1", 0, "Ada"), look: "star-near_black" },
      { ...entry("2", 1, "Kofi"), look: "hexagon-cream_elevated" },
    ]);

    expect(lookOf("Ada")).toBe("star-near_black");
    expect(lookOf("Kofi")).toBe("hexagon-cream_elevated");
  });

  it("is the nothing-chosen navy circle for a child this tablet has not learnt a look for - never the tile's slot", () => {
    // Slot 5 was a hexagon before; the slot no longer decides anything.
    show([entry("6", 5, "Tobi")]);

    expect(lookOf("Tobi")).toBe("circle-navy");
  });
});
