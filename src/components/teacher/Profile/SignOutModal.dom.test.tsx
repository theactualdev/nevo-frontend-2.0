import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock("@/hooks", () => ({ useAuth: () => ({ signOut }) }));

import { SignOutModal } from "./SignOutModal";

/**
 * T245. The sign-out sheet every console page can open, and no test read.
 *
 * It signs out through the auth context - which revokes server-side, clears
 * the session AND purges the on-device signal store (SCRUM-76) - and then
 * leaves by a hard navigation. jsdom will not let that navigation be watched,
 * so this holds the half it can: the one sign-out, and a sheet that cannot be
 * dismissed out from under it once it has started.
 */

beforeEach(() => {
  signOut.mockReset();
});

const sheet = () => screen.getByRole("dialog", { name: "Sign out of Nevo?" });

describe("signing out", () => {
  it("signs out through the auth context, once", () => {
    render(<SignOutModal onStay={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    fireEvent.click(screen.getByRole("button", { name: /Sign/ }));

    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("cannot be backed out of once it has started", () => {
    const onStay = vi.fn();
    render(<SignOutModal onStay={onStay} />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(sheet().parentElement as HTMLElement);

    expect(onStay).not.toHaveBeenCalled();
  });
});

describe("staying signed in", () => {
  it("is the quiet choice, and signs nobody out", () => {
    const onStay = vi.fn();
    render(<SignOutModal onStay={onStay} />);
    fireEvent.click(screen.getByRole("button", { name: /Stay signed in|Cancel/ }));

    expect(onStay).toHaveBeenCalledTimes(1);
    expect(signOut).not.toHaveBeenCalled();
  });

  it("is what Escape does", () => {
    const onStay = vi.fn();
    render(<SignOutModal onStay={onStay} />);
    fireEvent.keyDown(window, { key: "Escape" });

    expect(onStay).toHaveBeenCalledTimes(1);
  });

  it("is what a click outside the sheet does, and a click inside it is not", () => {
    const onStay = vi.fn();
    render(<SignOutModal onStay={onStay} />);

    fireEvent.click(sheet());
    expect(onStay).not.toHaveBeenCalled();
    fireEvent.click(sheet().parentElement as HTMLElement);
    expect(onStay).toHaveBeenCalledTimes(1);
  });
});
