import { api } from "./client";

/**
 * School identity-provider endpoints (`/api/v1/admin/sso/*`), typed against the
 * deployed backend.
 *
 * `status` 404s with `sso_not_configured` for a school that has never
 * connected one - that is the ordinary "nothing connected yet" state, not an
 * error, and the screen treats it as such.
 *
 * TODO(api): CONNECT still has no way in, and the slug is NOT the reason -
 * that was the previous note here and it is wrong. `GET /api/v1/school`
 * carries `slug` for any school actor with no SSO dependency, so the
 * chicken-and-egg is closed (backend confirmed 3 Sep, and `SsoView` has read
 * it that way since).
 *
 * What is missing is enrolment. All ten `sso` operations presuppose a
 * connection that already exists, and nothing anywhere accepts a tenant id,
 * client id, secret or provider choice. The two `start` endpoints are
 * unauthenticated pre-login sign-in handovers - they send a USER to the
 * provider, they do not enrol a SCHOOL - so pointing the Connect button at
 * one would be wrong twice over. See the reasoning in
 * `components/admin/Sso/SsoView.tsx`, which is the authority on this.
 */

export type SsoProvider = "microsoft" | "google";
export type SsoConnectionStatus = "connected" | "needs_attention" | "disconnected";
/**
 * THE ENUM HAS FOUR MEMBERS AND THIS TYPE CARRIED THREE.
 *
 * `running` was missing, and it is the one a client meets first:
 * `POST /admin/sso/roster-sync` answers 202 carrying this same enum, so a run
 * queued by "Sync now" comes back `running` - and the most recent run in the
 * history is exactly the one that can still be in flight while the screen is
 * open. A union that cannot express it forces every reader into the "finished"
 * branch, which is the console's oldest mistake: telling IN FLIGHT from
 * ANSWERED.
 */
export type RosterSyncStatus =
  | "running"
  | "completed"
  | "partial_manual_review"
  | "failed";

/** One row of the D10b data-flow disclosure, server-supplied. */
export interface SsoDataFlowCategory {
  key: string;
  description: string;
  purpose: string;
}

/**
 * TODO(api): WHO CONNECTED THIS, AND WHEN.
 *
 * D10b prints a provenance line above the reauthorise panel - "Connected by
 * Mr. Idris Bello on 12 March 2026" - and there is nothing here to build it
 * from. The three instants below are each a different event:
 * `reauthorisedAt` is the last renewal, `connectionCheckedAt` is a health
 * probe, `disconnectedAt` is the end. None is the beginning, and no field
 * anywhere names the person.
 *
 * Wanted: `connectedByName` and `connectedAt`, both nullable for a
 * connection made before they existed. The line stays unbuilt until then.
 * Dating it from `reauthorisedAt` would put the wrong date, very often the
 * wrong year, under the words "Connected by" - on the panel a school reads
 * when it is deciding whether an expiry is expected or suspicious.
 */
