import catalogue from "@/lib/api/signals.catalogue.json";

/**
 * What `GET /api/signals/catalogue` declares each type may carry, for tests.
 *
 * The snapshot is the contract every payload is held to (B37). A key it does
 * not declare is a reading the engine never takes: at best ignored, at worst
 * the only place a fact was ever sent, so it was never received.
 */

interface CatalogueEntry {
  eventType: string;
  payload: string[];
}

/** One declared key: whether it must be sent, and the values it may take. */
interface DeclaredKey {
  required: boolean;
  /** Null when the catalogue names no closed set of values for it. */
  values: ReadonlySet<string> | null;
}

/**
 * One entry of a type's `payload`, as the catalogue writes it (8 Oct):
 * - `segmentId`, a key that must be sent;
 * - `[depthRatio]`, a key that may be - the brackets are not part of it;
 * - `breakType: micro|movement|consolidation|full`, a key and the closed set
 *   of values it takes. Read as the key alone, this was a key named
 *   `breakType: micro|...` that no payload could ever carry.
 */
export function parseDeclared(entry: string): [string, DeclaredKey] {
  const optional = /^\[.*\]$/.test(entry);
  const [key, values] = (optional ? entry.slice(1, -1) : entry)
    .split(":")
    .map((part) => part.trim());
  return [
    key,
    { required: !optional, values: values ? new Set(values.split("|")) : null },
  ];
}

const DECLARED = new Map(
  (catalogue as CatalogueEntry[]).map((e) => [
    e.eventType,
    new Map(e.payload.map(parseDeclared)),
  ]),
);

/** The keys the catalogue declares for a type, or null for a type it lacks. */
export function declaredKeys(type: string): ReadonlySet<string> | null {
  const keys = DECLARED.get(type);
  return keys ? new Set(keys.keys()) : null;
}

/** The keys a type must carry: every declared key not in brackets. */
export function requiredKeys(type: string): string[] {
  return [...(DECLARED.get(type) ?? [])]
    .filter(([, key]) => key.required)
    .map(([name]) => name);
}

/** The values a key may take, or null where the catalogue closes no set. */
export function declaredValues(
  type: string,
  key: string,
): ReadonlySet<string> | null {
  return DECLARED.get(type)?.get(key)?.values ?? null;
}

/**
 * KEYS STILL SENT THAT THE CATALOGUE DOES NOT DECLARE, each owned elsewhere.
 * This list only shrinks: the guards fail on a key not named here, and on a
 * key named here that nothing sends any more, so it cannot outlive its reason.
 *
 * EMPTY since the solver was rebuilt on SCRUM-177's payload: its two events
 * send the catalogue's keys now, `stepId` included. It stays as the place an
 * exception would have to be argued for, and the guard still fails on a key
 * listed here that nothing sends.
 */
export const KNOWN_UNDECLARED: Readonly<Record<string, readonly string[]>> = {};

/**
 * Those of `keys` the catalogue does not declare for `type`, less the ones
 * `KNOWN_UNDECLARED` still allows. Empty when the payload conforms.
 */
export function undeclaredKeys(type: string, keys: Iterable<string>): string[] {
  const declared = declaredKeys(type) ?? new Set<string>();
  const known = new Set(KNOWN_UNDECLARED[type] ?? []);
  return [...keys].filter((key) => !declared.has(key) && !known.has(key));
}

/**
 * Those of a payload's values outside the closed set the catalogue names for
 * their key, as `key=value` - a `breakType` of `stretch`, a `source` of
 * `quiz`. A key with no closed set takes any value.
 */
export function undeclaredValues(
  type: string,
  payload: Record<string, unknown>,
): string[] {
  return Object.entries(payload).flatMap(([key, value]) => {
    const allowed = declaredValues(type, key);
    return allowed && !allowed.has(String(value))
      ? [`${key}=${String(value)}`]
      : [];
  });
}

/**
 * Every `trackEvent(type, payload)` call a mock saw whose payload carries a
 * key the catalogue does not declare, or a value outside the set it names, as
 * `type: key, key=value` lines - so a failure names the offence rather than
 * printing two arrays.
 */
export function offendingCalls(calls: readonly unknown[][]): string[] {
  return calls.flatMap(([type, payload]) => {
    const sent = (payload as Record<string, unknown> | undefined) ?? {};
    const extra = [
      ...undeclaredKeys(String(type), Object.keys(sent)),
      ...undeclaredValues(String(type), sent),
    ];
    return extra.length > 0 ? [`${String(type)}: ${extra.join(", ")}`] : [];
  });
}
