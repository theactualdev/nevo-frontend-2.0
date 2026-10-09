import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import catalogue from "./signals.catalogue.json";
import { ONBOARDING_SIGNAL_TYPES, SIGNAL_EVENT_TYPES } from "@/lib/constants";
import {
  KNOWN_UNDECLARED,
  declaredKeys,
  declaredValues,
  parseDeclared,
  requiredKeys,
  undeclaredKeys,
  undeclaredValues,
} from "@/test/signalCatalogue";

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

/*
 * HOW AN ENTRY IS READ. Since 8 Oct the catalogue writes a closed set beside
 * its key - `breakType: micro|movement|consolidation|full` - and the guard
 * read that whole string as the key's name, which no payload could ever
 * carry: every break event would have failed it, and so would a correct one.
 */
describe("a catalogue entry", () => {
  it("is a required key, an optional one, or a key with its closed set", () => {
    expect(parseDeclared("segmentId")).toEqual([
      "segmentId",
      { required: true, values: null },
    ]);
    expect(parseDeclared("[depthRatio]")).toEqual([
      "depthRatio",
      { required: false, values: null },
    ]);
    expect(parseDeclared("source: checkpoint|assessment")).toEqual([
      "source",
      { required: true, values: new Set(["checkpoint", "assessment"]) },
    ]);
    expect(parseDeclared("[outcome: better|worse|no_change]")).toEqual([
      "outcome",
      { required: false, values: new Set(["better", "worse", "no_change"]) },
    ]);
  });

  it("names the keys the live catalogue declares, values apart", () => {
    expect([...(declaredKeys("break_end") ?? [])]).toEqual([
      "breakType",
      "trigger",
      "durationMs",
    ]);
    expect(requiredKeys("time_on_segment")).toEqual([
      "segmentId",
      "durationMs",
      "depthShown",
    ]);
    expect(declaredValues("comprehension_response", "source")).toEqual(
      new Set(["checkpoint", "assessment"]),
    );
    expect(undeclaredValues("break_taken", { breakType: "stretch" })).toEqual([
      "breakType=stretch",
    ]);
    expect(undeclaredValues("break_taken", { breakType: "movement" })).toEqual([]);
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

/*
 * EVERY PAYLOAD KEY, AGAINST THE KEYS THE CATALOGUE DECLARES FOR ITS TYPE.
 *
 * The checks above hold the TYPES to the catalogue, and the keys inside them
 * were held to nothing, so they drifted: `scrollDepthPct` where none is
 * declared, `depthPct` for `depthRatio`, `phase` for `durationMs`, `feelings`
 * for `response`, and `correct` on an answer the server marks itself. The
 * ingest took every one - `eventData` accepts any key - and the engine read
 * none of them.
 *
 * READ FROM THE SOURCE, NOT FROM A RUN, so it covers every call site and not
 * only the ones a test happens to reach: any call whose first argument names
 * a type through `SIGNAL_EVENT_TYPES` or `ONBOARDING_SIGNAL_TYPES`, and the
 * `{ type, payload }` the hook queues itself. The payload has to be written
 * inline for its keys to be read, and that is checked too. A call whose type
 * is a variable - the density chips, the suggestion outcomes - cannot be read
 * here; the player's tests hold those to the same list (`offendingCalls`).
 */
const SRC = join(import.meta.dirname, "..", "..");
const NAMES: Record<string, string> = {
  ...SIGNAL_EVENT_TYPES,
  ...ONBOARDING_SIGNAL_TYPES,
};
const TABLES = new Set(["SIGNAL_EVENT_TYPES", "ONBOARDING_SIGNAL_TYPES"]);

/** Source files, without tests and without the test helpers. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory())
      return path === join(SRC, "test") ? [] : sourceFiles(path);
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [path] : [];
  });
}

/** The event type an expression names, or null when it names none. */
function typeNamed(node: ts.Expression): string | null {
  return ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    TABLES.has(node.expression.text)
    ? (NAMES[node.name.text] ?? null)
    : null;
}

/** The keys an inline payload can carry, or null when they cannot be read. */
function keysOf(node: ts.Expression | undefined): string[] | null {
  if (!node) return [];
  if (ts.isParenthesizedExpression(node)) return keysOf(node.expression);
  if (ts.isIdentifier(node) && node.text === "undefined") return [];
  if (ts.isConditionalExpression(node)) {
    const either = [keysOf(node.whenTrue), keysOf(node.whenFalse)];
    return either.every(Boolean) ? either.flatMap((k) => k ?? []) : null;
  }
  if (!ts.isObjectLiteralExpression(node)) return null;
  const keys: string[] = [];
  for (const prop of node.properties) {
    if (ts.isSpreadAssignment(prop)) {
      const spread = keysOf(prop.expression);
      if (!spread) return null;
      keys.push(...spread);
    } else if (
      prop.name &&
      (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name))
    ) {
      keys.push(prop.name.text);
    } else return null;
  }
  return keys;
}

/**
 * The values an inline payload writes as string literals, by key - all a
 * source read can know of a value. `source: "assessment"` is read; a value
 * held in a variable is the player's tests' to check (`offendingCalls`).
 */
function literalsOf(node: ts.Expression | undefined): [string, string][] {
  if (!node) return [];
  if (ts.isParenthesizedExpression(node)) return literalsOf(node.expression);
  if (ts.isConditionalExpression(node))
    return [...literalsOf(node.whenTrue), ...literalsOf(node.whenFalse)];
  if (!ts.isObjectLiteralExpression(node)) return [];
  return node.properties.flatMap((prop): [string, string][] => {
    if (ts.isSpreadAssignment(prop)) return literalsOf(prop.expression);
    return ts.isPropertyAssignment(prop) &&
      (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) &&
      ts.isStringLiteralLike(prop.initializer)
      ? [[prop.name.text, prop.initializer.text]]
      : [];
  });
}

interface Site {
  where: string;
  type: string;
  /** Null when the payload is not written inline. */
  keys: string[] | null;
  /** The values it writes as literals, by key. */
  literals: [string, string][];
}

const SITES: Site[] = sourceFiles(SRC).flatMap((file) => {
  const text = readFileSync(file, "utf8");
  if (!/SIGNAL_(EVENT_)?TYPES/.test(text)) return [];
  const sf = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const at = (node: ts.Node) =>
    `${relative(SRC, file).replace(/\\/g, "/")}:${
      sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
    }`;
  const found: Site[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.arguments.length > 0) {
      const type = typeNamed(node.arguments[0]);
      if (type)
        found.push({
          where: at(node),
          type,
          keys: keysOf(node.arguments[1]),
          literals: literalsOf(node.arguments[1]),
        });
    }
    if (ts.isObjectLiteralExpression(node)) {
      const prop = (name: string) =>
        node.properties.find(
          (p): p is ts.PropertyAssignment =>
            ts.isPropertyAssignment(p) &&
            ts.isIdentifier(p.name) &&
            p.name.text === name,
        );
      const type = prop("type");
      const payload = prop("payload");
      const named = type ? typeNamed(type.initializer) : null;
      if (named && payload)
        found.push({
          where: at(node),
          type: named,
          keys: keysOf(payload.initializer),
          literals: literalsOf(payload.initializer),
        });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
});

describe("every payload the client writes", () => {
  it("is found, so the checks below cannot pass by finding none", () => {
    const types = new Set(SITES.map((s) => s.type));
    // One read through a call, one through a helper, one the hook queues.
    expect(types).toContain("time_on_segment");
    expect(types).toContain("system_busy");
    expect(types).toContain("session_context");
    expect(SITES.length).toBeGreaterThan(20);
  });

  it("is written inline, where its keys can be read", () => {
    expect(SITES.filter((s) => s.keys === null).map((s) => s.where)).toEqual([]);
  });

  it("carries no key the catalogue does not declare for its type", () => {
    const offences = SITES.flatMap((s) =>
      undeclaredKeys(s.type, s.keys ?? []).map(
        (key) => `${s.where} ${s.type}: ${key}`,
      ),
    );
    expect(offences).toEqual([]);
  });

  it("writes no literal value outside the set the catalogue names for its key", () => {
    // `source: checkpoint|assessment`, `breakType: micro|...`: a literal the
    // set does not hold is a reading the engine cannot place.
    const offences = SITES.flatMap((s) =>
      undeclaredValues(s.type, Object.fromEntries(s.literals)).map(
        (value) => `${s.where} ${s.type}: ${value}`,
      ),
    );
    expect(offences).toEqual([]);
    // And it read some, so it cannot pass by reading none.
    expect(SITES.some((s) => s.literals.length > 0)).toBe(true);
  });

  it("sends only the engagement indicators the client sees without a cutoff (B105)", () => {
    /*
     * `focus_drop` is "below the local focus pattern", `rapid_guessing` is
     * "rapid", `steady_progress` is "sustained": each needs a baseline or a
     * threshold this client would have to invent (rule 3). The three it
     * sends are things that happened - the page hidden, for how long, a move
     * back - counted or timed and nothing more.
     */
    const indicators = SITES.filter((s) => s.type === "engagement_signal")
      .flatMap((s) => s.literals)
      .filter(([key]) => key === "indicator")
      .map(([, value]) => value);
    expect(new Set(indicators)).toEqual(
      new Set(["task_switch", "return_after_pause", "navigation_fragmentation"]),
    );
  });

  it("still sends every key KNOWN_UNDECLARED excuses, or it comes off the list", () => {
    const stale = Object.entries(KNOWN_UNDECLARED).flatMap(([type, keys]) =>
      keys
        .filter(
          (key) => !SITES.some((s) => s.type === type && s.keys?.includes(key)),
        )
        .map((key) => `${type}: ${key}`),
    );
    expect(stale).toEqual([]);
  });
});