export interface SsoStatus {
  provider: SsoProvider;
  status: SsoConnectionStatus;
  schoolUrlSlug: string;
  schoolEntryUrl: string;
  lastConnectionError: string | null;
  connectionCheckedAt: string | null;
  reauthorisedAt: string | null;
  lastSuccessfulSyncAt: string | null;
  nextScheduledSyncAt: string | null;
  disconnectedAt: string | null;
  /**
   * WHEN THE SIGNING CREDENTIAL LAPSES - the only fully predictable lockout in
   * the product, and invisible to us until 21 Sep.
   *
   * All three arrived together and none was read. The screen that needs them
   * (D17's IT home) had the card DELIBERATELY absent with a TODO(api) above it,
   * so the field landing and the card appearing were never going to be the same
   * event unless somebody went looking.
   *
   * WE ASKED FOR "certificateExpiresAt" AND BACKEND BUILT "credentialExpiresAt".
   * Every re-check afterwards searched for the name WE had proposed:
   * docs/BUILD_STATUS.md still records *"`certificate` is 0 occurrences
   * spec-wide"*, which was true and meant nothing. A capability we ask for can
   * be delivered under a name we did not choose. Grep for the capability.
   *
   * IT IS AN OAUTH CLIENT SECRET, NOT A SAML SIGNING CERTIFICATE. We asked for
   * the wrong thing by that name and the first build of this described the
   * wrong thing too. What Nevo holds is the secret it uses to talk to the
   * provider; the copy says "sign-in credential", which is true of what we hold.
   *
   * "credentialExpiringSoon" IS THE SERVER'S JUDGEMENT AND MUST NOT BE
   * RECOMPUTED. It is not a day comparison of ours - see rule 3. Backend's
   * window is 45 days, written here so the next reader knows what the boolean
   * MEANS, never so that anything computes it. Read the boolean; render
   * "credentialExpiresInDays" only as description.
   *
   * "credentialExpiresInDays" is NULLABLE while "credentialExpiringSoon" is
   * not, so "expiring soon, days unknown" is a real state that the copy has to
   * survive without printing "in null days".
   *
   * **NULL IS NOT HEALTH.** The expiry CANNOT BE READ BACK FROM THE PROVIDER -
   * it is recorded by hand when the connection is set up. So
   * "credentialExpiresAt: null" means THE SCHOOL NEVER TOLD US, and therefore
   * that nothing can warn them before this credential lapses. It is a state of
   * its own and the IT home renders it as one; the first version of that row
   * rendered nothing, which let the hero go on saying "Nothing needs your
   * attention" to the one school we cannot protect. Rule 5, read backwards.
   *
   * Nothing records it either: the only writes on this resource are reauthorise
   * and disconnect. TODO(api): somewhere to record an expiry without
   * reconnecting.
   */
  credentialExpiresAt: string | null;
  credentialExpiresInDays: number | null;
  credentialExpiringSoon: boolean;
  dataFlow: SsoDataFlowCategory[];
}

/**
 * THE CASING HERE IS THE API'S, NOT A CONVENTION.
 *
 * This resource is mixed and the mix is real: `SsoConnectionHealthResponse` is
 * snake_case (`schoolEntryUrl`, `lastSuccessfulSyncAt`) and
 * `RosterSyncRunResponse` is camelCase. Both are copied from the deployed
 * document rather than normalised, because a type that disagrees with the wire
 * is a cast that lies - see the note on `RosterSyncHistory`.
 */
export interface RosterSyncRun {
  id: string;
  provider: SsoProvider;
  status: RosterSyncStatus;
  importedStudents: number;
  importedTeachers: number;
  missingTeacherClassMappings: number;
  failureReason: string | null;
  triggeredManually: boolean;
  startedAt: string;
  completedAt: string | null;
  issues: RosterSyncIssue[];
}

/**
 * One row the sync could not reconcile.
 *
 * This was `issues: unknown[]` and the data has been arriving on every run all
 * along. `RosterSyncIssueResponse` is REQUIRED on `RosterSyncRunResponse` and
 * all four of its fields are required - `resolutionHint` is nullable, not
 * absent. Declaring it `unknown[]` meant the one part of a failed sync an
 * admin can actually act on was fetched and thrown away, while the screen
 * asked backend for a "raw sync log" it was never going to get.
 *
 * `externalReference` is the PROVIDER's id for the record - a Microsoft or
 * Google object id, not a Nevo one - which is the point: it is the string an
 * IT admin pastes into their own directory to find the row that failed.
 */
export interface RosterSyncIssue {
  id: string;
  externalReference: string;
  description: string;
  resolutionHint: string | null;
}

