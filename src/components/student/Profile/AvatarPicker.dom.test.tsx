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
import { useAvatarTone } from "@/components/student/Shell/useAvatarTone";
import { AccessibilityProvider } from "@/context/AccessibilityContext";
import { clearSession, setSession } from "@/lib/auth/session";
import { AVATAR_TONES, avatarTone } from "@/lib/profile/avatarTone";

/**
 * "Choose your look" (frame 27).
 *
 * What these pin is not that eight circles render. It is where the choice
 * LIVES: against the child's account, never the device - a classroom tablet
 * is shared, and a device copy would hand one child's look to the next - and
 * that the screen only says "Saved" about a write that happened.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));
const router = vi.hoisted(() => ({ push: () => {}, replace: () => {} }));
vi.mock("@/hooks", () => ({ useAuth: () => ({ signOut: () => {} }) }));
vi.mock("@/hooks/useCurrentUser", () => ({ useCurrentUser: () => null }));

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

/** A second disc, standing in for the shell's corner one. */
function OtherDisc() {
  const { tone } = useAvatarTone();
  return <span data-testid="other-disc" data-tone={tone.id} />;
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

beforeEach(() => {
  clearSession();
  signInFresh();
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

describe("the looks on offer", () => {
  it("are the frame's eight, and anything unrecognised is no choice at all", () => {
    expect(AVATAR_TONES.map((t) => t.background)).toEqual([
      "#3b3f6e",
      "#9a9ccb",
      "#ede8dc",
      "#2b2b2f",
      "rgba(59,63,110,0.5)",
      "rgba(154,156,203,0.55)",
      "#c9c3b3",
      "rgba(43,43,47,0.55)",
    ]);
    expect(avatarTone("tartan").id).toBe("navy");
    expect(avatarTone(undefined).id).toBe("navy");
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
    expect(pressed).toEqual(["Navy"]);
  });

  it("stores the choice against the account and says Saved once it has", async () => {
    renderProfile();
    openPicker();
    await act(async () => {
      fireEvent.click(swatch("Lavender"));
    });

    expect(updateMe).toHaveBeenCalledWith({ avatarTone: "lavender" });
    // Not the deprecated bag: the profile has a field for this now.
    expect(update).not.toHaveBeenCalled();
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveClass("opacity-100"),
    );
  });

  it("moves every disc on screen at once, not just the one tapped", async () => {
    // The shell's corner disc and this screen's are visible together.
    renderProfile();
    openPicker();
    await act(async () => {
      fireEvent.click(swatch("Stone"));
    });

    expect(screen.getByTestId("other-disc")).toHaveAttribute(
      "data-tone",
      "stone",
    );
  });

  it("puts the old look back, and claims nothing, when the account refused it", async () => {
    updateMe.mockRejectedValue(new Error("offline"));
    renderProfile();
    openPicker();
    await act(async () => {
      fireEvent.click(swatch("Ink"));
    });

    await waitFor(() =>
      expect(screen.getByTestId("other-disc")).toHaveAttribute(
        "data-tone",
        "navy",
      ),
    );
    expect(screen.getByRole("status")).toHaveClass("opacity-0");
  });

  it("stores nothing on the device", async () => {
    renderProfile();
    openPicker();
    await act(async () => {
      fireEvent.click(swatch("Lavender"));
    });

    const everything = JSON.stringify({ ...window.localStorage });
    expect(everything).not.toContain("lavender");
  });
});

describe("a look chosen earlier", () => {
  it("comes back from the account on a device that has never seen the child", async () => {
    me.mockResolvedValue({ userId: "u", avatarTone: "soft-ink" });
    renderProfile();

    await waitFor(() =>
      expect(screen.getByTestId("other-disc")).toHaveAttribute(
        "data-tone",
        "soft-ink",
      ),
    );
  });

  it("is not shown to the next child on a shared tablet", async () => {
    me.mockResolvedValue({ userId: "u", avatarTone: "stone" });
    const first = renderProfile();
    await waitFor(() =>
      expect(screen.getByTestId("other-disc")).toHaveAttribute(
        "data-tone",
        "stone",
      ),
    );
    first.unmount();

    // A different child signs in; their account has chosen nothing.
    me.mockReset();
    me.mockReturnValue(new Promise(() => {}));
    signInFresh();
    renderProfile();

    expect(screen.getByTestId("other-disc")).toHaveAttribute(
      "data-tone",
      "navy",
    );
  });

  it("falls back to navy when the stored value is not one of the eight", async () => {
    me.mockResolvedValue({ userId: "u", avatarTone: 42 });
    renderProfile();
    await act(async () => {});

    expect(screen.getByTestId("other-disc")).toHaveAttribute(
      "data-tone",
      "navy",
    );
  });
});
