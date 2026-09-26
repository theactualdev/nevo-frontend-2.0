import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The route itself, not just the helper: a parent tapping an email from before
 * 21 Sep must land on `/parent/<token>`. Pinned end to end because the page is
 * the part that reads the query, and reading the wrong key is the bug.
 */

const redirect = vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT ${path}`);
});
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("next/navigation", () => ({
  redirect: (p: string) => redirect(p),
  notFound: () => notFound(),
}));

const { default: Page } = await import("./page");

const visit = (query: Record<string, string | string[]>) =>
  Page({ searchParams: Promise.resolve(query) });

beforeEach(() => vi.clearAllMocks());

describe("/consent/parent", () => {
  it("forwards an old consent email to the parent page", async () => {
    await expect(visit({ token: "abc123" })).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/parent/abc123");
  });

  it("shows not-found for a link with no token", async () => {
    await expect(visit({})).rejects.toThrow("NEXT_NOT_FOUND");
    expect(redirect).not.toHaveBeenCalled();
  });
});
