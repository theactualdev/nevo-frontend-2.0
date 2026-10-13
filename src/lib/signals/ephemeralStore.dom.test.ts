import { afterEach, describe, expect, it, vi } from "vitest";
import * as store from "./ephemeralStore";

/**
 * The on-device tap log had no reader and was cleared only by Profile's
 * sign-out. Nothing writes to it now, and what an earlier build left goes at
 * the next sign-in or sign-out - whichever way the last session ended.
 */

const stubIndexedDb = () => {
  const deleteDatabase = vi.fn(() => {
    const req: Record<string, (() => void) | null> = { onsuccess: null };
    queueMicrotask(() => req.onsuccess?.());
    return req;
  });
  vi.stubGlobal("indexedDB", { deleteDatabase, open: vi.fn() });
  return deleteDatabase;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the device tap log", () => {
  it("can no longer be written to", () => {
    expect(Object.keys(store).sort()).toEqual([
      "endEphemeralSession",
      "setEphemeralStudent",
    ]);
  });

  it("is deleted when a child signs in, so nothing of the last child stays", () => {
    const deleteDatabase = stubIndexedDb();
    window.sessionStorage.setItem("nevo-signal-session", "signals-old");

    store.setEphemeralStudent("child-b");

    expect(deleteDatabase).toHaveBeenCalledWith("nevo-ephemeral-signals");
    expect(window.sessionStorage.getItem("nevo-signal-session")).toBeNull();
  });

  it("is deleted on sign-out", async () => {
    const deleteDatabase = stubIndexedDb();

    await store.endEphemeralSession();

    expect(deleteDatabase).toHaveBeenCalledWith("nevo-ephemeral-signals");
  });
});
