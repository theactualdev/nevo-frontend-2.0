"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BASE_URL } from "@/lib/api";
import {
  schoolIntelligenceApi,
  type ComplianceAudit,
} from "@/lib/api/schoolIntelligence";
import { getToken } from "@/lib/auth/session";
import { cn } from "@/lib/utils";
import {
  consentCoverage,
  labelHero,
  ndpaClaims,
  type ConsentInput,
  type RetentionInput,
} from "./ndpaClaims";
import { studentsApi } from "@/lib/api/students";
import { schoolApi } from "@/lib/api/school";
import { NoAccess, failureKind } from "../NoAccess";

/**
 * D22 NDPA compliance audit - the drill-down that turns the Overview's
 * compliance card into evidence a SENCo can stand behind in front of a parent
 * or a regulator.
 *
 * The hero is the whole point: not zero shown, zero STORED. Every other claim
 * on the page exists to protect that one - which is why it is now derived
 * from the count rather than asserted beside it. See `ndpaClaims.ts`: the
 * prose here used to say "Nevo has never assigned or recorded a diagnostic
 * category" directly beneath a live number that can come back non-zero.
 *
 * Claim states are honest about their own provenance - see `ndpaClaims.ts`.
 * Only "zero diagnostic labels" is verified from live data; three claims
 * describe architecture rather than a per-school measurement; and three need
 * school data no endpoint returns, so they carry their mechanism with no state
 * chip. On a compliance screen, an invented figure is the worst possible bug.
 *
 * The export is real: `GET /api/admin/compliance-audit/report.pdf`. It is
 * fetched with the Bearer token and handed to the browser as a blob, because
 * the endpoint is behind auth and a bare link would arrive unauthenticated.
 *
 * Export wording is placeholder pending counsel - the frame says so, and the
 * page repeats it rather than letting anyone assume otherwise.
 */

const CARD = "rounded-xl bg-nevo-cream-elevated shadow-[0_2px_8px_rgba(0,0,0,0.06)]";

type Phase = "loading" | "ready" | "failed" | "denied";
type Export = "idle" | "working" | "done" | "failed";

/**
 * Flip to true when backend has confirmed the PDF carries neither `term` nor
 * `recordId`. A constant rather than a deletion, so the wiring below stays
 * under test and the reason is greppable.
 */
