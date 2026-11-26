import { describe, expect, it } from "vitest";
import { bulkResendLines, resendable } from "./bulkResend";

describe("a mass resend's outcome", () => {
  it("accounts for every invite, in this screen's own words for each answer", () => {
    expect(bulkResendLines({ resent: 3, noEmail: 1, unconfirmed: 2, failed: 1 })).toEqual([
      "3 invites resent.",
      "No email went out for 1 - their link is in their row.",
      "We couldn’t confirm an email went out for 2.",
      "1 didn’t resend, and nothing changed for those. Try them again in a moment.",
    ]);
  });

  it("says only what happened", () => {
    expect(bulkResendLines({ resent: 1, noEmail: 0, unconfirmed: 0, failed: 0 })).toEqual([
      "1 invite resent.",
    ]);
    expect(bulkResendLines({ resent: 0, noEmail: 2, unconfirmed: 0, failed: 0 })).toEqual([
      "No email went out for 2 - their links are in their rows.",
    ]);
  });

  it("reaches only the invites a row's own Resend is offered on", () => {
    expect(["pending", "expired", "joined", "revoked", "conflicted"].filter(resendable)).toEqual([
      "pending",
      "expired",
    ]);
  });
});
