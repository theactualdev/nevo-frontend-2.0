"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { schoolApi, type School } from "@/lib/api/school";
import {
  PROVIDER_LABELS,
  ssoApi,
  type RosterSyncHistory,
  type SsoStatus,
} from "@/lib/api/sso";
import { timeAgo } from "@/lib/relativeTime";
import { latestRun } from "@/lib/rosterSync";
import { cn } from "@/lib/utils";
import { NoAccess, failureKind } from "../NoAccess";
import { attentionCount, itHomeRows } from "./itHomeRows";

/**
 * D17 IT Admin Home - where an IT administrator lands, instead of a dashboard
 * they cannot open.
 *
 * Sign-in used to route every persona to the Overview because this screen and
 * the finance one did not exist. The Overview is gated on `oversight`, which an
 * IT contractor does not hold, so their first sight of Nevo was a refusal. See
 * `adminHomeForScopes`.
 *
 * ONE THING THE FRAME DRAWS THAT THE CONTRACT CANNOT FILL:
 *
 * - "2 connected · Microsoft + Google". `GET /admin/sso/status` returns ONE
 *   `SsoConnectionHealthResponse` with a single `provider`. One provider per
 *   school is what the data model says, so the card NAMES the provider rather
 *   than counting providers. This is a product question, not a missing
 *   endpoint - do not file it as one.
 *
 * THE SECOND ONE IS NOW BUILT. "SSO signing certificate renews in 40 days" sat
 * here for weeks as a deliberate absence, under a `TODO(api)` asking for a
 * certificate expiry. Backend shipped it on 21 Sep as `credentialExpiresAt` /
 * `credentialExpiresInDays` / `credentialExpiringSoon`, and we did not notice
 * for a day because every re-check grepped for "certificate" - the word in OUR
 * ask, not the word in THEIR schema. It renders as a glance row rather than a
 * standalone card, so it sorts against everything else wanting attention
 * instead of competing with it. See `itHomeRows`.
 *
 * A FAILED HISTORY READ NEVER READS AS HEALTH. The reassuring clause is
 * suppressed and replaced with the admission - the same correction D10 needed
 * when `failedRuns ?? 0` quietly turned an unread history into "Healthy".
 */

const CARD = "rounded-xl bg-nevo-cream-elevated shadow-[0_2px_8px_rgba(0,0,0,0.06)]";

type Phase = "loading" | "ready" | "failed" | "denied";

