"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  schoolIntelligenceApi,
  type ComplianceAudit,
} from "@/lib/api/schoolIntelligence";
import { cn } from "@/lib/utils";
import { labelHero } from "../Compliance/ndpaClaims";
import {
  STEP_CONSENT,
  STEP_STUDENTS,
  STEP_TEACHERS,
  STEP_WORKSPACE,
  consentRequestsSent,
  gettingStartedSteps,
  teachersOnRoster,
} from "./overviewGettingStarted";
import { SetupPausedBanner } from "../SetupPausedBanner";
import { SchoolCodeCard } from "./SchoolCodeCard";
import { useSetupGate } from "@/hooks/useSetupGate";
import {
  readOnboarding,
  schoolApi,
  type EnrolmentBand,
  type SchoolNarrative,
  type SchoolRosterCounts,
} from "@/lib/api/school";
import { glanceRows } from "./overviewGlance";
import { setUpAgo, type SetUpAgo } from "./setUpAgo";
import { boardPackText } from "./boardPack";
import {
  SNAPSHOT_HEADING,
  SNAPSHOT_HEADING_EARLY,
  pendingTeacherInvites,
  snapshotColumns,
  snapshotTiles,
} from "./snapshotTiles";
import { intelligenceApi, type AttentionFlag } from "@/lib/api/intelligence";
import { invitesApi } from "@/lib/api/invites";
import { studentsApi, type AdminStudentRow } from "@/lib/api/students";
import { NoAccess, failureKind } from "../NoAccess";

/**
 * D04 Overview Dashboard - the first thing a general-oversight admin sees,
 * built to answer "why are we paying for this" in ten seconds. Narrative-first,
 * with a light activity snapshot under it. Dense metrics live in Reports.
 *
 * WHAT IS REAL. `GET /api/admin/compliance-audit` carries the school name and
 * three genuine school-wide numbers - students profiled, adaptation events
 * logged, and diagnostic labels stored - so the compliance card and the
 * snapshot are not fixtures. The compliance card is the important one: the
 * whole NDPA claim is that Nevo holds no diagnostic label about any child, and
 * this is the number that proves it.
 *
 * WHAT IS NOT. The "worth a glance" roll-up has no endpoint behind it, and
 * renders the frame's copy marked as a sample rather than passing for this
 * school's own position.
 *
 * THE NARRATIVE USED TO BE NAMED HERE TOO, and stopped being true on 7 Sep
 * without this sentence noticing. `GET /api/v1/school/narrative` exists and is
 * consumed in `load()` below; the board summary is the school's own.
 *
 * The frame's other two snapshot stats said "classes active, teachers active -
 * have no source at all". Half of that is wrong, and the counts are rendered
 * 250 lines below: `GET /api/v1/school/overview` carries `SchoolRosterCounts`,
 * so the HEADCOUNTS are real. What has no source is ACTIVITY - no per-class or
 * per-teacher recency field exists anywhere in the contract - so the cards
 * count classes and teachers rather than claiming either is active.
 *
 * The early state is chosen by a real signal: a school with nothing in the
 * adaptation log has not started teaching yet, and the frame's early copy is
 * simply true of it - so that variant is NOT marked as a sample.
 *
 * That gate used to cover the narrative ONLY. The roll-up below it always
 * rendered "Worth a glance", so a school with no students was told "6 students
 * are waiting on parent consent" and "2 classes haven't run a lesson yet" -
 * three invented counts, under a note admitting they were invented. D04 draws
 * a different roll-up for that school ("Getting started"), and now so does
 * this: the sample roll-up is live-school only, and the early school gets the
 * checklist. See `overviewGettingStarted.ts` for what a tick is allowed to
 * claim.
 *
 * PER-CARD FAILURE, NOT PER-PAGE. SCRUM-39 is explicit - "Couldn't load:
 * per-card, not whole-screen ... the rest of the dashboard still renders" -
 * and this screen did the opposite: `complianceAudit()` was the one uncaught
 * read in the `Promise.all`, so a 500 on it blanked the board summary, the
 * roster counts and the roll-up along with it. It is settled rather than
 * rejected now, and the only failure still owed the whole page is a 403, which
 * is not a failure at all: it is this admin not holding `oversight`, and a
 * dashboard of empty cards would be a worse answer than saying so.
 *
 * TODO(api): a roll-up of things needing a decision, and per-class or
 * per-teacher ACTIVITY. (This asked for a narrative endpoint as well, which
 * had already landed, and for "activity counts", which conflated headcounts
 * that exist with recency that does not.) Two of D04's three rows are built
 * client-side now - see `overviewGlance.ts`. The third, "classes that haven't
 * run a lesson", is not drawn at all: it has no source, and a real school was
 * being shown two invented class names under a note. Ruled v1.5.
 * Both cards open their drill-down: the compliance card to D22, and the
 * adaptations figure to D21.
 *
 * TODO(api): A PERIOD. SCRUM-39's data line asks for
 * `GET overview { period, classes_active/total, teachers_active/total,
 * students_active/total, adaptations_count, ... }` and the frame draws the
 * period pill as a control - "This half-term" with a caret. Nothing deployed
 * carries a period or accepts a date filter for these figures, so the pill
 * here states the scope the data actually has and is not a switcher: offering
 * a control that cannot change anything is worse than not drawing it, and
 * labelling the figures "this half-term" would be false of every one of them.
 * See `snapshotTiles.ts` for the same reasoning about the section heading.
 */

