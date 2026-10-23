import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "@/lib/api/client";
import {
  endHeldSession,
  endSessionIfStill,
  heldSessionToken,
  isHeldAtDoor,
  openDoor,
  usableSession,
} from "./doorSession";
import { clearSession, getSession, setSession } from "./session";

/**
 * A DOOR SENDS NOTHING AS THE SESSION IT FOUND STORED (19 Oct browser-storage
 * audit). The token stored when a sign-in screen, Forgot PIN, the SSO callback
 * or 05 opens is somebody else's to that screen: nothing is sent with it, and
 * nothing treats it as the child to send as. A sign-in at the door is sent as
 * normal.
 */

let sent: { url: string; auth: string | null }[] = [];
const signInAs = (userId: string) =>
  setSession({
    token: `tok-${userId}`,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    userId,
    role: "student",
  });

beforeEach(() => {
  sent = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      sent.push({ url: String(input), auth: headers.Authorization ?? null });
      return new Response("{}", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
});

afterEach(() => {
  clearSession();
  vi.unstubAllGlobals();
});

describe("a door open over a stored session", () => {
  it("sends nothing at all as that session - not even without its token", async () => {
    signInAs("amara");
    const close = openDoor();

    const refused = await api.get("/api/v1/settings/me").catch((e) => e);

    expect(refused).toBeInstanceOf(ApiError);
    expect((refused as ApiError).status).toBe(0);
    expect(sent).toEqual([]);
    expect(usableSession()).toBeNull();
    close();
  });

  it("sends as the child who signs in at it", async () => {
    signInAs("amara");
    const close = openDoor();

    signInAs("kofi");
    await api.get("/api/v1/users/me");

    expect(sent).toEqual([
      expect.objectContaining({ auth: "Bearer tok-kofi" }),
    ]);
    expect(usableSession()?.userId).toBe("kofi");
    close();
  });

  it("lets go of the session once the door closes", async () => {
    signInAs("amara");
    const close = openDoor();
    close();
    close();

    await api.get("/api/v1/users/me");

    expect(isHeldAtDoor("tok-amara")).toBe(false);
    expect(sent[0].auth).toBe("Bearer tok-amara");
  });

  it("holds nothing on a device with no session stored", () => {
    clearSession();
    const close = openDoor();

    signInAs("kofi");

    expect(usableSession()?.userId).toBe("kofi");
    close();
  });
});

/*
 * LEAVING A DOOR ENDS WHAT IT HELD, AND NOTHING ELSE (19 Oct browser-storage
 * audit). The held token is read while the door is open and ended after it
 * has closed - so the ending is told which token, and a session stored since
 * is somebody's own.
 */
describe("ending the session a door held", () => {
  it("names the held token only while the door is open", () => {
    signInAs("amara");
    expect(heldSessionToken()).toBeNull();

    const close = openDoor();
    expect(heldSessionToken()).toBe("tok-amara");

    close();
    expect(heldSessionToken()).toBeNull();
  });

  it("ends that token's session after the door has closed", () => {
    signInAs("amara");
    const close = openDoor();
    const held = heldSessionToken() ?? "";
    close();

    expect(endSessionIfStill(held)).toBe(true);
    expect(getSession()).toBeNull();
  });

  it("keeps a session stored since, which has its own token", () => {
    signInAs("amara");
    const close = openDoor();
    const held = heldSessionToken() ?? "";
    signInAs("chidi");
    close();

    expect(endSessionIfStill(held)).toBe(false);
    expect(getSession()?.userId).toBe("chidi");
    // And the chevron's own end, while the door is open, keeps it too.
    const again = openDoor();
    signInAs("tobi");
    expect(endHeldSession()).toBe(false);
    expect(getSession()?.userId).toBe("tobi");
    again();
  });
});
