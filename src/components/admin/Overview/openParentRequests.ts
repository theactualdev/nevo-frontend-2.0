import { consentsApi } from "@/lib/api/consents";

/** The route's own largest page. */
const PAGE = 100;
/** Far past any school's requests; past it, the count is unknown, not short. */
const MAX_PAGES = 20;

/**
 * THE OVERVIEW'S "N findings to review", re-scoped to requests from parents
 * (Lydia, 25 Nov, L51). It counted the internal audit scan's findings, which
 * are ruled off-screen, while Compliance lists only parents' requests - so
 * the two could disagree. Now both are the rights log: the requests no one has
 * resolved yet (`resolvedAt` unset, as Compliance's list marks Pending).
 *
 * The log has a total but no count by state and no state filter, so its pages
 * are read and the open ones counted - a count of the server's own rows, as
 * the roster's tallies are. Any failure, or more pages than any school has,
 * is NULL: unknown, and the tile then says nothing about requests at all.
 */
export async function openParentRequests(): Promise<number | null> {
  let open = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    let log;
    try {
      log = await consentsApi.rightsLog({ limit: PAGE, offset: page * PAGE });
    } catch {
      return null;
    }
    open += log.entries.filter((e) => !e.resolvedAt).length;
    if (log.entries.length === 0 || (page + 1) * PAGE >= log.total) return open;
  }
  return null;
}
