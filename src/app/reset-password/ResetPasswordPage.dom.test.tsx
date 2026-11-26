import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { push, params, completePasswordReset, requestPasswordReset } = vi.hoisted(() => ({
  push: vi.fn(),
  params: { value: new URLSearchParams() },
  completePasswordReset: vi.fn(),
  requestPasswordReset: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: push, prefetch: vi.fn() }),
  useSearchParams: () => params.value,
}));
vi.mock("@/lib/api", () => ({
  authApi: { completePasswordReset, requestPasswordReset },
}));

import { ApiError } from "@/lib/api/client";
import { clearSession } from "@/lib/auth/session";

/**
 * `/reset-password?token=…` - the path the backend's reset email links to for
 * EVERY account (Teslim's /me spec, section 15). It answered 404 on
 * nevolearning.com (Hub, 25 Nov), so each test here imports the route itself:
 * on a tree without the page, every one of them fails to find it.
 */

const TOKEN = "rst_9f2c4a71e0b84d6c93a5f1e27b0c8d4e6a1f";
const HOLD_MS = 2500; // past the form's 1.6s success beat

const page = async () => (await import("@/app/reset-password/page")).default;

const fillAndSubmit = () => {
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "lessons42" } });
  fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "lessons42" } });
  fireEvent.click(screen.getByRole("button", { name: "Save new password" }));
};

const pushedTo = async () => {
  await waitFor(() => expect(push).toHaveBeenCalled(), { timeout: HOLD_MS });
  return push.mock.calls[0][0] as string;
};

beforeEach(() => {
  push.mockReset();
  completePasswordReset.mockReset().mockResolvedValue({ status: "password_updated" });
  requestPasswordReset.mockReset().mockResolvedValue({});
  params.value = new URLSearchParams(`token=${TOKEN}`);
  clearSession();
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  clearSession();
});

describe("the link the reset email sends", () => {
  it("is a page, not a 404", async () => {
    const Page = await page();
    render(<Page />);

    expect(screen.getByText("Choose a new password")).toBeInTheDocument();
  });

  it("sets the new password with the link's token, and says so", async () => {
    const Page = await page();
    render(<Page />);
    fillAndSubmit();

    await waitFor(() =>
      expect(completePasswordReset).toHaveBeenCalledWith({ token: TOKEN, password: "lessons42" }),
    );
    expect(await screen.findByText("Password updated")).toBeInTheDocument();
  });

  it("sends them to the landing page's doors, guessing no role", async () => {
    // The answer is {"status": "password_updated"} and nothing else: no role.
    const Page = await page();
    render(<Page />);
    fillAndSubmit();

    expect(await pushedTo()).toBe("/");
  });
});

describe("a used or expired link", () => {
  it("is told the link has expired, on this path", async () => {
    // The backend's 400 for either, with a plain-string detail and no code.
    completePasswordReset.mockRejectedValue(
      new ApiError(400, "Bad Request", { detail: "Reset link is invalid or expired" }),
    );
    const Page = await page();
    render(<Page />);
    fillAndSubmit();

    expect(await pushedTo()).toBe("/reset-password?expired=1");
  });

  it("is offered a fresh link there, asked for on this path too", async () => {
    params.value = new URLSearchParams("expired=1");
    const Page = await page();
    render(<Page />);

    expect(screen.getByText("This link has expired")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Send a new link" }));
    expect(push).toHaveBeenCalledWith("/reset-password");
  });

  it("asks for that fresh link without a role, and signs in at the landing page", async () => {
    params.value = new URLSearchParams();
    const Page = await page();
    render(<Page />);

    expect(screen.getByRole("heading", { name: "Reset your password" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to sign in/ })).toHaveAttribute("href", "/");
  });
});

describe("a request that never reached Nevo", () => {
  it("says the password has not changed, and keeps the link", async () => {
    completePasswordReset.mockRejectedValue(new ApiError(0, "Failed to fetch"));
    const Page = await page();
    render(<Page />);
    fillAndSubmit();

    expect(await screen.findByText(/couldn.t reach Nevo just now, so your password hasn.t changed/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save new password" })).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});

describe("the token", () => {
  it("is never logged or stored", async () => {
    const said = vi.fn();
    for (const level of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, level).mockImplementation(said);
    }
    const stored = vi.spyOn(Storage.prototype, "setItem");
    completePasswordReset.mockRejectedValueOnce(new ApiError(0, "Failed to fetch"));
    const Page = await page();
    render(<Page />);
    fillAndSubmit();
    await screen.findByText(/couldn.t reach Nevo just now/);
    fillAndSubmit();
    await screen.findByText("Password updated");

    const everything = JSON.stringify([said.mock.calls, stored.mock.calls]);
    expect(everything).not.toContain(TOKEN);
  });
});