/**
 * ============================================================================
 * THIS WAS snake_case AND THE ENDPOINT ANSWERS camelCase.
 *
 * `RosterSyncHistoryResponse` is `{windowDays, successfulRuns, failedRuns,
 * runs}`, all required. The client declared `windowDays`, `successfulRuns`
 * and `failedRuns`, so every one of them read `undefined` at runtime - and
 * `SsoView` asks `(history?.failedRuns ?? 0) > 0`, which coalesced to 0 and
 * fell straight into the HEALTHY branch.
 *
 * So the defect PR #269 was written to fix - a school being told its roster
 * sync was "Healthy" while runs were failing - was still live afterwards, by a
 * different route. #269 fixed the FAILED-READ path; the field names were wrong
 * on the successful path all along.
 *
 * The tests passed because the fixtures were hand-written in snake_case,
 * copied from this interface rather than from the spec. That is the whole
 * argument for check 3 in `scripts/contract-check.mjs`, which found this.
 * ============================================================================
 */
export interface RosterSyncHistory {
  windowDays: number;
  successfulRuns: number;
  failedRuns: number;
  runs: RosterSyncRun[];
}

/**
 * WHAT STARTING A SYNC ACTUALLY RETURNS, which is not what it used to.
 *
 * `POST /admin/sso/roster-sync` answers **202 Accepted** with
 * `{runId, status, pollUrl}` - it QUEUES a run. The client typed it as a
 * finished result carrying `importedStudents`, `importedTeachers` and
 * `missingTeacherClassMappings`, and `SsoView` built its confirmation out
 * of them, so pressing "Sync now" rendered "Synced. undefined students and
 * undefined staff imported."
 *
 * The counts live on the RUN, fetched from `pollUrl` / `runDetail(runId)`,
 * which is why `GET /admin/sso/roster-sync/{run_id}` sat unconsumed.
 *
 * TODO (client, not api): poll the run and report the real counts. This was
 * tagged `TODO(api)`, which asks backend for a route the two lines above say
 * already exists - `GET /admin/sso/roster-sync/{run_id}`, typed here as
 * `runDetail`. Nothing is missing from the contract; the polling loop is ours
 * to write. Until it is, the screen says a sync has started and stops claiming
 * numbers it does not have.
 */
export interface RosterSyncAccepted {
  runId: string;
  status: RosterSyncStatus;
  pollUrl: string;
}

export interface SsoDisconnected {
  provider: SsoProvider;
  disconnectedAt: string;
  retainedUserCount: number;
}

export interface SsoReauthorisation {
  provider: SsoProvider;
  authorizationUrl: string;
  schoolEntryUrl: string;
}

export const ssoApi = {
  /** GET /api/v1/admin/sso/status - 404 means "never connected". */
  status: () => api.get<SsoStatus>("/api/v1/admin/sso/status"),

  /** GET /api/v1/admin/sso/roster-sync-history */
  syncHistory: (windowDays?: number) =>
    api.get<RosterSyncHistory>("/api/v1/admin/sso/roster-sync-history", {
      params: windowDays ? { windowDays: windowDays } : undefined,
    }),

  /** POST /api/v1/admin/sso/roster-sync - queues a run, 202 Accepted. */
  rosterSync: () =>
    api.post<RosterSyncAccepted>("/api/v1/admin/sso/roster-sync"),

  /** GET /api/v1/admin/sso/roster-sync/{run_id} - where the counts live. */
  runDetail: (runId: string) =>
    api.get<RosterSyncRun>(`/api/v1/admin/sso/roster-sync/${runId}`),

  /** POST /api/v1/admin/sso/reauthorise - returns the provider's consent URL. */
  reauthorise: () =>
    api.post<SsoReauthorisation>("/api/v1/admin/sso/reauthorise"),

  /** POST /api/v1/admin/sso/disconnect - freezes the roster, deletes nothing. */
  disconnect: () =>
    api.post<SsoDisconnected>("/api/v1/admin/sso/disconnect", { confirm: true }),
};

export const PROVIDER_LABELS: Record<SsoProvider, string> = {
  microsoft: "Microsoft 365",
  google: "Google Workspace",
};
