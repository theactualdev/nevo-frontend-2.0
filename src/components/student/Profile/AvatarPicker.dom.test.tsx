import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { ProfileSettings } from "./ProfileSettings";
import { useAvatarLook } from "@/components/student/Shell/useAvatarLook";
import { AccessibilityProvider } from "@/context/AccessibilityContext";
import { clearSession, setSession } from "@/lib/auth/session";
import { AVATAR_LOOKS, avatarLook } from "@/lib/profile/avatarLook";

/**
 * "Choose your look" (frame 27).
 *
 * What these pin is not that eight shapes render. It is that a child's look is
 * a SHAPE, never their initials (Lydia, 4 Nov: "Initials put a child's name on
 * a screen anyone nearby can read"), stored as "<shape>-<colourway>"; where
 * the choice LIVES: against the child's account, never the device - a
 * classroom tablet is shared, and a device copy would hand one child's look to
 * the next; and that the screen only says "Saved" about a write that happened.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));
const router = vi.hoisted(() => ({ push: () => {}, replace: () => {} }));
vi.mock("@/hooks", () => ({ useAuth: () => ({ signOut: () => {} }) }));
vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => currentUser.value,
}));
const currentUser = vi.hoisted(() => ({
  value: null as null | { name: string; initials: string },
}));

/*
 * The LOOK lives on `users/me`'s own `avatarTone` field. The settings bag is
 * still mocked because the chosen NAME travels there, and a test that let the
 * look fall back into it would pass while writing to the wrong place.
 */
const { get, update } = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/api/settings", () => ({
  settingsApi: { get, update },
  // The account's accessibility preferences (SCRUM-226): none held.
  personalSettingsApi: {
    get: vi.fn().mockResolvedValue({ userId: "u", preferences: {} }),
    update: vi.fn().mockResolvedValue({ userId: "u", preferences: {} }),
  },
}));
const { me, updateMe } = vi.hoisted(() => ({
  me: vi.fn(),
  updateMe: vi.fn(),
}));
vi.mock("@/lib/api/users", () => ({ usersApi: { me, updateMe } }));

/**
 * The store is keyed by session, so each test signs in as somebody new - which
 * is also the property under test in the shared-tablet case below.
 */
let n = 0;
const signInFresh = () => {
  n += 1;
  setSession({
    token: `tok-look-${n}`,
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userId: `student-${n}`,
    role: "student",
  });
};

/** A second avatar, standing in for the shell's corner one. */
function OtherDisc() {
  const { look } = useAvatarLook();
  return <span data-testid="other-disc" data-look={look.id} />;
}

const renderProfile = () =>
  render(
    <AccessibilityProvider>
      <ProfileSettings />
      <OtherDisc />
    </AccessibilityProvider>,
  );

const disc = () => screen.getByRole("button", { name: "Choose your look" });
const openPicker = () => fireEvent.click(disc());
const swatch = (label: string) =>
  within(screen.getByRole("dialog")).getByRole("button", { name: label });
const shapeIn = (el: Element) =>
  el.querySelector("[data-avatar-shape]")?.getAttribute("data-avatar-shape");

beforeEach(() => {
  clearSession();
  signInFresh();
  currentUser.value = null;
  get.mockReset();
  update.mockReset();
  me.mockReset();
  updateMe.mockReset();
  get.mockResolvedValue({ settings: {} });
  update.mockResolvedValue({ settings: {} });
  me.mockResolvedValue({ userId: "u", avatarTone: null });
  updateMe.mockResolvedValue({ userId: "u", avatarTone: null });
});

afterEach(() => {
  cleanup();
  clearSession();
});

describe("the looks on offer (928cf30; SCRUM-322, 324)", () => {
  it("are frame 27's eighteen - six shapes in each tone, the star among them - in its order and words", () => {
    const shapes = ["circle", "square", "star", "diamond", "triangle", "hexagon"];
    const words = ["circle", "rounded square", "star", "diamond", "triangle", "hexagon"];
    const tones = [
      ["navy", "Navy"],
      ["near_black", "Dark"],
      ["cream_elevated", "Cream"],
    ];
    expect(AVATAR_LOOKS.map((l) => [l.id, l.label])).toEqual(
      tones.flatMap(([key, word]) =>
        shapes.map((shape, i) => [`${shape}-${key}`, `${word} ${words[i]}`]),
      ),
    );
  });

  it("keeps the server's keys, so one set of keys runs end to end", () => {
    expect(avatarLook("star-near_black")).toMatchObject({
      shape: "star",
      colourway: "near_black",
      label: "Dark star",
    });
    expect(avatarLook("square-cream_elevated").label).toBe("Cream rounded square");
  });

  it("reads an old id, the retired pill or a design name as the navy circle", () => {
    // Ids from before, which an account may hold. No migration.
    for (const old of ["navy", "lavender", "cream", "ink", "soft-ink", "stone"]) {
      expect(avatarLook(old).id).toBe("circle-navy");
    }
    // The pill is gone (928cf30), and the design's names are not keys.
    for (const gone of ["pill-cream", "pill-navy", "roundsquare-navy", "circle-dark", "hexagon-cream"]) {
      expect(avatarLook(gone).id).toBe("circle-navy");
    }
    for (const junk of [undefined, null, 42, "", "-navy", "circle-", "circle-gold"]) {
      expect(avatarLook(junk).id).toBe("circle-navy");
    }
  });
});

