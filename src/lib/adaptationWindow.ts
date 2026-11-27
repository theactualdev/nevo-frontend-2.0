import type { AdaptationEventRow } from "@/lib/api/schoolIntelligence";

/**
 * Every adaptation in a window, tallied per learner — or nothing at all.
 *
 * D8b puts "adaptations this week" on each learner's row. A marker in SencoView
 * once deferred it as needing a request per learner; a later correction said it
 * was "one windowed call". BOTH WERE WRONG, and the second one more dangerously:
 *
 *   - `GET /api/admin/adaptation-log` caps `limit` at 100. A school's week does
 *     not fit in one page.
 *   - `AdaptationEventLogResponse.total` carries NO DESCRIPTION in the deployed
 *     spec. Required is not the same as window-scoped or uncapped, so a
 *     completeness check resting on `total` could be comparing against a number
 *     that means something else entirely — and every per-learner tally would be
 *     quietly low.
 *
 * SO TERMINATION IS ON A SHORT PAGE, and `total` IS NOT CONSULTED AT ALL.
 * `events.length < limit` is the only exhaustion signal this contract supports.
 *
 * An earlier draft used `total` as a corroborating gate - report nothing if it
 * claims more than we read. That is worse than no gate. If `total` turns out to
 * count the whole log rather than the window it disagrees on every school on
 * every load, so the figure would be blank everywhere, permanently and
 * silently, for a reason nobody would find. A normal concurrent write during
 * paging tripped it too. A field with undocumented semantics cannot be the
 * thing that decides whether a screen speaks.
 *
 * PARTIAL IS REPORTED AS NOTHING. A tally built from the pages we managed to
 * read is a FLOOR, and a floor rendered beside a child's name as a count is the
 * under-report this console has shipped before. `complete: false` means the
 * caller shows no figures at all.
 */

export const WINDOW_DAYS = 7;
/** The contract's maximum. Fewer pages for the same week. */
export const PAGE = 100;
/** ~2,000 events in a week. Beyond that we stop and say we do not know. */
export const MAX_PAGES = 20;

export interface AdaptationWindow {
  /** Adaptations in the window, keyed by studentId. Empty when incomplete. */
  perLearner: Record<string, number>;
  /** False means: report NO figures. Not "report what we have". */
  complete: boolean;
  /**
   * What a page that did not answer threw, when that is why `complete` is
   * false - so the caller can say a failure and stay quiet on a refusal
   * (Hub, 26 Nov). Absent when the pages simply ran past the cap.
   */
  error?: unknown;
}

/** The ISO instant `WINDOW_DAYS` ago, which is what "this week" means here. */
export function windowStart(now: number): string {
  return new Date(now - WINDOW_DAYS * 864e5).toISOString();
}

/**
 * Tally a window, paging until a short page.
 *
 * `fetchPage` is injected so the paging rule can be tested without a network or
 * a mock of the api client — the rule is the part that can be wrong.
 *
 * Rows are deduplicated by event id. Sequential paging against a live log can
 * see the same row twice if something is written between requests, and a
 * duplicate would inflate exactly one learner's count.
 */
export async function collectAdaptationWindow(
  fetchPage: (offset: number) => Promise<{ events: AdaptationEventRow[]; total: number }>,
  maxPages = MAX_PAGES,
): Promise<AdaptationWindow> {
  const seen = new Set<string>();
  const perLearner: Record<string, number> = {};

  for (let page = 0; page < maxPages; page += 1) {
    let batch;
    try {
      batch = await fetchPage(page * PAGE);
    } catch (error) {
      // A page that failed makes the whole window a floor.
      return { perLearner: {}, complete: false, error };
    }
    const events = Array.isArray(batch?.events) ? batch.events : [];

    for (const e of events) {
      if (!e?.id || seen.has(e.id)) continue;
      seen.add(e.id);
      if (!e.studentId) continue;
      perLearner[e.studentId] = (perLearner[e.studentId] ?? 0) + 1;
    }

    // A short page is the end of the log, and the only end this contract
    // lets us observe.
    if (events.length < PAGE) return { perLearner, complete: true };
  }

  // Still a full page at the cap: there is more we have not seen.
  return { perLearner: {}, complete: false };
}
