import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const { push, ssoCallback } = vi.hoisted(() => ({ push: vi.fn(), ssoCallback: vi.fn() }));
// ONE router for the whole file, as Next's own is: `useRouter()` reads a
// context value, the same object every render. A new object per render
// re-ran every effect that lists `router` - a second SSO handshake whose
// redirect timer outlived the test and fired into the next one.
const router = vi.hoisted(() => ({ push, replace: push, prefetch: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("@/hooks", () => ({
  useAuth: () => ({ signIn: vi.fn(), signOut: vi.fn(), status: "guest", user: null }),
}));
vi.mock("@/lib/api", () => ({ authApi: { ssoCallback } }));
vi.mock("@/lib/auth/session", () => ({ setSession: vi.fn() }));

import { TeacherSsoCallback } from "./TeacherSsoCallback";

/**
 * "Try again" re-ran a callback that either does nothing - with no code, the
 * only state reachable today - or would re-send a spent single-use code.
 * Trying again means starting the sign-in again, from the door.
 */
describe("trying school sign-in again", () => {
  it("goes back to the door rather than re-sending the callback", async () => {
    render(<TeacherSsoCallback />);

    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));

    expect(push).toHaveBeenCalledWith("/auth/teacher");
    expect(ssoCallback).not.toHaveBeenCalled();
  });
});
