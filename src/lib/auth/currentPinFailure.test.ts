import { describe, expect, it } from "vitest";
import { isCurrentPinRejected } from "./currentPinFailure";
import { ApiError } from "@/lib/api/client";

/**
 * Which of two sentences a child reads.
 *
 * `PinCreationScreen` says *"we couldn't save that just now - that's on us,
 * not you"* for a rejected write, and that copy exists because an earlier
 * version blamed a child for a failure no retype could fix. A wrong current
 * PIN is the mirror case: it IS theirs, retyping IS the fix, and calling it
 * our fault sends them to find an adult about something they could have
 * solved.
 */

const refusal = (status: number, code?: string) =>
  new ApiError(status, "no", code ? { detail: { code, message: "x" } } : {});

describe("the child's own mistake", () => {
  it("recognises a wrong current PIN", () => {
    expect(isCurrentPinRejected(refusal(403, "current_pin_required"))).toBe(
      true,
    );
  });
});

describe("everything else, which is not theirs", () => {
  it("is not a mistyped PIN when a teacher is signed in on the tablet", () => {
    /*
     * The already-documented 403 on this route: the signed-in account is not a
     * student. Retyping cannot fix it, and telling a child their PIN was wrong
     * sends them round a loop that cannot end - the exact trap the save-failed
     * copy was written to escape.
     */
    expect(isCurrentPinRejected(refusal(403, "pin_is_for_students"))).toBe(
      false,
    );
  });

  it("is not a mistyped PIN when the 403 carries no code at all", () => {
    expect(isCurrentPinRejected(refusal(403))).toBe(false);
  });

  it.each([[400], [401], [422], [500]])(
    "is not a mistyped PIN on a %i",
    (status) => {
      expect(isCurrentPinRejected(refusal(status, "current_pin_required"))).toBe(
        false,
      );
    },
  );

  it("is not a mistyped PIN when the network never answered", () => {
    // A dropped connection is not an ApiError at all.
    expect(isCurrentPinRejected(new TypeError("fetch failed"))).toBe(false);
    expect(isCurrentPinRejected(null)).toBe(false);
    expect(isCurrentPinRejected(undefined)).toBe(false);
  });

  it("is not fooled by a plain object wearing the same shape", () => {
    // A Starlette error page leaves `detail` as a string; nothing that is not
    // an ApiError should reach a conclusion about a child's PIN.
    expect(
      isCurrentPinRejected({
        status: 403,
        detail: { detail: { code: "current_pin_required" } },
      }),
    ).toBe(false);
  });
});
