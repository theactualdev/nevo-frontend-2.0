import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ProfileSettings } from "./ProfileSettings";
import { AccessibilityProvider } from "@/context/AccessibilityContext";
import {
  clearSession,
  getStoredDisplayName,
  setSession,
  setStoredDisplayName,
} from "@/lib/auth/session";

/**
 * The name a child chose (B35), and the PIN rows an SSO child does not have
 * (D9).
 *
 * The name used to be written to the device, then fired best-effort at the
 * deprecated `/api/settings/me` bag, with "Saved" shown in the same breath - so
 * a refused write still said Saved, and a name changed on one tablet never
 * reached another. It now goes to `PATCH /api/v1/users/me` as
 * `preferredName`, is read back from `users/me`, and the device copy is only
 * the fallback.
 */

vi.setConfig({ testTimeout: 30_000 });

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {} }),
}));
const auth = vi.hoisted(() => ({
  user: null as null | { method?: "sso" | "manual" },
}));
vi.mock("@/hooks", () => ({
  useAuth: () => ({ signOut: () => {}, user: auth.user }),
}));
const { me, updateMe } = vi.hoisted(() => ({
  me: vi.fn(),
  updateMe: vi.fn(),
}));
vi.mock("@/lib/api/users", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/users")>();
  return { ...actual, usersApi: { ...actual.usersApi, me, updateMe } };
});
const { settingsUpdate } = vi.hoisted(() => ({ settingsUpdate: vi.fn() }));
vi.mock("@/lib/api/settings", () => ({
  settingsApi: { get: vi.fn().mockResolvedValue({ settings: {} }), update: settingsUpdate },
}));

/** `users/me` caches per account, so each test is a different child. */
let n = 0;
let userId = "";
const signInFresh = () => {
  n += 1;
  userId = `name-child-${n}`;
  setSession({
    token: `tok-name-${n}`,
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userId,
    role: "student",
  });
};

const account = (preferredName: string | null) => ({
  userId,
  role: "student",
  firstName: "Tobi",
  lastName: "Bello",
  displayName: preferredName ?? "Tobi Bello",
  preferredName,
  email: null,
  school: null,
});

const renderProfile = () =>
  render(
    <AccessibilityProvider>
      <ProfileSettings />
    </AccessibilityProvider>,
  );

/** The quiet pill: always in the page, shown by opacity. */
const savedShown = () =>
  screen.getByText("Saved").closest('[role="status"]')?.className.includes(
    "opacity-100",
  ) ?? false;

async function rename(to: string) {
  fireEvent.click(screen.getByRole("button", { name: "Change" }));
  const field = screen.getByRole("textbox", { name: "Your name" });
  fireEvent.change(field, { target: { value: to } });
  await act(async () => {
    fireEvent.blur(field);
  });
}

beforeEach(() => {
  me.mockReset();
  updateMe.mockReset();
  settingsUpdate.mockReset();
  auth.user = null;
  window.localStorage.clear();
  clearSession();
  signInFresh();
});

afterEach(() => {
  cleanup();
  clearSession();
  window.localStorage.clear();
});

describe("the name a child chose, on read", () => {
  it("comes from their account, over what this tablet last saw", async () => {
    setStoredDisplayName("Old", "O");
    me.mockResolvedValue(account("Tee"));

    renderProfile();

    expect(await screen.findByText("Tee")).toBeInTheDocument();
    expect(screen.queryByText("Old")).toBeNull();
    // And the tablet's copy follows, so the picker learns it too.
    await waitFor(() => expect(getStoredDisplayName()).toBe("Tee"));
  });

  it("falls back to this tablet's copy when the account cannot answer", async () => {
    setStoredDisplayName("Old", "O");
    me.mockRejectedValue(new Error("offline"));

    renderProfile();

    expect(await screen.findByText("Old")).toBeInTheDocument();
  });

  it("is the school's first name when the child has chosen none", async () => {
    me.mockResolvedValue(account(null));

    renderProfile();

    expect(await screen.findByText("Tobi")).toBeInTheDocument();
  });
});

describe("saving the name a child chose", () => {
  it("goes to their account as preferredName, never the deprecated bag", async () => {
    me.mockResolvedValue(account(null));
    updateMe.mockResolvedValue(account("Zee"));
    renderProfile();
    await screen.findByText("Tobi");

    await rename("Zee");

    expect(updateMe).toHaveBeenCalledWith({ preferredName: "Zee" });
    expect(settingsUpdate).not.toHaveBeenCalled();
  });

  it("says Saved only once the account holds it", async () => {
    me.mockResolvedValue(account(null));
    let land: (v: unknown) => void = () => {};
    updateMe.mockReturnValue(new Promise((r) => (land = r)));
    renderProfile();
    await screen.findByText("Tobi");

    await rename("Zee");
    expect(savedShown()).toBe(false);
    // Nor does this tablet keep it before the account has it.
    expect(getStoredDisplayName()).not.toBe("Zee");

    await act(async () => land(account("Zee")));
    expect(savedShown()).toBe(true);
    expect(getStoredDisplayName()).toBe("Zee");
  });

  it("puts the name back, and says nothing was saved, when the account refuses it", async () => {
    me.mockResolvedValue(account(null));
    updateMe.mockRejectedValue(new Error("422"));
    renderProfile();
    await screen.findByText("Tobi");

    await rename("Zee");

    expect(await screen.findByText("Tobi")).toBeInTheDocument();
    expect(screen.queryByText("Zee")).toBeNull();
    expect(savedShown()).toBe(false);
    expect(getStoredDisplayName()).not.toBe("Zee");
  });

  it("does not take more than the account can hold", async () => {
    me.mockResolvedValue(account(null));
    renderProfile();
    await screen.findByText("Tobi");

    fireEvent.click(screen.getByRole("button", { name: "Change" }));

    expect(
      screen.getByRole("textbox", { name: "Your name" }),
    ).toHaveAttribute("maxLength", "60");
  });
});

describe("an SSO child's account rows (D9)", () => {
  it("has no Change PIN, because there is no PIN", async () => {
    auth.user = { method: "sso" };
    me.mockResolvedValue(account(null));
    renderProfile();
    await screen.findByText("Tobi");

    expect(screen.queryByRole("button", { name: "Change PIN" })).toBeNull();
  });

  it("is not promised a PIN on the way out", async () => {
    auth.user = { method: "sso" };
    me.mockResolvedValue(account(null));
    renderProfile();
    await screen.findByText("Tobi");

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(
      await screen.findByText("You can come back anytime."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/PIN/)).toBeNull();
    // D136 (8 Oct): signing out confirms no write, so it claims none.
    expect(screen.queryByText(/progress is saved/i)).toBeNull();
  });

  it("keeps both for a child who signs in with a PIN", async () => {
    auth.user = { method: "manual" };
    me.mockResolvedValue(account(null));
    renderProfile();
    await screen.findByText("Tobi");

    expect(screen.getByRole("button", { name: "Change PIN" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(
      await screen.findByText("You can come back anytime with your PIN."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/progress is saved/i)).toBeNull();
  });
});
