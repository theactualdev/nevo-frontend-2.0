import { describe, expect, it } from "vitest";
import catalogue from "./signals.catalogue.json";
import { ONBOARDING_SIGNAL_TYPES, SIGNAL_EVENT_TYPES } from "@/lib/constants";

/**
 * EVERY TYPE THIS CLIENT CAN EMIT, PINNED AGAINST BACKEND'S OWN CATALOGUE
 * (B37, 5 Oct).
 *
 * `signals.catalogue.json` is `GET /api/signals/catalogue`, checked in as it
 * was served: the trigger, the payload keys and `serverWritten` for each type.
 * It replaces a list of the ingest enum copied out by hand, which is how this
 * client once dropped nine types nobody remembered to add - and the enum could
 * not say the one thing that matters most now, which types the server writes
 * itself. Sending one of those doubles a count the engine already keeps
 * (`adaptation_suppressed` did, from #623 until 6 Oct).
 *
 * So this fails when the client can emit a type that is:
 * - server-written - never ours to send, however it reached the client, or
 * - not in the catalogue at all - one unknown type 422s the whole batch.
 *
 * NO NETWORK: the snapshot is the contract this client was built against.
 *
 * TO REFRESH IT, from the repo root, then read the diff before committing -
 * a type that turned server-written is a type this client must stop sending:
 *
 *   node -e "fetch('https://nevo-backend-2-0-kn3d.onrender.com/api/signals/catalogue').then(r=>{if(!r.ok)throw new Error(r.status);return r.json()}).then(j=>require('fs').writeFileSync('src/lib/api/signals.catalogue.json',JSON.stringify(j,null,2)+'\n'))"
 */

interface CatalogueEntry {
  eventType: string;
  trigger: string;
  payload: string[];
  serverWritten?: boolean;
}

const ENTRIES = catalogue as CatalogueEntry[];
/** `serverWritten` defaults to false in `SignalContractResponse`. */
const SERVER_WRITTEN = new Set(
  ENTRIES.filter((e) => e.serverWritten).map((e) => e.eventType),
);
const SENDABLE = new Set(
  ENTRIES.filter((e) => !e.serverWritten).map((e) => e.eventType),
);

const EMITTABLE = [
  ...Object.values(SIGNAL_EVENT_TYPES),
  ...Object.values(ONBOARDING_SIGNAL_TYPES),
];

describe("the catalogue snapshot", () => {
  it("is a catalogue, so the checks below cannot pass by being empty", () => {
    expect(ENTRIES.length).toBeGreaterThan(0);
    for (const entry of ENTRIES) {
      expect(entry.eventType).toEqual(expect.any(String));
      expect(entry.payload).toEqual(expect.any(Array));
    }
  });
});

describe("every type the client can emit", () => {
  it("is never one the server writes itself", () => {
    expect(EMITTABLE.filter((t) => SERVER_WRITTEN.has(t))).toEqual([]);
  });

  it("is one the catalogue names as the client's to send", () => {
    expect(EMITTABLE.filter((t) => !SENDABLE.has(t))).toEqual([]);
  });
});
