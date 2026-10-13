import { afterEach, describe, expect, it } from "vitest";
import {
  clearSignInHandoff,
  handSignInOver,
  peekSignInHandoff,
} from "./signInHandoff";

/**
 * 05 Entry hands an account-ready child's code and ID to 00c, in memory and
 * for one screen only.
 */

afterEach(() => clearSignInHandoff());

describe("the sign-in hand-off", () => {
  it("is empty until 05 leaves something", () => {
    expect(peekSignInHandoff()).toBeNull();
  });

  it("holds what 05 left, and peeking does not spend it", () => {
    // React may run a state initialiser twice; both runs must see it.
    handSignInOver({ schoolCode: "K7DQ", identifier: "BGA/2031" });

    expect(peekSignInHandoff()).toEqual({
      schoolCode: "K7DQ",
      identifier: "BGA/2031",
    });
    expect(peekSignInHandoff()).not.toBeNull();
  });

  it("is gone once spent", () => {
    handSignInOver({ schoolCode: "K7DQ", identifier: "BGA/2031" });

    clearSignInHandoff();

    expect(peekSignInHandoff()).toBeNull();
  });
});
