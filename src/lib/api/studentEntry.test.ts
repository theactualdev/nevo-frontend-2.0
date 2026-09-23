import { beforeEach, describe, expect, it, vi } from "vitest";

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("./client", () => ({ api: { get, post, patch: vi.fn() } }));

import { studentEntryApi } from "./studentEntry";

/**
 * The entry link resolves a child the school already recorded, so the fields
 * that arrive ARE the flow: a name nobody asks for, a class nobody confirms,
 * and where consent stands before the first screen.
 *
 * The property worth pinning is the one this codebase keeps losing - that the
 * response arrives WHOLE. A field the server writes and the client's type omits
 * is invisible in a diff and invisible at runtime, which is how `note`, `modules`
 * and `blocked` were each erased in turn.
 */

beforeEach(() => {
  get.mockReset();
  post.mockReset();
});

const state = (over: Record<string, unknown> = {}) => ({
  firstName: "Amara",
  className: "JSS 1B",
  consentState: "pending",
  age: 11,
  accountReady: false,
  ageCheckPending: false,
  ...over,
});

describe("resolve", () => {
  it("carries every field the entry state declares", async () => {
    get.mockResolvedValue(state());

    const res = await studentEntryApi.resolve("t-1");

    expect(res.firstName).toBe("Amara");
    expect(res.className).toBe("JSS 1B");
    expect(res.consentState).toBe("pending");
    expect(res.age).toBe(11);
    expect(res.accountReady).toBe(false);
    expect(res.ageCheckPending).toBe(false);
  });

  it("asks once, and asks the token's own path", async () => {
    // The single-resolve property. 00d replaced a gate that polled, so a
    // second call per resolve is not an optimisation question here.
    get.mockResolvedValue(state());

    await studentEntryApi.resolve("t-1");

    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith("/api/v1/student-entry/t-1");
  });

  it("escapes a token rather than pasting it into the path", async () => {
    // It arrives from a URL a child was sent. Nothing guarantees its shape.
    get.mockResolvedValue(state());

    await studentEntryApi.resolve("a b/c?d");

    expect(get).toHaveBeenCalledWith("/api/v1/student-entry/a%20b%2Fc%3Fd");
  });

  it("keeps a null class and a null age as null, not as absent", async () => {
    // A child with no class recorded is a real state, and it is not the same
    // as a field we failed to read.
    get.mockResolvedValue(state({ className: null, age: null }));

    const res = await studentEntryApi.resolve("t-1");

    expect(res.className).toBeNull();
    expect(res.age).toBeNull();
  });
});

describe("setPin", () => {
  it("returns the session whole, so the child is not left holding nothing", async () => {
    post.mockResolvedValue({
      userId: "u-1",
      loginIdentifier: "amara.k",
      session: {
        accessToken: "tok",
        tokenType: "bearer",
        expiresAt: "2026-09-24T10:00:00Z",
        userId: "u-1",
        role: "student",
      },
    });

    const res = await studentEntryApi.setPin("t-1", "123456");

    expect(res.session.accessToken).toBe("tok");
    expect(res.userId).toBe("u-1");
    expect(res.loginIdentifier).toBe("amara.k");
    expect(post).toHaveBeenCalledWith("/api/v1/student-entry/t-1/pin", {
      pin: "123456",
    });
  });
});
