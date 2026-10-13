import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const { push, ssoCallback } = vi.hoisted(() => ({ push: vi.fn(), ssoCallback: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: push, prefetch: vi.fn() }),
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