const EXPORT_CLEARED_BY_COUNSEL = false;

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ComplianceView() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [audit, setAudit] = useState<ComplianceAudit | null>(null);
  const [exporting, setExporting] = useState<Export>("idle");
  /*
   * Two rows are MEASURED from this school rather than asserted about the
   * product, so they need two reads the audit does not carry. Both start
   * "unreadable" and both own their own failure: a roster that will not answer
   * must cost this page a figure, never the page. The audit is still the only
   * call that can set `phase`.
   */
  const [consent, setConsent] = useState<ConsentInput>("unreadable");
  const [retention, setRetention] = useState<RetentionInput>("unreadable");

  const load = useCallback(() => {
    schoolIntelligenceApi
      .complianceAudit()
      .then((a) => {
        setAudit(a);
        setPhase("ready");
      })
      .catch((err: unknown) => setPhase(failureKind(err)));

    studentsApi
      .list()
      .then((rows) => setConsent(consentCoverage(rows)))
      .catch(() => setConsent("unreadable"));

    schoolApi
      .get()
      .then((school) =>
        setRetention(
          typeof school.retentionDays === "number" && school.retentionPolicy
            ? { policy: school.retentionPolicy, days: school.retentionDays }
            : "unreadable",
        ),
      )
      .catch(() => setRetention("unreadable"));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const exportReport = () => {
    if (exporting === "working") return;
    setExporting("working");
    // The endpoint is behind auth, so a plain <a href> would arrive without a
    // token. Fetch it, then hand the browser a blob.
    fetch(`${BASE_URL}/api/admin/compliance-audit/report.pdf`, {
      headers: { Authorization: `Bearer ${getToken() ?? ""}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "nevo-ndpa-compliance-audit.pdf";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        setExporting("done");
        setTimeout(() => setExporting("idle"), 2600);
      })
      .catch(() => setExporting("failed"));
  };

  const labels = audit?.diagnosticLabelsStored ?? 0;
  const hero = labelHero(labels, "audit");
  const claims = ndpaClaims({ labels, consent, retention });

  return (
    <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
      <div className="mx-auto max-w-[820px]">
        <Link
          href="/admin/dashboard"
          className="text-[13.5px] font-medium text-nevo-navy hover:underline"
        >
          &larr; School Overview
        </Link>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-[23px] font-semibold tracking-[-0.015em] text-nevo-near-black xl:text-[26px]">
              NDPA 2023 compliance audit
            </h2>
            {audit && (
              <p className="mt-1.5 text-[15px] text-nevo-near-black/60">
                {`${audit.schoolName} · last full check ${fmtDate(audit.generatedAt)}`}
              </p>
            )}
          </div>
          {/*
            * THE EXPORT IS HELD, and it is the one thing on this screen that
            * counsel's ruling does not reach.
            *
            * They cleared what the SCREEN may show: category and status, never
            * the flagged term, never the recordId. This button hands over a
            * PDF that BACKEND composes - its 200 is an empty schema, so the
            * contract constrains nothing - and the obvious contents of a
            * compliance report are exactly the two fields we were told to
            * withhold. A rule kept on screen and broken by a download is not
            * kept.
            *
            * Nothing of value is lost by holding it today: the file has been
            * arriving corrupt anyway, because the proxy decoded it as UTF-8
            * (fixed in this change, which is what makes the question live).
            *
            * Restore it when backend confirms in writing what the PDF
            * contains, and route it through `api.blob` rather than the
            * hand-rolled fetch below.
            */}
          {EXPORT_CLEARED_BY_COUNSEL && phase === "ready" && (
            <button
              type="button"
              onClick={exportReport}
              disabled={exporting === "working"}
              className="h-[46px] shrink-0 cursor-pointer rounded-[10px] bg-nevo-navy px-5 text-sm font-semibold text-nevo-cream transition-[filter] hover:brightness-110 active:brightness-93 disabled:cursor-wait disabled:opacity-70"
            >
              {exporting === "working"
                ? "Preparing report…"
                : exporting === "done"
                  ? "Report downloaded"
                  : exporting === "failed"
                    ? "Try the export again"
                    : "Export report (PDF)"}
            </button>
          )}
        </div>

        {phase === "loading" && (
          <div className={cn(CARD, "mt-6 h-[260px] animate-pulse")} />
        )}

        {phase === "denied" && <NoAccess what="the compliance audit" />}
        {phase === "failed" && (
          <div className={cn(CARD, "mt-6 px-[26px] py-7")}>
            <h3 className="text-[17px] font-semibold text-nevo-near-black">
              We couldn&rsquo;t load the compliance audit
            </h3>
            <p className="mt-2 max-w-[52ch] text-sm leading-[1.55] text-nevo-near-black/62">
              Nothing about your school&rsquo;s data has changed. Try again in a
              moment.
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

        {phase === "ready" && audit && (
          <>
            <div className={cn(CARD, "mt-6 px-[26px] py-7")}>
              <div className="flex items-baseline gap-3">
                <span className="text-[44px] leading-none font-semibold text-nevo-navy">
                  {audit.diagnosticLabelsStored}
                </span>
                <span className="text-[15px] font-semibold text-nevo-near-black">
                  {hero.unit}
                </span>
              </div>
              <p className="mt-3 max-w-[64ch] text-sm leading-[1.65] text-nevo-near-black/70">
                {hero.body}
              </p>
            </div>

            {/* Also when the server says the check did not pass. `compliant`
                was fetched and never read, so an audit the backend marked
                false rendered as a clean page whenever `findings` was empty.
                The spec documents no meaning for the flag, so this reports it
                as the server's own verdict and interprets nothing.
                Findings' CONTENTS stay off screen - see ComplianceFinding. */}
            {/*
              * ONE LINE, NOT A LIST. Design ruled on 14 Sep that the
              * diagnostic-label scan is an INTERNAL Zero-Tag enforcement tool
              * and not an admin-facing feature at all.
              *
              * The reasoning is worth keeping, because it reverses a whole
              * PR's worth of work and the reversal is right: once `term` and
              * `recordId` are stripped - and counsel required both - a finding
              * is a database locator. `student_profiles` / `notes` tells an
              * administrator nothing and gives them nothing to act on. A row
              * per finding was detail without meaning.
              *
              * So the school is told the two things it can use: when we last
              * checked, and whether it came back clean. Anything found is ours
              * to handle, not theirs to read.
              *
              * `compliant` and the finding COUNT both feed "clean", because
              * either can say otherwise and the spec documents no meaning for
              * the flag - so it is reported as the server's own verdict rather
              * than interpreted.
              */}
            <div className={cn(CARD, "mt-4 px-[26px] py-6")}>
              <h3 className="text-[16px] font-semibold text-nevo-near-black">
                {audit.findings.length === 0 && audit.compliant
                  ? "The last check came back clean"
                  : "The last check flagged something"}
              </h3>
              <p className="mt-2 max-w-[62ch] text-sm leading-[1.55] text-nevo-near-black/66">
                {`Checked ${fmtDate(audit.generatedAt)}. `}
                {audit.findings.length === 0 && audit.compliant
                  ? "Nothing of the kind this check looks for is held about your students."
                  : "We're looking into it, and we'll come to you if anything is needed from your side."}
              </p>
            </div>

            <h3 className="mt-8 text-[13.5px] font-semibold tracking-[0.04em] text-nevo-near-black/55 uppercase">
              Verifiable claims
            </h3>
            <div className={cn(CARD, "mt-3 overflow-hidden")}>
              {claims.map((c, i) => {
                const verified =
                  c.verification === "labels"
                    ? audit.diagnosticLabelsStored === 0
                      ? "Verified"
                      : "Needs review"
                    : c.verification === "product" || c.verification === "school"
                      ? c.state
                      : null;
                return (
                  <div
                    key={c.title}
                    className={cn(
                      "px-[22px] py-[18px]",
                      i < claims.length - 1 &&
                        "border-b border-nevo-near-black/7",
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-[15px] font-semibold text-nevo-near-black">
                        {c.title}
                      </span>
                      {verified ? (
                        <span className="rounded-full bg-nevo-navy/14 px-[11px] py-1 text-[12px] font-semibold text-nevo-navy">
                          {verified}
                        </span>
                      ) : (
                        <span className="rounded-full bg-nevo-violet/24 px-[11px] py-1 text-[12px] font-semibold text-nevo-navy">
                          Not verified here
                        </span>
                      )}
                    </div>
                    <p className="mt-2 max-w-[68ch] text-sm leading-[1.6] text-nevo-near-black/70">
                      {c.mechanism}
                    </p>
                    <p className="mt-2 text-[13px] text-nevo-near-black/50">
                      <span className="font-semibold">Evidence:</span>{" "}
                      {c.evidence}
                      {c.verification === "labels"
                        ? ` · Last checked: ${fmtDate(audit.generatedAt)}`
                        : ""}
                    </p>
                    {/* A row that cannot show a figure says WHY, in its own
                        words where it has them. "Sits outside the audit" was
                        true of all four rows when none could be measured; two
                        can now, and the remaining reasons differ. */}
                    {c.verification === "unverified" && (
                      <p className="mt-1.5 text-[13px] leading-[1.5] text-nevo-near-black/50 italic">
                        {c.note ??
                          "This figure isn’t reachable from here yet – the register it comes from sits outside the audit."}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {/*
              * The export sentence follows the export button. It promised "the
              * exported report" to a school whose export button is switched
              * off until counsel clears the PDF - a control the page does not
              * offer.
              */}
            <p className="mt-4 max-w-[68ch] text-[13px] leading-[1.6] text-nevo-near-black/55">
              {EXPORT_CLEARED_BY_COUNSEL
                ? "The exported report carries the same claims and evidence in a form you can print or hand to a parent. "
                : null}
              Wording in this version is placeholder, in the same structure as
              the DPA; final language is owned by counsel. Consent is summarised
              as coverage only &ndash; never per-child detail, which stays out
              of admin scope.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
