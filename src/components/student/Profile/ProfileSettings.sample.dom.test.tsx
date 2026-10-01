import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ProfileSettings } from "./ProfileSettings";
import { AccessibilityProvider } from "@/context/AccessibilityContext";
import { clearSession, setSession } from "@/lib/auth/session";
import { SAMPLE_ATTR } from "@/lib/sampleData";

/**
 * Signed out, Profile names the fixture child - "Ada", "AK" - and that row
 * carried no sample mark. The shell's own copy of the same identity was marked
 * (`student:identity`); this one was invisible to the end-to-end assertion
 * that no sample region survives signing in.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {} }),
}));
vi.mock("@/hooks", () => ({ useAuth: () => ({ signOut: () => {} }) }));
// `users/me` answers only for a session, as the real hook does.
const me = vi.hoisted(() => ({
  user: null as null | { name: string; initials: string },
}));
vi.mock("@/hooks/useCurrentUser", () => ({ useCurrentUser: () => me.user }));
vi.mock("@/lib/api/settings", () => ({
  settingsApi: {
    get: vi.fn().mockResolvedValue({ settings: {} }),
    update: vi.fn().mockResolvedValue({}),
  },
}));

const renderProfile = () =>
  render(
    <AccessibilityProvider>
      <ProfileSettings />
    </AccessibilityProvider>,
  );

const marks = () =>
  Array.from(document.querySelectorAll(`[${SAMPLE_ATTR}]`)).map((el) =>
    el.getAttribute(SAMPLE_ATTR),
  );

describe("Profile's name row", () => {
  it("is marked while it shows the fixture child", async () => {
    clearSession();
    me.user = null;

    renderProfile();

    await waitFor(() => expect(marks()).toContain("student:identity"));
    const region = document.querySelector(`[${SAMPLE_ATTR}]`);
    expect(region?.textContent).toMatch(/Ada/);
  });

  it("is unmarked for a signed-in child's own name", async () => {
    setSession({
      token: "tok-profile",
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      userId: "student-profile",
      role: "student",
    });
    me.user = { name: "Tobi Bello", initials: "TB" };

    renderProfile();

    await waitFor(() => expect(screen.getByText("Tobi")).toBeInTheDocument());
    expect(marks()).toEqual([]);
    clearSession();
  });
});