const CARD = "rounded-xl bg-nevo-cream-elevated shadow-[0_2px_8px_rgba(0,0,0,0.06)]";

/**
 * No "failed". A read that fails costs its own card now, and the page renders
 * around it - so the only thing that can still stop the whole screen is a
 * scope this admin does not hold.
 */
type Phase = "loading" | "ready" | "denied";

/** A card that loads, and fails, on its own. */
type CardPhase = "loading" | "ready" | "failed";

/** D04's two board-pack glyphs, traced from the frame. */
function CopyGlyph() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="11" height="11" rx="2.2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckGlyph() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function todayLine(): string {
  return new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** "15 September", or null for a date string we cannot read. */
function onDay(iso: string): string | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
}

export function OverviewView() {
  /*
   * D01b AC-05. Paused is never true on a failed read, so a broken gate leaves
   * this screen exactly as it was rather than greying every action on it.
   */
  const setup = useSetupGate();
  const [phase, setPhase] = useState<Phase>("loading");
  const [audit, setAudit] = useState<ComplianceAudit | null>(null);
  const [auditPhase, setAuditPhase] = useState<CardPhase>("loading");
  const [adaptationTotal, setAdaptationTotal] = useState<number | null>(null);
  /** The commercial band, for the one denominator that has a source. */
  const [band, setBand] = useState<EnrolmentBand | undefined>(undefined);
  /** The school's own name, from its record - see `school` below. */
  const [schoolName, setSchoolName] = useState<string | null>(null);
  /** When the school finished setting up - D04's early-life "Set up 3 days ago". */
  const [setUp, setSetUp] = useState<SetUpAgo | null>(null);
  const [narrative, setNarrative] = useState<SchoolNarrative | null>(null);
  const [narrativeFailed, setNarrativeFailed] = useState(false);
  const [counts, setCounts] = useState<SchoolRosterCounts | null>(null);
  /** Open teacher invitations, for the teachers tile. Null when unread. */
  const [pendingTeachers, setPendingTeachers] = useState<number | null>(null);
  /*
   * The two roll-up rows that are this school's own. Both stay NULL until a
   * read completes, and a read that fails leaves them null - the row is then
   * absent rather than reported as zero. `null` is also the first-render value,
   * which is correct here: we have not asked yet, so we have nothing to say.
   */
  const [roster, setRoster] = useState<AdminStudentRow[] | null>(null);
  /** Read for the getting-started sign-in row only. Null means unread. */
  const [flags, setFlags] = useState<AttentionFlag[] | null>(null);

  const load = useCallback(() => {
    Promise.all([
      /*
       * SETTLED, NOT REJECTED. This read used to be the only bare one here, so
       * a 500 on the compliance audit took the board summary, the roster
       * counts and the roll-up down with it - on a dashboard whose spec says
       * in as many words that a card which cannot load must not cost the page.
       *
       * The error survives the catch because ONE of its outcomes is still the
       * page's: a 403 means this admin does not hold `oversight`, and a
       * dashboard of blank cards would be a worse answer than telling them.
       */
      schoolIntelligenceApi
        .complianceAudit()
        .then((a) => ({ ok: true as const, a }))
        .catch((err: unknown) => ({ ok: false as const, err })),
      schoolIntelligenceApi.adaptationLog({ limit: 1 }).catch(() => null),
      // The board narrative and the roster counts are their own cards and
      // their own failures - neither should take the page down.
      schoolApi.narrative().catch(() => null),
      schoolApi.overview().catch(() => null),
      // The SSO status read that sat here fed only the checklist's sign-in
      // tick, which went when the row became "Share your school code"
      // (manual-only launch). One request fewer on every Overview load.
    ]).then(([res, log, n, ov]) => {
      if (!res.ok && failureKind(res.err) === "denied") {
        setPhase("denied");
        return;
      }
      const a = res.ok ? res.a : null;
      setAudit(a);
      setAuditPhase(res.ok ? "ready" : "failed");
      setNarrative(n);
      setNarrativeFailed(n === null);
      setCounts(ov ? ov.counts : null);
      /*
       * NULL WHEN WE DID NOT READ IT, and it used to be `?? 0`. That mattered
       * only once the audit stopped gating the page: a zero here is the signal
       * that picks the EARLY-LIFE variant, so coalescing an unread total to
       * zero would greet a school of three hundred with "Welcome to Nevo -
       * there's nothing to report on learning just yet".
       */
      setAdaptationTotal(log?.total ?? a?.adaptationEventsLogged ?? null);
      setPhase("ready");
    });

    // The band is a fact on the school record rather than a dashboard read,
    // and feeds one denominator. Its own call, so it can never hold the page.
    schoolApi
      .get()
      .then((sc) => {
        setBand(readOnboarding(sc).band);
        setSchoolName(sc.name?.trim() || null);
        setSetUp(setUpAgo(readOnboarding(sc).completedAt, Date.now()));
      })
      .catch(() => setBand(undefined));

    // D04's "N invitations pending" on the teachers tile. Its own read and its
    // own failure: an admin without the invitations surface still gets the
    // tile, with the headcount's own words.
    invitesApi
      .list()
      .then((rows) => setPendingTeachers(pendingTeacherInvites(rows, Date.now())))
      .catch(() => setPendingTeachers(null));

    /*
     * THE ROLL-UP READS DO NOT GATE THE PAGE, and they used to.
     *
     * They sat inside the `Promise.all` above under a comment of mine reading
     * "that must cost them one ROW, never the page" - which is the rule, while
     * the code one line below broke it. Two consequences, one of them only
     * visible in production:
     *
     *  - `allFlags()` pages up to ten SEQUENTIAL requests. The Overview's
     *    first paint was waiting for every one of them before it drew
     *    anything, on the screen that exists to answer "why are we paying for
     *    this" in ten seconds.
     *  - A read that hangs rather than fails held the whole page on its
     *    skeleton for ever. That is how the getting-started test caught this:
     *    it does not mock these two, so they never settled and `phase` never
     *    left "loading".
     *
     * The flags read is `senco`-scoped while this screen is `oversight`, so a
     * 403 here is routine rather than exceptional - all the more reason it can
     * only ever cost the row it feeds.
     */
    studentsApi
      .list()
      .then(setRoster)
      .catch(() => setRoster(null));

    intelligenceApi
      .allFlags()
      // `complete: false` means we could not read them all, and a count off a
      // partial read is a floor. Report nothing rather than a floor.
      .then((r) => setFlags(r.complete ? r.flags : null))
      .catch(() => setFlags(null));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /*
   * The board summary's own retry. Only the compliance card had one, so a
   * failed summary said "we couldn't load it" and offered nothing but a
   * page reload - which re-runs every read on the page for one card.
   */
  const retryNarrative = () => {
    setNarrativeFailed(false);
    schoolApi
      .narrative()
      .then((n) => {
        setNarrative(n);
        setNarrativeFailed(false);
      })
      .catch(() => setNarrativeFailed(true));
  };

  /*
   * "Copy for board pack". Three states, because the browser gets a vote:
   * `navigator.clipboard` is absent on an insecure origin and rejects when the
   * page is not focused or the permission is refused, and the frame's handler
   * swallows both - which tells an admin their pack is on the clipboard when
   * nothing is. `failed` says so instead.
   */
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  const copyPack = (text: string) => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
    const done = () => {
      setCopyState("copied");
      copyTimer.current = setTimeout(() => setCopyState("idle"), 2200);
    };
    try {
      const write = navigator.clipboard?.writeText(text);
      if (!write) {
        setCopyState("failed");
        return;
      }
      write.then(done, () => setCopyState("failed"));
    } catch {
      setCopyState("failed");
    }
  };

  /** The compliance card's own retry. It reloads its card, not the page. */
  const retryAudit = useCallback(() => {
    setAuditPhase("loading");
    schoolIntelligenceApi
      .complianceAudit()
      .then((a) => {
        setAudit(a);
        setAuditPhase("ready");
        // Only as a fallback: a real log total already read is the better
        // figure and must not be overwritten by the audit's lifetime count.
        setAdaptationTotal((t) => t ?? a.adaptationEventsLogged);
      })
      .catch(() => setAuditPhase("failed"));
  }, []);

  /*
   * A school with nothing in the adaptation log has not started teaching yet.
   *
   * NOT KNOWING IS NOT THE SAME AS ZERO. `null` means the read did not return,
   * and the early variant tells a school in so many words that it has not
   * begun - so an unread total renders the ordinary dashboard, where every
   * figure is free to be absent, rather than a welcome message that could be
   * flatly untrue of a school in its third term.
   */
  const early = adaptationTotal === 0;
  const glance = early ? [] : glanceRows(roster, flags);
  /*
   * THE SCHOOL RECORD'S NAME FIRST. This took the name from the compliance
   * audit alone, so when that one read failed the title - and the board pack
   * a proprietor copies for governors - said "your school", although the
   * school record, already read on this page, carries the name.
   */
  const school = schoolName ?? audit?.schoolName ?? "your school";

  const pack = boardPackText({
    school,
    narrative,
    // Null, not zero: the pack must not put a compliance figure on a
    // governor's desk on the strength of a read that did not return.
    labels: audit ? audit.diagnosticLabelsStored : null,
    adaptations: adaptationTotal,
  });

  const tiles = snapshotTiles({
    studentsProfiled: audit ? audit.studentsProfiled : null,
    adaptations: adaptationTotal,
    counts,
    band,
    early,
    pendingTeacherInvites: pendingTeachers,
  });

  return (
    <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
      <div className="mx-auto max-w-[860px]">
        <div className="flex items-start justify-between gap-5">
          <div className="min-w-0">
            <span className="text-[13px] text-nevo-near-black/55 xl:text-[13.5px]">
              {/* D04's early header: "Set up 3 days ago · Wednesday, 10 July". */}
              {phase === "ready" && early && setUp ? `Set up ${setUp.short} · ` : ""}
              {todayLine()}
            </span>
            <h2 className="mt-1 text-[23px] font-semibold tracking-[-0.015em] text-nevo-near-black xl:text-[26px]">
              {phase === "ready" ? school : "Overview"}
            </h2>
          </div>
          {/* The period pill, STATING a scope rather than offering to change
              one. The frame draws a caret and D04's own handler does nothing
              with it; there is no period-scoped read to put behind it, and
              "This half-term" would be untrue of every figure below. This is
              the scope the figures genuinely have. See the TODO(api) above. */}
          {phase === "ready" && (
            <span className="mt-1 hidden shrink-0 rounded-full border-[1.5px] border-nevo-near-black/16 px-3.5 py-2 text-[13.5px] font-medium text-nevo-near-black/60 sm:block">
              Since setup
            </span>
          )}
        </div>

        {/* D01b AC-05. Renders only while the address is unconfirmed, and
            never on a failed read - see `useSetupGate`. */}
        <SetupPausedBanner />

        {/* D01: "the school code now lives on the dashboard overview". */}
        <SchoolCodeCard />

        {phase === "loading" && (
          <div className={cn(CARD, "mt-6 h-[300px] animate-pulse")} />
        )}

        {phase === "denied" && <NoAccess what="the school overview" />}

        {phase === "ready" && (
          <>
            {/* Narrative. Real only in the early case, where the frame's copy
                happens to be true of a school that has not started. */}
            <div className={cn(CARD, "mt-6 px-[26px] py-7")}>
              <h3 className="text-[19px] font-semibold text-nevo-near-black">
                {early
                  ? `Welcome to Nevo, ${school}`
                  : (narrative?.headline ?? `What Nevo is doing for ${school}`)}
              </h3>
              {early ? (
                <>
                  <p className="mt-1 text-[13.5px] text-nevo-near-black/55">
                    Your board summary begins once lessons do
                  </p>
                  <p className="mt-4 max-w-[68ch] text-[15px] leading-[1.7] text-nevo-near-black/78">
                    {/* D04: "Brightgate Academy joined Nevo three days ago, so
                        there's nothing to report..." - the when, if we have it. */}
                    {setUp
                      ? `${school} joined Nevo ${setUp.prose}, so there’s nothing to report on learning just yet`
                      : "There’s nothing to report on learning just yet"}{" "}
                    &ndash; exactly as expected this early. As your teachers
                    begin running lessons, this space fills with a
                    plain-language account of how your students are getting on,
                    written so you could read it aloud in a governors&rsquo;
                    meeting without changing a word.
                  </p>
                </>
              ) : (
                <>
                  {/* WAS "This half-term", which this console cannot know. The
                      summary is written server-side over a window it does not
                      report; `generatedAt` is the one fact about it we hold. */}
                  <p className="mt-1 text-[13.5px] text-nevo-near-black/55">
                    {narrative && onDay(narrative.generatedAt)
                      ? `Updated ${onDay(narrative.generatedAt)}`
                      : "Your board summary"}
                  </p>
                  {narrative ? (
                    /* The school's OWN summary. `source` is a const
                       "live_school_data" in the contract, which is why the
                       sample note that used to sit here is gone rather than
                       reworded. */
                    <>
                      <p className="mt-4 max-w-[68ch] text-[15px] leading-[1.7] text-nevo-near-black/78">
                        {narrative.summary}
                      </p>
                      {narrative.highlights.length > 0 ? (
                        <ul className="mt-4 max-w-[68ch] list-disc space-y-1.5 pl-5 text-[14.5px] leading-[1.6] text-nevo-near-black/72">
                          {narrative.highlights.map((h) => (
                            <li key={h}>{h}</li>
                          ))}
                        </ul>
                      ) : null}
                    </>
                  ) : narrativeFailed ? (
                    <>
                      <p className="mt-4 max-w-[68ch] text-[15px] leading-[1.7] text-nevo-near-black/62">
                        We couldn&rsquo;t load your summary just now. Nothing has
                        changed for {school} &ndash; the figures below are still
                        live.
                      </p>
                      <button
                        type="button"
                        onClick={retryNarrative}
                        className="mt-2 cursor-pointer text-[13.5px] font-semibold text-nevo-navy hover:underline"
                      >
                        Try again
                      </button>
                    </>
                  ) : (
                    <div
                      aria-hidden
                      className="mt-4 h-16 animate-pulse rounded-lg bg-nevo-near-black/[0.06]"
                    />
                  )}

                  {/* The board-pack export. Absent, rather than disabled, when
                      there is no summary to build one around - see
                      `boardPack.ts`. The frame does not draw it on the welcome
                      variant either, which is why it sits in this branch. */}
                  {pack && (
                    <div className="mt-[22px] flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-nevo-near-black/10 pt-[18px]">
                      <span className="text-[12.5px] text-nevo-near-black/50">
                        Written in plain language for governors &ndash; no
                        scores, no jargon.
                      </span>
                      <button
                        type="button"
                        onClick={() => copyPack(pack)}
                        className="flex shrink-0 cursor-pointer items-center gap-[7px] text-sm font-semibold text-nevo-navy transition-opacity hover:opacity-[0.72]"
                      >
                        <span aria-hidden="true" className="flex">
                          {copyState === "copied" ? <CheckGlyph /> : <CopyGlyph />}
                        </span>
                        <span aria-live="polite">
                          {copyState === "copied"
                            ? "Copied for board pack"
                            : "Copy for board pack"}
                        </span>
                      </button>
                      {copyState === "failed" && (
                        <p className="w-full text-[12.5px] text-nevo-violet-text">
                          Your browser wouldn&rsquo;t let us reach the
                          clipboard. Nothing was copied &ndash; you can select
                          the summary above instead.
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* The compliance card is fully real, and is the point of the
                page. Its copy comes from `ndpaClaims.ts` because D22 states
                the same claim and the two used to word it independently -
                both asserting that nothing of the kind is held, above a live
                count that can come back non-zero. One source now, so they
                cannot drift apart again. */}
            <div className={cn(CARD, "mt-4 px-[26px] py-7")}>
              {audit ? (
                <>
                  <div className="flex items-baseline gap-3">
                    {/* NAVY AT ZERO, ALWAYS. SCRUM-39 is explicit that the
                        compliance zero is "the expected reading forever" and
                        "must not look like missing data" - the muting the
                        snapshot tiles do in the early state is deliberately
                        wrong here, and this numeral is not built from
                        `snapshotTiles.ts` for that reason. */}
                    <span className="text-[38px] leading-none font-semibold text-nevo-navy">
                      {audit.diagnosticLabelsStored}
                    </span>
                    <span className="text-[15px] font-semibold text-nevo-near-black">
                      {labelHero(audit.diagnosticLabelsStored, "overview").unit}
                    </span>
                  </div>
                  <p className="mt-3 max-w-[62ch] text-sm leading-[1.6] text-nevo-near-black/66">
                    {labelHero(audit.diagnosticLabelsStored, "overview").body}
                  </p>
                  <p className="mt-3 text-[13px] text-nevo-near-black/50">
                    {onDay(audit.generatedAt)
                      ? `Checked ${onDay(audit.generatedAt)}`
                      : "Checked"}
                    {audit.findings.length > 0
                      ? ` · ${audit.findings.length} finding${audit.findings.length === 1 ? "" : "s"} to review`
                      : ""}
                  </p>
                  <Link
                    href="/admin/compliance"
                    className="mt-4 inline-block text-[13.5px] font-semibold text-nevo-navy hover:underline"
                  >
                    What we store &rarr;
                  </Link>
                </>
              ) : auditPhase === "failed" ? (
                /* SCRUM-39's per-card failure, in its own words. It must not
                   read as a compliance finding: nothing about this school's
                   store has changed, we simply could not read it. */
                <>
                  <h3 className="text-[15px] font-semibold text-nevo-near-black">
                    Diagnostic labels stored
                  </h3>
                  <p className="mt-2 max-w-[52ch] text-sm leading-[1.6] text-nevo-violet-text">
                    We couldn&rsquo;t pull this in just now. We&rsquo;re on it.
                  </p>
                  <button
                    type="button"
                    onClick={retryAudit}
                    className="mt-4 cursor-pointer text-[13.5px] font-semibold text-nevo-navy hover:underline"
                  >
                    Try again
                  </button>
                </>
              ) : (
                <div
                  aria-hidden
                  className="h-20 animate-pulse rounded-lg bg-nevo-near-black/[0.06]"
                />
              )}
            </div>

            <h3 className="mt-8 text-[13.5px] font-semibold tracking-[0.04em] text-nevo-near-black/55 uppercase">
              {early ? SNAPSHOT_HEADING_EARLY : SNAPSHOT_HEADING}
            </h3>
            {/* Which tiles exist, what each may claim and when a zero is
                greyed all live in `snapshotTiles.ts`, tested. The frame lays
                these out as one flex row; the grid steps to the tile count at
                `xl` so 1440 is a single row and 1024 keeps the spec's 2 x 2. */}
            {tiles.length > 0 && (
              <div
                className={cn(
                  "mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2",
                  snapshotColumns(tiles.length),
                )}
              >
                {tiles.map((t) => (
                  <div key={t.key} className={cn(CARD, "px-[22px] py-5")}>
                    <div className="flex items-baseline gap-[7px]">
                      <span
                        className={cn(
                          "text-[30px] leading-none font-semibold",
                          // Navy, per the frame and SCRUM-39. Muted only for an
                          // early-life zero, which reads as "not yet" rather
                          // than as a figure that should be higher.
                          t.muted ? "text-nevo-near-black/32" : "text-nevo-navy",
                        )}
                      >
                        {t.value.toLocaleString("en-GB")}
                      </span>
                      {t.of && (
                        <span className="text-[15px] font-medium text-nevo-near-black/40">
                          {t.of}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-[14.5px] font-semibold text-nevo-near-black">
                      {t.label}
                    </p>
                    <p className="mt-px text-[13px] text-nevo-near-black/58">
                      {t.desc}
                    </p>
                    {t.href && t.cta && (
                      <Link
                        href={t.href}
                        className="mt-3 inline-block text-[13.5px] font-semibold text-nevo-navy hover:underline"
                      >
                        {t.cta} &rarr;
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/*
              * NO ROWS, NO SECTION. "Worth a glance" only ever holds rows this
              * school's own reads produced; with none, a heading over empty
              * space would read as a list that failed to load, and a line
              * saying nothing needs a look would be a claim - a read that
              * failed also yields no rows.
              */}
            {(early || glance.length > 0) && (
              <h3 className="mt-8 text-[13.5px] font-semibold tracking-[0.04em] text-nevo-near-black/55 uppercase">
                {early ? "Getting started" : "Worth a glance"}
              </h3>
            )}

            {early ? (
              <div className={cn(CARD, "mt-3 overflow-hidden")}>
                {gettingStartedSteps(school).map((k, i) => {
                  // A tick is a claim about this school, so it is only ever set
                  // from a signal we hold. The rest carry no mark at all rather
                  // than an unticked box, which would assert the school has not
                  // done something we cannot see.
                  // STEP_SIGNIN ("Share your school code") never ticks: it
                  // ticked on an SSO connection, which is not what the row
                  // asks any more, and nothing reports a code being shared.
                  const done =
                    i === STEP_WORKSPACE ||
                    (i === STEP_STUDENTS && (audit?.studentsProfiled ?? 0) > 0) ||
                    (i === STEP_TEACHERS && teachersOnRoster(counts)) ||
                    (i === STEP_CONSENT && consentRequestsSent(roster));
                  const row = (
                    <>
                      <span
                        aria-hidden="true"
                        className={cn(
                          "mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                          done
                            ? "bg-nevo-navy text-nevo-cream"
                            : "border border-nevo-near-black/20 text-transparent",
                        )}
                      >
                        {done ? "✓" : ""}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-[15px] font-semibold text-nevo-near-black">
                          {k.title}
                          {done && <span className="sr-only"> (done)</span>}
                        </span>
                        <span className="mt-0.5 text-[13px] text-nevo-near-black/58">
                          {k.sub}
                        </span>
                      </span>
                      {k.cta && (
                        <span
                          className={cn(
                            "shrink-0 text-[13.5px] font-semibold",
                            k.href && !setup.writesPaused
                              ? "text-nevo-navy"
                              : "text-nevo-near-black/45",
                          )}
                        >
                          {k.cta}
                          {k.href && !setup.writesPaused ? " →" : ""}
                        </span>
                      )}
                    </>
                  );
                  const shell = cn(
                    "flex items-start gap-4 px-[22px] py-[18px]",
                    i < 4 && "border-b border-nevo-near-black/7",
                  );
                  /*
                   * D01b AC-05: every action on this list is paused while the
                   * address is unconfirmed, and each one SAYS SO - "Paused
                   * until your email is confirmed." beneath it.
                   *
                   * A LINK, NOT A DISABLED LINK. An anchor cannot be disabled;
                   * the row simply stops being one, so there is nothing to
                   * click, nothing focusable that goes nowhere, and no hover
                   * state promising something. The frame draws the same thing:
                   * the action text stays visible and greys, rather than
                   * vanishing and leaving a row that reads as already done.
                   *
                   * The note is `useSetupGate`'s, not composed here, so thirty
                   * controls cannot end up with thirty wordings for one reason.
                   */
                  if (setup.writesPaused && k.href) {
                    return (
                      <div key={k.title} className={shell}>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="flex items-start gap-4">{row}</span>
                          {setup.note ? (
                            <span className="mt-1.5 pl-[34px] text-[12.5px] text-nevo-near-black/50">
                              {setup.note}
                            </span>
                          ) : null}
                        </span>
                      </div>
                    );
                  }
                  return k.href ? (
                    <Link
                      key={k.title}
                      href={k.href}
                      className={cn(shell, "transition-[filter] hover:brightness-[0.985]")}
                    >
                      {row}
                    </Link>
                  ) : (
                    <div key={k.title} className={shell}>
                      {row}
                    </div>
                  );
                })}
              </div>
            ) : (
            glance.length > 0 && (
              <div className={cn(CARD, "mt-3 overflow-hidden")}>
                {glance.map((g, i) => (
                  <Link
                    key={g.key}
                    href={g.href}
                    className={cn(
                      "flex items-center gap-4 px-[22px] py-[18px] transition-[filter] hover:brightness-[0.985]",
                      i < glance.length - 1 && "border-b border-nevo-near-black/7",
                    )}
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-[15px] font-semibold text-nevo-near-black">
                        {g.title}
                      </span>
                      <span className="mt-0.5 text-[13px] text-nevo-near-black/58">
                        {g.sub}
                      </span>
                    </span>
                    <span className="shrink-0 text-[13.5px] font-semibold text-nevo-navy">
                      {g.action} &rarr;
                    </span>
                  </Link>
                ))}
              </div>
            )
            )}
          </>
        )}
      </div>
    </div>
  );
}
