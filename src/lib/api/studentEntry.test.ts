import { beforeEach, describe, expect, it, vi } from "vitest";

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("./client", () => ({ api: { get, post, patch: vi.fn() } }));

import { studentEntryApi } from "./studentEntry";

/**
 * The lookup finds a child the school already recorded, so the fields that
 * arrive ARE the flow: a name nobody asks for, an age nobody types, and where
 * consent stands before the first activity.
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
  consentState: "given",
  age: 11,
  accountReady: false,
  ageCheckPending: false,
  ...over,
});

describe("lookup", () => {
  it("posts the pair, as typed, to the lookup", async () => {
    post.mockResolvedValue(state());

    await studentEntryApi.lookup({
      schoolCode: "K7DQ",
      admissionNumber: "BGA/2031",
    });

    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith("/api/v1/student-entry/lookup", {
      schoolCode: "K7DQ",
      admissionNumber: "BGA/2031",
    });
    // The entry link's read is gone: nothing addresses a child by token.
    expect(get).not.toHaveBeenCalled();
  });

  it("carries every field the entry state declares", async () => {
    post.mockResolvedValue(state({ consentState: "withdrawn" }));

    const res = await studentEntryApi.lookup({
      schoolCode: "K7DQ",
      admissionNumber: "BGA/2031",
    });

    expect(res.firstName).toBe("Amara");
    expect(res.className).toBe("JSS 1B");
    expect(res.consentState).toBe("withdrawn");
    expect(res.age).toBe(11);
    expect(res.accountReady).toBe(false);
    expect(res.ageCheckPending).toBe(false);
  });

  it("keeps a null class and a null age as null, not as absent", async () => {
    // A child with no class recorded is a real state, and it is not the same
    // as a field we failed to read.
    post.mockResolvedValue(state({ className: null, age: null }));

    const res = await studentEntryApi.lookup({
      schoolCode: "K7DQ",
      admissionNumber: "BGA/2031",
    });

    expect(res.className).toBeNull();
    expect(res.age).toBeNull();
  });
});
