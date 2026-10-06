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

/** "[depthRatio]" is optional; the brackets are not part of the key. */
const DECLARED = new Map(
  (catalogue as CatalogueEntry[]).map((e) => [
    e.eventType,
    new Set(e.payload.map((key) => key.replace(/^\[(.*)\]$/, "$1"))),
  ]),
);

/** The keys the catalogue declares for a type, or null for a type it lacks. */
export function declaredKeys(type: string): ReadonlySet<string> | null {
  return DECLARED.get(type) ?? null;
}

/**
 * KEYS STILL SENT THAT THE CATALOGUE DOES NOT DECLARE, each owned elsewhere.
 * This list only shrinks: the guards fail on a key not named here, and on a
 * key named here that nothing sends any more, so it cannot outlive its reason.
 *
 * - The break events are the player batch's, rebuilt with the break pill.
 * - The solver's two are frozen with it (SCRUM-181/177).
 * - The baseline markers are the baseline batch's (`moduleId`, and B76 for
 *   where `band` goes).
 */
export const KNOWN_UNDECLARED: Readonly<Record<string, readonly string[]>> = {
  break_suggested: ["segmentId", "breakType"],
  break_taken: ["segmentId", "breakType"],
  break_start: ["type", "segmentId"],
  break_end: ["type"],
  calculation_step_response: ["correct"],
  manipulative_piece_placed: ["placed", "needed"],
  baseline_module_start: ["module", "band"],
  baseline_module_complete: ["module"],
};

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
 * Every `trackEvent(type, payload)` call a mock saw whose payload carries a
 * key the catalogue does not declare, as `type: key, key` lines - so a failure
 * names the offence rather than printing two arrays.
 */
export function offendingCalls(calls: readonly unknown[][]): string[] {
  return calls.flatMap(([type, payload]) => {
    const extra = undeclaredKeys(
      String(type),
      Object.keys((payload as Record<string, unknown> | undefined) ?? {}),
    );
    return extra.length > 0 ? [`${String(type)}: ${extra.join(", ")}`] : [];
  });
}
