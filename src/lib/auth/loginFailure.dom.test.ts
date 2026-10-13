import { describe, expect, it } from "vitest";
import {
  classifyLearnerLoginFailure,
  classifyLoginFailure,
} from "./loginFailure";
import { ApiError } from "@/lib/api/client";

/**
 * Every 401 used to render "That PIN didn't match." Backend can now name which
 * 401 it is, and two of the three are not the child's doing.
 *
 * `.dom.test.ts` because `ApiError` comes from `client.ts`, which touches
 * `window` at module scope; the node project fails it on import rather than on
 * anything true about the code.
 */

/** The 401 body FastAPI actually sends: `{ detail: { code, message } }`. */
const refusal = (code: string) =>
  new ApiError(401, "Unauthorized", { detail: { code, message: "no" } });

describe("classifyLoginFailure", () => {
  it("knows a paused account from a wrong PIN", () => {
    // The PIN was RIGHT. Telling this child they mistyped is why they try again
    // and again before asking an adult why they are locked out.
    expect(classifyLoginFailure(refusal("account_paused"))).toBe("paused");
  });

  it("knows a rate limit from a wrong PIN", () => {
    expect(classifyLoginFailure(refusal("too_many_attempts"))).toBe(
      "throttled",
    );
  });

  it("still calls a wrong PIN a wrong PIN", () => {
    expect(classifyLoginFailure(refusal("authentication_failed"))).toBe(
      "credentials",
    );
  });

  it("does not mistake an unrecognised code for a paused account", () => {
    // The documented set is not closed - the session-validation codes are
    // absent from the document entirely. "paused" is the worst thing to guess
    // wrong, because it tells a child their account was switched off.
    expect(classifyLoginFailure(refusal("some_future_code"))).toBe(
      "credentials",
    );
  });

  it("falls back honestly when the body carries no code", () => {
    // An older deployment, or a proxy's own error page.
    expect(classifyLoginFailure(new ApiError(401, "Unauthorized"))).toBe(
      "credentials",
    );
  });

  it("falls back honestly when the body is not the shape we expect", () => {
    expect(
      classifyLoginFailure(new ApiError(401, "Unauthorized", "nope")),
    ).toBe("credentials");
    expect(
      classifyLoginFailure(
        new ApiError(401, "Unauthorized", { detail: "nope" }),
      ),
    ).toBe("credentials");
  });

  it("reads a 403 the same way as a 401", () => {
    const forbidden = new ApiError(403, "Forbidden", {
      detail: { code: "account_paused", message: "no" },
    });

    expect(classifyLoginFailure(forbidden)).toBe("paused");
  });

  it("blames itself for a server fault, whatever the body says", () => {
    // A 500 that happened to carry a code must not become a paused account.
    const server = new ApiError(500, "Server Error", {
      detail: { code: "account_paused", message: "no" },
    });

    expect(classifyLoginFailure(server)).toBe("ours");
  });

  it("blames itself for a 422, which is our malformed request", () => {
    // The live example: a 6-digit PIN truncated to 4 read exactly like a wrong
    // PIN, and cost an evening.
    expect(classifyLoginFailure(new ApiError(422, "Unprocessable"))).toBe(
      "ours",
    );
  });

  it("blames itself when the network never answered", () => {
    expect(classifyLoginFailure(new TypeError("fetch failed"))).toBe("ours");
  });
});

/**
 * B58 and D53: a removed child's right PIN is answered 401 `account_closed`.
 * Unread, that code fell to "credentials" and the child was told their PIN did
 * not match. The child's doors read it; the staff doors are left as they were.
 */
describe("classifyLearnerLoginFailure", () => {
  it("knows a closed account from a wrong PIN, and from a paused one", () => {
    expect(classifyLearnerLoginFailure(refusal("account_closed"))).toBe("closed");
    expect(classifyLearnerLoginFailure(refusal("account_paused"))).toBe("paused");
  });

  it("reads every other failure exactly as the staff doors do", () => {
    for (const cause of [
      refusal("authentication_failed"),
      refusal("too_many_attempts"),
      refusal("some_future_code"),
      new ApiError(500, "x", { detail: { code: "account_closed" } }),
      new ApiError(0, "offline"),
    ]) {
      expect(classifyLearnerLoginFailure(cause)).toBe(classifyLoginFailure(cause));
    }
  });

  it("leaves the staff classifier as it was", () => {
    // No staff frame draws a closed state, and their doors' maps are typed on
    // `LoginFailure`, which this ruling does not widen.
    expect(classifyLoginFailure(refusal("account_closed"))).toBe("credentials");
  });
});