function todayLine(): string {
  return new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

const DOT: Record<string, string> = {
  soft: "size-[10px] rounded-full bg-nevo-violet",
  flag: "size-[9px] rounded-full border-2 border-nevo-navy/60",
  neutral: "size-[9px] rounded-full bg-nevo-near-black/28",
};

export function ItHomeView() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [status, setStatus] = useState<SsoStatus | null>(null);
  const [school, setSchool] = useState<School | null>(null);
  const [history, setHistory] = useState<RosterSyncHistory | null>(null);
  /** Distinct from `history === null`, which is also the not-yet-loaded state. */
  const [historyFailed, setHistoryFailed] = useState(false);

  const load = useCallback(() => {
    /*
     * The school read runs ALONGSIDE the status read, never behind it: status
     * 404s in exactly the state where the school code matters, so chaining
     * would lose the code precisely when it is the answer.
     */
    schoolApi
      .get()
      .then(setSchool)
      .catch(() => setSchool(null));

    ssoApi
      .status()
      .then((s) => {
        setStatus(s);
        setPhase("ready");
        return ssoApi
          .syncHistory()
          .then((h) => {
            setHistory(h);
            setHistoryFailed(false);
          })
          .catch(() => setHistoryFailed(true));
      })
      .catch((err: unknown) => {
        // A school that never connected a provider gets a 404. That is the
        // ordinary "nothing connected yet" state, not a failure.
        if (err instanceof ApiError && err.status === 404) {
          setStatus(null);
          setPhase("ready");
          return;
        }
        setPhase(failureKind(err));
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows = itHomeRows(status, history, historyFailed);
  const attention = attentionCount(rows);
  const run = latestRun(history);
  const provider = status ? PROVIDER_LABELS[status.provider] : null;
  const connected = status?.status === "connected";

  const hero = (() => {
    if (!status) {
      return {
        title: "No sign-in provider is connected",
        body: school?.code
          ? `Everyone signs in with your school code, ${school.code}. Every account, class and piece of work stays exactly as it is.`
          : "Everyone signs in with your school code. Every account, class and piece of work stays exactly as it is.",
      };
    }
    if (status.status === "needs_attention") {
      return {
        title: "Sign-in is working; our access needs renewing",
        body: `Our access to ${provider} has expired. Everyone can still sign in; new accounts and roster updates are paused until it's reconnected.`,
      };
    }
    if (status.status === "disconnected") {
      return {
        title: "No sign-in provider is connected",
        body: school?.code
          ? `Everyone signs in with your school code, ${school.code}. Every account, class and piece of work stays exactly as it is.`
          : "Everyone signs in with your school code. Every account, class and piece of work stays exactly as it is.",
      };
    }
    const synced = `Staff and students sign in with ${provider}, and the directory last synced ${timeAgo(status.lastSuccessfulSyncAt)}.`;
    if (historyFailed) {
      return {
        title: "Connected and syncing",
        body: `${synced} We couldn't read the sync history just now, so this doesn't account for failed runs.`,
      };
    }
    if (attention === 0) {
      return {
        title: "Everything is connected and syncing",
        body: `${synced} Nothing needs your attention.`,
      };
    }
    return {
      title: "Connected and syncing",
      body: `${synced} ${attention} thing${attention === 1 ? "" : "s"} below ${attention === 1 ? "is" : "are"} worth a glance. Nobody is blocked from signing in.`,
    };
  })();

  return (
    <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
      <div className="mx-auto max-w-[860px]">
        <p className="m-0 text-[13px] text-nevo-near-black/55">{todayLine()}</p>
        <h2 className="mt-1.5 text-[23px] font-semibold tracking-[-0.018em] text-nevo-near-black xl:text-[28px]">
          Systems overview
        </h2>

        {phase === "loading" && (
          <div className={cn(CARD, "mt-6 h-[220px] animate-pulse")} />
        )}
        {phase === "denied" && <NoAccess what="sign-in and directory sync" />}
        {phase === "failed" && (
          <div className={cn(CARD, "mt-6 px-[26px] py-7")}>
            <h3 className="text-[17px] font-semibold text-nevo-near-black">
              We couldn&rsquo;t load your sign-in setup
            </h3>
            <p className="mt-2 max-w-[52ch] text-sm leading-[1.55] text-nevo-near-black/62">
              Nothing has changed for your school. Try again in a moment.
            </p>
            <button
              type="button"
              onClick={() => {
                setPhase("loading");
                load();
              }}
              className="mt-5 h-[46px] cursor-pointer rounded-[10px] bg-nevo-navy px-5 text-sm font-semibold text-nevo-cream transition-[filter] hover:brightness-110 active:brightness-93"
            >
              Try again
            </button>
          </div>
        )}

        {phase === "ready" && (
          <>
            <div className={cn(CARD, "mt-[26px] px-[34px] py-[30px]")}>
              <div className="flex items-start gap-3.5">
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-[7px] shrink-0",
                    connected && attention === 0
                      ? DOT.neutral
                      : status?.status === "needs_attention"
                        ? DOT.soft
                        : DOT.neutral,
                  )}
                />
                <div className="min-w-0">
                  <h3 className="m-0 text-[19px] font-semibold text-nevo-near-black">
                    {hero.title}
                  </h3>
                  <p className="mt-2 max-w-[62ch] text-[15px] leading-[1.55] text-nevo-near-black/68">
                    {hero.body}
                  </p>
                </div>
              </div>
            </div>

            <h3 className="mt-9 text-[13px] font-semibold tracking-[0.05em] text-nevo-near-black/50 uppercase">
              At a glance
            </h3>
            <div className="mt-3 flex flex-wrap gap-3.5">
              <GlanceTile
                label="Sign-in"
                value={status ? (provider ?? "Connected") : "School code"}
                sub={
                  status?.status === "connected"
                    ? "Connected"
                    : status?.status === "needs_attention"
                      ? "Needs reauthorising"
                      : school?.code
                        ? `Code ${school.code}`
                        : "Not connected"
                }
              />
              <GlanceTile
                label="Directory sync"
                value={status ? timeAgo(status.lastSuccessfulSyncAt) : "Not syncing"}
                sub={
                  !status
                    ? "No provider connected"
                    : historyFailed
                      ? "Run history unavailable"
                      : (history?.failedRuns ?? 0) > 0
                        ? `${history?.failedRuns} failed in ${history?.windowDays} days`
                        : history
                          ? `${history.successfulRuns} successful in ${history.windowDays} days`
                          : "No runs yet"
                }
              />
              {/* Absent rather than zero when no run has been read: "0
                  imported" is a claim about a sync we have not seen. */}
              {run ? (
                <GlanceTile
                  label="Provisioning"
                  value={
                    run.status === "running"
                      ? "Running"
                      : String(run.importedStudents + run.importedTeachers)
                  }
                  sub="Imported by the last sync"
                />
              ) : null}
            </div>

            {rows.length > 0 && (
              <>
                <h3 className="mt-9 text-[13px] font-semibold tracking-[0.05em] text-nevo-near-black/50 uppercase">
                  Worth a glance
                </h3>
                <div className={cn(CARD, "mt-3 overflow-hidden")}>
                  {rows.map((r, i) => (
                    <Link
                      key={r.key}
                      href={r.href}
                      className={cn(
                        "flex items-center gap-[15px] px-[22px] py-[18px] transition-[filter] hover:brightness-[0.985]",
                        i < rows.length - 1 && "border-b border-nevo-near-black/7",
                      )}
                    >
                      <span aria-hidden="true" className={cn("shrink-0", DOT[r.kind])} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-[15px] font-semibold text-nevo-near-black">
                          {r.title}
                        </span>
                        <span className="mt-0.5 text-[13px] text-nevo-near-black/58">
                          {r.sub}
                        </span>
                      </span>
                      <span className="shrink-0 text-[13.5px] font-semibold text-nevo-navy">
                        {r.action} &rarr;
                      </span>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function GlanceTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className={cn(CARD, "min-w-[196px] flex-1 px-6 py-[22px]")}>
      <span className="text-[11px] font-bold tracking-[0.14em] text-nevo-violet uppercase">
        {label}
      </span>
      <div className="mt-2 text-[21px] font-semibold text-nevo-near-black">
        {value}
      </div>
      <div className="mt-1 text-[13px] text-nevo-near-black/58">{sub}</div>
    </div>
  );
}
