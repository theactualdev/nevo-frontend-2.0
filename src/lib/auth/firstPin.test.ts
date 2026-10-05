import { describe, expect, it } from "vitest";
import { AwaitingBackendB64Error, bindFirstPin } from "./firstPin";

/**
 * Until backend answers B64 there is no route that can attach a first PIN to
 * the child 05 Entry found, so the binding fails - typed, so it can be told
 * apart from a write that was tried and refused, and never resolving into a
 * session nobody issued.
 */

const ENTRY = { schoolCode: "K7DQ", admissionNumber: "BGA/2031" };

describe("bindFirstPin, awaiting B64", () => {
  it("rejects with the typed awaiting-backend error", async () => {
    await expect(bindFirstPin(ENTRY, "1234")).rejects.toBeInstanceOf(
      AwaitingBackendB64Error,
    );
    await expect(bindFirstPin(ENTRY, "1234")).rejects.toMatchObject({
      code: "awaiting_backend_b64",
      name: "AwaitingBackendB64Error",
    });
  });

  it("puts neither half of the credential into the error", async () => {
    // An error message ends up in logs. An admission number and a PIN are a
    // credential.
    const err = await bindFirstPin(ENTRY, "1234").catch((e: Error) => e);

    expect(String(err)).not.toContain("BGA/2031");
    expect(String(err)).not.toContain("1234");
    expect(String(err)).not.toContain("K7DQ");
  });
});
