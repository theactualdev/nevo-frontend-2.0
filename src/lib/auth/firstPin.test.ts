import { beforeEach, describe, expect, it, vi } from "vitest";

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  api: { post, get: vi.fn() },
}));

import { ApiError } from "@/lib/api/client";
import { bindFirstPin } from "./firstPin";

/**
 * The first PIN goes to `POST /api/v1/student-entry/pin` (B64), keyed on the
 * pair 05 Entry matched the child on, and the answer is their first session.
 *
 * What must hold: the PIN goes to THAT route and no other - never `/auth/pin`,
 * which writes onto whoever's token is on the tablet - and a refusal stays a
 * refusal all the way to the PIN screen.
 */

const ENTRY = { schoolCode: "K7DQ", admissionNumber: "BGA/2031" };

const SESSION = {
  userId: "student-9",
  loginIdentifier: "NV-A1B2C3",
  session: {
    accessToken: "tok-s",
    tokenType: "bearer",
    expiresAt: "2026-10-06T18:00:00Z",
    userId: "student-9",
    role: "student",
    replacedSession: false,
  },
  pinLength: 4,
};

beforeEach(() => {
  post.mockReset();
});

describe("bindFirstPin", () => {
  it("posts the matched pair and the PIN to the entry PIN route, and nothing else", async () => {
    post.mockResolvedValue(SESSION);

    await bindFirstPin(ENTRY, "1234");

    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith("/api/v1/student-entry/pin", {
      schoolCode: "K7DQ",
      admissionNumber: "BGA/2031",
      pin: "1234",
    });
    // `StudentPinSetup` is exactly these three. `/auth/pin` would write onto
    // whoever's token is on the device.
    expect(Object.keys(post.mock.calls[0][1]).sort()).toEqual([
      "admissionNumber",
      "pin",
      "schoolCode",
    ]);
  });

  it("hands back the session the route started", async () => {
    post.mockResolvedValue(SESSION);

    const res = await bindFirstPin(ENTRY, "1234");

    expect(res.userId).toBe("student-9");
    expect(res.loginIdentifier).toBe("NV-A1B2C3");
    expect(res.session.accessToken).toBe("tok-s");
  });

  it.each([
    ["a 422, the one refusal the spec declares", 422],
    ["a 401", 401],
    ["a 403", 403],
    ["a 409", 409],
    ["a 429", 429],
    ["a 500", 500],
    ["a dropped network", 0],
  ])("passes %s through as a rejection, never as a session", async (_, status) => {
    // Backend describes refusals for a child who already has a PIN, for
    // consent and for the age check, and declares a status for none of them.
    // Whatever arrives, the PIN screen has to see a rejection.
    const refusal = new ApiError(status, "refused");
    post.mockRejectedValue(refusal);

    await expect(bindFirstPin(ENTRY, "1234")).rejects.toBe(refusal);
  });

  it("keeps the credential in the body, never the address", async () => {
    // A path ends up in logs and history. Together the pair and the PIN are a
    // credential.
    post.mockResolvedValue(SESSION);

    await bindFirstPin(ENTRY, "1234");

    const path = String(post.mock.calls[0][0]);
    for (const part of ["K7DQ", "BGA", "2031", "1234"]) {
      expect(path).not.toContain(part);
    }
  });
});