describe("a child's avatar on Profile", () => {
  it("is a shape, never their initials", async () => {
    currentUser.value = { name: "Tobi Bello", initials: "TB" };
    renderProfile();
    await waitFor(() => expect(screen.getByText("Tobi")).toBeInTheDocument());

    expect(disc().textContent).toBe("");
    expect(shapeIn(disc())).toBe("circle");
    expect(screen.queryByText("TB")).toBeNull();
  });

  it("draws the look the account holds", async () => {
    me.mockResolvedValue({ userId: "u", avatarTone: "star-near_black" });
    renderProfile();

    await waitFor(() => expect(shapeIn(disc())).toBe("star"));
    expect(disc().querySelector("[data-avatar-look]")).toHaveAttribute(
      "data-avatar-look",
      "star-near_black",
    );
  });
});

describe("Choose your look", () => {
  it("opens from the disc, with the child's current look marked", async () => {
    renderProfile();
    openPicker();

    expect(await screen.findByText("Choose your look")).toBeInTheDocument();
    const pressed = within(screen.getByRole("dialog"))
      .getAllByRole("button", { pressed: true })
      .map((b) => b.getAttribute("aria-label"));
    expect(pressed).toEqual(["Navy circle"]);
  });

  it("offers the eighteen and no initials, each drawn as it says", async () => {
    currentUser.value = { name: "Tobi Bello", initials: "TB" };
    renderProfile();
    openPicker();

    const tiles = AVATAR_LOOKS.map((l) => swatch(l.label));
    expect(tiles).toHaveLength(18);
    expect(tiles.map((t) => shapeIn(t))).toEqual(
      AVATAR_LOOKS.map((l) => l.shape),
    );
    expect(tiles.map((t) => shapeIn(t)).slice(0, 6)).toEqual([
      "circle",
      "square",
      "star",
      "diamond",
      "triangle",
      "hexagon",
    ]);
    for (const tile of tiles) expect(tile.textContent).toBe("");
    expect(within(screen.getByRole("dialog")).queryByText("TB")).toBeNull();
  });

  it("stores the choice against the account as shape-colourway, and says Saved once it has", async () => {
    renderProfile();
    openPicker();
    await act(async () => {
      fireEvent.click(swatch("Cream star"));
    });

    expect(updateMe).toHaveBeenCalledWith({ avatarTone: "star-cream_elevated" });
    // Not the deprecated bag: the profile has a field for this now.
    expect(update).not.toHaveBeenCalled();
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveClass("opacity-100"),
    );
    expect(shapeIn(disc())).toBe("star");
  });

  it("moves every avatar on screen at once, not just the one tapped", async () => {
    // The shell's corner avatar and this screen's are visible together.
    renderProfile();
    openPicker();
    await act(async () => {
      fireEvent.click(swatch("Dark triangle"));
    });

    expect(screen.getByTestId("other-disc")).toHaveAttribute(
      "data-look",
      "triangle-near_black",
    );
  });

  it("puts the old look back, and claims nothing, when the account refused it", async () => {
    updateMe.mockRejectedValue(new Error("offline"));
    renderProfile();
    openPicker();
    await act(async () => {
      fireEvent.click(swatch("Navy diamond"));
    });

    await waitFor(() =>
      expect(screen.getByTestId("other-disc")).toHaveAttribute(
        "data-look",
        "circle-navy",
      ),
    );
    expect(screen.getByRole("status")).toHaveClass("opacity-0");
  });

  it("stores nothing on the device", async () => {
    renderProfile();
    openPicker();
    await act(async () => {
      fireEvent.click(swatch("Cream star"));
    });

    const everything = JSON.stringify({ ...window.localStorage });
    expect(everything).not.toContain("star-cream_elevated");
  });
});

describe("a look chosen earlier", () => {
  it("comes back from the account on a device that has never seen the child", async () => {
    me.mockResolvedValue({ userId: "u", avatarTone: "hexagon-cream_elevated" });
    renderProfile();

    await waitFor(() =>
      expect(screen.getByTestId("other-disc")).toHaveAttribute(
        "data-look",
        "hexagon-cream_elevated",
      ),
    );
  });

  it("is not shown to the next child on a shared tablet", async () => {
    me.mockResolvedValue({ userId: "u", avatarTone: "square-navy" });
    const first = renderProfile();
    await waitFor(() =>
      expect(screen.getByTestId("other-disc")).toHaveAttribute(
        "data-look",
        "square-navy",
      ),
    );
    first.unmount();

    // A different child signs in; their account has chosen nothing.
    me.mockReset();
    me.mockReturnValue(new Promise(() => {}));
    signInFresh();
    renderProfile();

    expect(screen.getByTestId("other-disc")).toHaveAttribute(
      "data-look",
      "circle-navy",
    );
  });

  it("from before shapes reads as the navy circle, and is not rewritten", async () => {
    // No migration: the old id stays on the account until the child chooses.
    me.mockResolvedValue({ userId: "u", avatarTone: "lavender" });
    renderProfile();
    await waitFor(() => expect(me).toHaveBeenCalled());
    await act(async () => {});

    expect(screen.getByTestId("other-disc")).toHaveAttribute(
      "data-look",
      "circle-navy",
    );
    expect(updateMe).not.toHaveBeenCalled();
  });

  it("falls back to the navy circle when the stored value is not a string", async () => {
    me.mockResolvedValue({ userId: "u", avatarTone: 42 });
    renderProfile();
    await act(async () => {});

    expect(screen.getByTestId("other-disc")).toHaveAttribute(
      "data-look",
      "circle-navy",
    );
  });
});
