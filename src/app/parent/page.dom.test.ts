import { describe, expect, it, vi } from "vitest";

/**
 * Backlog 61: the written-consent notice's "Open in Nevo" goes to `/parent`,
 * which 404'd. Pinned at the route, because the address is the backend's
 * (`navigates_to="/parent"`) and nothing else here would notice it break.
 */

const redirect = vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT ${path}`);
});

vi.mock("next/navigation", () => ({
  redirect: (p: string) => redirect(p),
}));

const { default: Page } = await import("./page");

describe("/parent", () => {
  it("forwards to the parent's home", () => {
    expect(() => Page()).toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/parent-portal");
  });
});
