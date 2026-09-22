"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  exportApi,
  type IepExport,
  type IepExportShare,
} from "@/lib/api/export";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { studentsApi, type AdminStudentRow, type ParentLink } from "@/lib/api/students";
import { cn } from "@/lib/utils";
import { ReadFailed } from "../ReadFailed";
import {
  Avatar,
  CARD,
  CheckIcon,
  GHOST_BTN,
  PRIMARY_BTN,
  Spinner,
} from "../Roster/primitives";

/**
 * D8 IEP Exporter - a progress report, drafted by Nevo and finalised by a
 * person.
 *
 * THE REVIEW STEP IS NEVER SKIPPABLE. That is the entire design of this
 * screen, and it is a safeguarding property rather than a preference: the
 * draft carries a persistent "Draft - review before sharing" banner, a named
 * member of staff must read and check it, and nothing reaches a family until
 * they do. There is no path from generation to sharing that does not pass
 * through a human, and no shortcut may be added.
 *
 * The register is fixed too: PROSE A PARENT COULD READ. No scores, no clinical
 * shorthand, no confidence figures. The draft covers engagement, how the
 * learner learns best, pacing and working memory, and areas of growth - and
 * the backend composes it that way; this screen must not add a number to it.
 *
 * The reviewer is the signed-in SENCo, taken server-side from the caller
 * rather than picked from a list. D8's tablet frame draws a "Reviewing member
 * of staff" selector, but choosing a colleague to be recorded as having read
 * something they have not read is exactly the attestation this flow exists to
 * prevent - so the field is absent, and the person pressing Finalise is the
 * person named. Raised with design.
 *
 * WHAT THE SCREEN MAY SAY ABOUT SHARING. **It can now read share state back,
 * and this paragraph used to say the opposite.** `GET /exports/iep/{id}/shares`
 * landed 21 Sep - a pre-launch blocker - and the record had been written all
 * along with nothing reading it.
 *
 * Before that the screen knew only what it had done itself, that session, so
 * every claim about sharing was scoped to one page load and a reload erased
 * it. What it may say is now wider, and the discipline that replaces the old
 * scoping is: **a failed read of the share list is not an empty share list.**
 * Those are held apart below, because conflating them is how a SENCo gets told
 * a report reached nobody when we simply could not look.
 *
 * `status` is `shared | revoked` and the difference is not cosmetic: a revoked
 * share is a guardian who NO LONGER holds the report. Rendering one as "shared
 * with" states the opposite of the truth about who can read a child's SEN
 * report.
 *
 * The draft banner's "Not shared with anyone" is design's own draft-only pill
 * (D08:130) and now renders only while the export's own status is "draft",
 * rather than while the phase happens to be a draft-ish one. That distinction
 * is the bug: a failed share is the only route back to the share card, and
 * the way back ran through the draft editor, so a FINALISED and possibly
 * shared report was displayed under a banner saying it had gone to nobody -
 * with Save and Finalise re-armed on it, against design's rule that
 * finalisation is irreversible.
 *
 * TODO(api): `sharedByName` on `IepExportShareResponse`. The share record
 * names the sharer as `sharedByUserId` and nothing resolves a user id to a
 * name, so the history says WHEN and TO WHOM but not BY WHOM. Same ask as
 * `reviewedByName` below, and the line stays unbuilt rather than guessed.
 *
 * TODO(api): "Download PDF" has no endpoint. `exports/iep` has no `.pdf`
 * route - the only PDF in the whole API is the compliance audit's - so the
 * action is absent rather than a button that fails. Sharing with the guardian
 * works, which is the path that matters most.
 */

type Phase =
  | "picking"
  | "generating"
  | "draft"
  | "saving"
  | "finalising"
  | "final"
  | "sharing"
  | "shared"
  | "failed";

const LABEL = "mb-[7px] block text-[12.5px] font-semibold text-nevo-near-black/60";

const FIELD =
  "h-[50px] w-full rounded-[10px] border-[1.5px] border-nevo-near-black/16 bg-nevo-cream px-[15px] text-[15px] text-nevo-near-black outline-none transition-colors focus:border-nevo-navy";

/**
 * The guardian's name for a share's `parentId`, or null.
 *
 * NULL IS A REAL ANSWER. `ParentLink.parentId` is nullable and a guardian can
 * be unlinked after a share, so a share can legitimately name a person this
 * screen cannot. The caller states the event without a name rather than
 * inventing one.
 */
function guardianName(guardians: ParentLink[], parentId: string): string | null {
  const match = guardians.find((g) => g.parentId === parentId);
  return match?.parentName?.trim() ? match.parentName : null;
}

/** "14 September 2026" - a share is a dated event, never "3 days ago". */
function shareDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * One line of share history.
 *
 * A REVOKED SHARE IS NOT A SHARE. It renders as its own sentence rather than
 * a greyed variant of the same one, because the fact a SENCo needs off this
 * line is whether that guardian can read the report NOW.
 *
 * The name is optional and its absence is not filled. `parentId` resolves
 * against the guardian list the screen already holds, and a guardian who has
 * since been unlinked resolves to nothing - in which case the line still
 * states the event and simply does not name a person. Inventing "Unknown
 * guardian" would put a phrase on a child's SEN record that names nobody.
 */
function ShareLine({ name, at, revoked }: { name: string | null; at: string; revoked: boolean }) {
  const when = shareDate(at);
  const who = name ?? "a linked guardian";
  return (
    <li className="m-0 text-[13.5px] leading-[1.55] text-nevo-near-black/72">
      {revoked ? (
        <>
          <span className="font-semibold text-nevo-near-black">{who}</span> no
          longer has access{when ? ` - shared ${when}, since withdrawn` : ", since withdrawn"}.
        </>
      ) : (
        <>
          Shared with{" "}
          <span className="font-semibold text-nevo-near-black">{who}</span>
          {when ? ` on ${when}` : ""}.
        </>
      )}
    </li>
  );
}

/** ISO yyyy-mm-dd, which is what the endpoint's `date` format wants. */
function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function IepExporterView() {
  const [phase, setPhase] = useState<Phase>("picking");
  const [students, setStudents] = useState<AdminStudentRow[]>([]);
  const [studentId, setStudentId] = useState("");
  /** Distinct from "no students": one is a school, the other is a GET. */
  const [studentsFailed, setStudentsFailed] = useState(false);
  /** So a retry that fails again still visibly did something. */
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [draft, setDraft] = useState<IepExport | null>(null);
  const [content, setContent] = useState("");
  /** The reviewer's own note. Written on finalise, never shared with a parent. */
  const [note, setNote] = useState("");
  const me = useCurrentUser();
  const [guardians, setGuardians] = useState<ParentLink[]>([]);
  const [guardiansFailed, setGuardiansFailed] = useState(false);
  const [shareFailed, setShareFailed] = useState(false);
  /*
   * NULL IS "WE HAVE NOT LOOKED", NOT "NOBODY". The empty array is a real
   * answer - this export has reached no guardian - and it is now a fact rather
   * than an assumption, so the two must not collapse into one another. See
   * `sharesFailed` for the third state.
   */
  const [shares, setShares] = useState<IepExportShare[] | null>(null);
  const [sharesFailed, setSharesFailed] = useState(false);
  const [savedAt, setSavedAt] = useState(false);

  // The clock is read in an effect, never during render. Default period is the
  // last four months, which is about a Nigerian half-term.
  //
  // Scheduled rather than set synchronously in the effect body: the house
  // pattern (react-hooks/set-state-in-effect), same as PermissionContext.
  useEffect(() => {
    const t = setTimeout(() => {
      const end = new Date();
      const start = new Date();
      start.setMonth(start.getMonth() - 4);
      setPeriodEnd(iso(end));
      setPeriodStart(iso(start));
    }, 0);
    return () => clearTimeout(t);
  }, []);

  /*
   * A failed ROSTER read is not a school with no students - and this one was
   * worse than the usual shape, because the empty list is also the disabled
   * state. `.catch(() => setStudents([]))` left the picker with nothing to
   * choose, so `studentId` stayed "" and "Generate draft" was permanently
   * disabled with no explanation anywhere on the screen. A SENCo sitting down
   * to draft an IEP before a parents' meeting met a dead screen.
   *
   * The guardian read three lines below got exactly this fix in #269. This is
   * its sibling in the same file, and it was missed.
   */
  const loadStudents = useCallback(() => {
    studentsApi
      .list()
      .then((rows) => {
        setStudents(rows);
        setStudentsFailed(false);
      })
      .catch(() => {
        setStudents([]);
        setStudentsFailed(true);
      })
      .finally(() => setStudentsLoading(false));
  }, []);

  /*
   * The retry mutated no state when it failed a second time - `studentsFailed`
   * was already true and `students` already empty - so the DOM was byte
   * identical before and after the press and the button read as broken.
   */
  const retryStudents = () => {
    setStudentsLoading(true);
    loadStudents();
  };

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  const student = students.find((s) => s.id === studentId);
  const firstName = student?.name.split(" ").filter(Boolean)[0] ?? "this learner";

  /*
   * A failed guardian read is NOT a child without a family.
   *
   * This used to catch to `setGuardians([])`, which renders "There's no
   * guardian account on {firstName}'s record yet, so there's nobody to send
   * this to." - an assertion about a child's family record produced by a
   * failed GET. The realistic outcome is a finalised IEP that never reaches a
   * guardian because the SENCo was told there was nobody to reach.
   */
  const loadGuardians = useCallback((id: string) => {
    setGuardiansFailed(false);
    studentsApi
      .parentLinks(id)
      .then((rows) => {
        setGuardians(rows);
        setGuardiansFailed(false);
      })
      .catch(() => setGuardiansFailed(true));
  }, []);

  const generate = () => {
    if (!studentId || !periodStart || !periodEnd) return;
    setPhase("generating");
    exportApi
      .create({ studentId, periodStart, periodEnd })
      .then((d) => {
        setDraft(d);
        setContent(d.exportContent);
        setPhase(d.status === "final" ? "final" : "draft");
        loadGuardians(studentId);
      })
      .catch(() => setPhase("failed"));
  };

  const saveDraft = () => {
    if (!draft) return;
    setPhase("saving");
    exportApi
      .update(draft.id, { exportContent: content })
      .then((d) => {
        setDraft(d);
        setSavedAt(true);
        // Same rule as everywhere else here: the export's own status decides
        // which screen we are on. This used to set "draft" unconditionally.
        setPhase(d.status === "final" ? "final" : "draft");
        setTimeout(() => setSavedAt(false), 2000);
      })
      .catch(() => setPhase("failed"));
  };

  const reviewedOn =
    draft?.reviewedAt && !Number.isNaN(Date.parse(draft.reviewedAt))
      ? new Date(draft.reviewedAt).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : null;
  const reviewedByMe = Boolean(
    draft?.reviewedByUserId && me?.userId && draft.reviewedByUserId === me.userId,
  );

  const finalise = () => {
    if (!draft) return;
    setPhase("finalising");
    // The edited wording goes with the review, so what is finalised is what
    // the reviewer actually read on screen.
    exportApi
      /*
       * THE REVIEW NOTE, which `POST /exports/iep/{id}/review` has always
       * accepted and `IepExport.reviewNote` has always carried back - the
       * field existed on both ends of the call and no screen ever wrote it.
       * It is the SENCo's own note on why they signed this off, and it is
       * the difference between a report that was reviewed and one that was
       * merely finalised.
       *
       * Trimmed to null rather than sent as "": an empty note is the absence
       * of one, and should not read back as a reviewer who wrote nothing.
       */
      .review(draft.id, {
        exportContent: content,
        reviewNote: note.trim() || null,
      })
      .then((d) => {
        setDraft(d);
        setContent(d.exportContent);
        setPhase("final");
      })
      .catch(() => setPhase("failed"));
  };

  /*
   * Read back who this export has already reached.
   *
   * Runs on every export that exists, not only after a share, because the
   * whole point of the endpoint is the RELOAD case: a SENCo returning to a
   * report they sent last week, or after the share that failed to confirm.
   */
  const loadShares = useCallback((exportId: string) => {
    exportApi
      .listShares(exportId)
      .then((s) => {
        setShares(s);
        setSharesFailed(false);
      })
      .catch(() => {
        // Left as null rather than [], so nothing downstream can read this as
        // "shared with nobody".
        setShares(null);
        setSharesFailed(true);
      });
  }, []);

  useEffect(() => {
    if (draft?.id) loadShares(draft.id);
  }, [draft?.id, loadShares]);

  const share = (parentId: string) => {
    if (!draft) return;
    setPhase("sharing");
    setShareFailed(false);
    exportApi
      .share(draft.id, { parentId })
      .then(() => {
        setPhase("shared");
        // The history is now the authority on what happened, including for the
        // attempt that came before this one and did not confirm.
        loadShares(draft.id);
      })
      .catch(() => {
        // A failed SHARE is the one write here whose outcome the client
        // genuinely cannot know: a transport failure (ApiError status 0) can
        // leave a share committed server-side. Generate, save and finalise
        // can honestly say nothing happened; this cannot.
        setShareFailed(true);
        setPhase("failed");
        /*
         * A FAILED SHARE IS EXACTLY WHEN THE HISTORY IS WORTH READING. The
         * failure mode this screen has always warned about is a transport
         * error that still committed the share server-side. That used to be
         * unknowable and the copy said so. Now we can simply look, and if a
         * record came back the SENCo is told it arrived rather than left to
         * "check their account".
         */
        loadShares(draft.id);
      });
  };

  return (
    <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
      <div className="mx-auto max-w-[780px]">
        <Link
          href="/admin/senco"
          className="text-[13.5px] font-semibold text-nevo-navy hover:opacity-75"
        >
          &larr; Learning Support
        </Link>

        {/* -------------------------------------------------------- PICKING */}
        {phase === "picking" || phase === "generating" ? (
          <>
            <h2 className="m-0 mt-3 text-[28px] font-semibold tracking-[-0.018em] text-nevo-near-black">
              Create a progress report
            </h2>
            <p className="mt-2 max-w-[62ch] text-[14.5px] leading-[1.6] text-nevo-near-black/62">
              Nevo drafts from what it has seen this period. You review and edit
              every word before anything is shared - nothing is sent
              automatically.
            </p>

            {phase === "generating" ? (
              <div className={cn(CARD, "mt-7 flex flex-col items-center gap-3 px-6 py-16 text-center")}>
                <Spinner />
                <h3 className="m-0 mt-1 text-[17px] font-semibold text-nevo-near-black">
                  Drafting {firstName}&rsquo;s report
                </h3>
                <p className="m-0 max-w-[46ch] text-sm leading-[1.6] text-nevo-near-black/62">
                  Reading this period&rsquo;s sessions and putting them into
                  plain language. This takes a few seconds.
                </p>
              </div>
            ) : (
              <div className={cn(CARD, "mt-7 px-6 py-[26px]")}>
                <div className="flex flex-col gap-5">
                  <div>
                    <label htmlFor="iep-student" className={LABEL}>
                      Student
                    </label>
                    {studentsLoading ? (
                      <p className="mt-1.5 text-[13px] text-nevo-near-black/45">
                        Looking up your students&hellip;
                      </p>
                    ) : studentsFailed ? (
                      <ReadFailed
                        className="mt-1.5"
                        what="your student list"
                        onRetry={retryStudents}
                      />
                    ) : null}
                    <select
                      id="iep-student"
                      value={studentId}
                      onChange={(e) => setStudentId(e.target.value)}
                      className={cn(FIELD, "cursor-pointer")}
                    >
                      <option value="">Choose a student</option>
                      {students.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex gap-4 max-lg:flex-col">
                    <div className="flex-1">
                      <label htmlFor="iep-from" className={LABEL}>
                        Reporting period from
                      </label>
                      <input
                        id="iep-from"
                        type="date"
                        value={periodStart}
                        onChange={(e) => setPeriodStart(e.target.value)}
                        className={FIELD}
                      />
                    </div>
                    <div className="flex-1">
                      <label htmlFor="iep-to" className={LABEL}>
                        to
                      </label>
                      <input
                        id="iep-to"
                        type="date"
                        value={periodEnd}
                        onChange={(e) => setPeriodEnd(e.target.value)}
                        className={FIELD}
                      />
                    </div>
                  </div>

                  <p className="m-0 text-[13px] leading-[1.55] text-nevo-near-black/58">
                    The draft covers engagement, how {firstName} learns best,
                    pacing and working memory, and areas of growth. It never
                    includes scores.
                  </p>

                  <button
                    type="button"
                    onClick={generate}
                    disabled={!studentId || !periodStart || !periodEnd}
                    className={cn(PRIMARY_BTN, "self-start")}
                  >
                    Generate draft
                  </button>
                  {studentsFailed ? (
                    /* The button is disabled because there is nobody to pick,
                       and the reason for that is above - not a fault of theirs
                       and not a school with no learners. */
                    <p className="m-0 text-[13px] leading-[1.5] text-nevo-near-black/58">
                      There&rsquo;s nobody to choose from until that list loads.
                    </p>
                  ) : null}
                </div>
              </div>
            )}
          </>
        ) : null}

        {/* ---------------------------------------------------------- DRAFT */}
        {draft && draft.status !== "final" && (phase === "draft" || phase === "saving" || phase === "finalising") ? (
          <>
            {/* Persistent, and it does not scroll away. */}
            <div className="mt-4 flex flex-wrap items-start justify-between gap-3 rounded-xl bg-nevo-violet/24 px-5 py-4">
              <div className="min-w-0">
                <p className="m-0 text-[14.5px] font-semibold text-nevo-navy">
                  Draft - review before sharing
                </p>
                <p className="m-0 mt-1 text-[13.5px] leading-[1.55] text-nevo-navy/85">
                  A named member of staff must read and check this before
                  it&rsquo;s finalised.
                </p>
              </div>
              {/*
                * Design draws this as a pill of its own (D08:130), draft-only,
                * beside the instruction rather than inside it. The build had
                * merged the two into one sentence, which is how a statement
                * about SHARE STATE ended up rendering wherever the review
                * instruction did. It is now a sibling of the block above, and
                * the block only renders while the export's own status is
                * "draft" - so it cannot appear over a finalised report, no
                * matter how the phase got here.
                */}
              <span className="shrink-0 rounded-full bg-nevo-navy/12 px-[11px] py-1 text-[12px] font-semibold text-nevo-navy">
                Not shared with anyone
              </span>
            </div>

            <div className={cn(CARD, "mt-4 px-6 py-[26px]")}>
              <h3 className="m-0 text-[17px] font-semibold text-nevo-near-black">
                Individual learning summary
              </h3>
              <p className="m-0 mt-1 text-[13px] text-nevo-near-black/58">
                {student?.name} · {periodStart} to {periodEnd}
              </p>

              <label htmlFor="iep-content" className="sr-only">
                Report wording
              </label>
              <textarea
                id="iep-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={18}
                className="mt-4 w-full resize-y rounded-[10px] border-[1.5px] border-nevo-near-black/16 bg-nevo-cream p-4 text-[15px] leading-[1.7] text-nevo-near-black outline-none transition-colors focus:border-nevo-navy"
              />

              <div className="mt-4">
                <label
                  htmlFor="iep-note"
                  className="block text-[13px] font-semibold text-nevo-near-black"
                >
                  Add a note (optional)
                </label>
                <p className="m-0 mt-1 max-w-[62ch] text-[12.5px] leading-[1.5] text-nevo-near-black/58">
                  For your own record of why you signed this off. It is kept
                  with the report and is not part of what a parent reads.
                </p>
                <textarea
                  id="iep-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  disabled={phase !== "draft"}
                  rows={3}
                  className="mt-2 w-full resize-y rounded-[10px] border-[1.5px] border-nevo-near-black/16 bg-nevo-cream p-3 text-[14px] leading-[1.6] text-nevo-near-black outline-none transition-colors focus:border-nevo-navy disabled:opacity-60"
                />
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={finalise}
                  disabled={phase !== "draft"}
                  className={PRIMARY_BTN}
                >
                  {phase === "finalising" ? "Finalising…" : "Finalise report"}
                </button>
                <button
                  type="button"
                  onClick={saveDraft}
                  disabled={phase !== "draft"}
                  className={GHOST_BTN}
                >
                  {phase === "saving" ? "Saving…" : "Save draft"}
                </button>
                {savedAt ? (
                  <span className="text-[13px] font-semibold text-nevo-navy motion-safe:animate-nevo-reveal">
                    Saved just now
                  </span>
                ) : null}
                <p className="m-0 w-full text-[13px] text-nevo-near-black/55">
                  Finalising locks the wording. You can still share it
                  afterwards.
                </p>
              </div>
            </div>
          </>
        ) : null}

        {/* ---------------------------------------------------------- FINAL */}
        {draft && draft.status === "final" && phase !== "failed" ? (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center rounded-full bg-nevo-navy px-3 py-1 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-nevo-cream">
                Final
              </span>
              {/*
                * THE ATTESTATION THIS SCREEN EXISTS TO PRODUCE, and it named
                * nobody. A finalised IEP is a member of staff putting their
                * name to a report about a child; "Finalised 14 September"
                * records that it happened, not who stands behind it.
                *
                * GUARDED ON IDENTITY. The contract gives `reviewedByUserId` -
                * an id, not a name - so the only reviewer this console can
                * honestly name is the person reading it. Anyone else's report
                * keeps the date alone rather than an id nobody recognises.
                *
                * TODO(api): `reviewedByName` on `IepExport`. Every other
                * surface that shows an actor has one (`acceptedByName` on the
                * DPA record, `actor_name_at_time` on the assignment history
                * we asked for), and this is the surface where it matters
                * most.
                */}
              <span className="text-[13.5px] text-nevo-near-black/62">
                {reviewedOn
                  ? reviewedByMe && me?.name
                    ? `Finalised by ${me.name} on ${reviewedOn}`
                    : `Finalised ${reviewedOn}`
                  : "Finalised"}
              </span>
            </div>

            <div className={cn(CARD, "mt-4 px-6 py-[26px]")}>
              <h3 className="m-0 text-[17px] font-semibold text-nevo-near-black">
                Individual learning summary
              </h3>
              <p className="m-0 mt-1 text-[13px] text-nevo-near-black/58">
                {student?.name} · {draft.periodStart} to {draft.periodEnd}
              </p>
              <p className="m-0 mt-4 whitespace-pre-wrap text-[15px] leading-[1.7] text-nevo-near-black/85">
                {content}
              </p>
            </div>

            <div className={cn(CARD, "mt-5 px-6 py-[26px]")}>
              <h3 className="m-0 text-[17px] font-semibold text-nevo-near-black">
                Share with parent / guardian
              </h3>
              <p className="m-0 mt-1.5 text-[13.5px] leading-[1.55] text-nevo-near-black/62">
                Sends a copy to {firstName}&rsquo;s linked guardian.
                They&rsquo;ll see it in their Nevo account.
              </p>

              {/*
                * WHERE THIS REPORT HAS ALREADY GONE. Three states, and they
                * are three because two of them used to be one: a failed read
                * is not an empty history, and telling a SENCo "not shared with
                * anyone" because a GET fell over is the worst sentence on this
                * screen.
                */}
              {sharesFailed ? (
                <p className="m-0 mt-3.5 text-[13.5px] leading-[1.55] text-nevo-near-black/62">
                  We couldn&rsquo;t check who this has already been shared
                  with. Don&rsquo;t read that as nobody.
                </p>
              ) : shares && shares.length > 0 ? (
                <ul className="m-0 mt-3.5 list-none space-y-1.5 p-0">
                  {shares.map((s) => (
                    <ShareLine
                      key={s.id}
                      name={guardianName(guardians, s.parentId)}
                      at={s.sharedAt}
                      revoked={s.status === "revoked"}
                    />
                  ))}
                </ul>
              ) : shares ? (
                <p className="m-0 mt-3.5 text-[13.5px] leading-[1.55] text-nevo-near-black/62">
                  This hasn&rsquo;t been shared with anyone yet.
                </p>
              ) : null}

              {/*
                * The unconfirmed share follows the SENCo to the place they
                * would repeat it. "Go back" returns a finalised export here
                * rather than to the draft editor, so without this they would
                * be one click from sending a second copy of something that may
                * already have arrived.
                *
                * THE HISTORY NOW ANSWERS IT. If the failed attempt did commit
                * server-side, the list above says so plainly and this warning
                * is suppressed - it only fires when we looked and found
                * nothing, which is the case where sending again is right.
                */}
              {shareFailed && phase !== "shared" && !(shares && shares.length > 0) ? (
                <p className="m-0 mt-3 rounded-[10px] bg-nevo-violet/24 px-4 py-3 text-[13.5px] leading-[1.55] text-nevo-navy">
                  The last attempt didn&rsquo;t confirm. It may still have
                  reached them &ndash; check their account before sending
                  again.
                </p>
              ) : null}

              {phase === "shared" ? (
                <div className="mt-5 flex items-center gap-2.5">
                  <span className="flex size-[26px] flex-none items-center justify-center rounded-full bg-nevo-navy text-nevo-cream motion-safe:animate-nevo-pop">
                    <CheckIcon />
                  </span>
                  <span className="text-[14.5px] font-semibold text-nevo-navy">
                    Shared. It&rsquo;s in their account now.
                  </span>
                </div>
              ) : guardiansFailed ? (
                <div className="mt-4 text-sm text-nevo-near-black/62">
                  <p className="m-0">
                    We couldn&rsquo;t read {firstName}&rsquo;s guardian record
                    just now. Don&rsquo;t take this as nobody to send to
                    &ndash; we haven&rsquo;t been able to check.
                  </p>
                  <button
                    type="button"
                    onClick={() => studentId && loadGuardians(studentId)}
                    className="mt-2.5 cursor-pointer text-[13.5px] font-semibold text-nevo-navy"
                  >
                    Try again
                  </button>
                </div>
              ) : guardians.length === 0 ? (
                <p className="m-0 mt-4 text-sm text-nevo-near-black/62">
                  There&rsquo;s no guardian account on {firstName}&rsquo;s
                  record yet, so there&rsquo;s nobody to send this to.
                </p>
              ) : (
                <div className="mt-4 flex flex-col gap-3">
                  {guardians.map((g) => (
                    <div
                      key={g.id}
                      className="flex items-center gap-3.5 rounded-xl border-[1.5px] border-nevo-near-black/14 px-4 py-3.5"
                    >
                      <Avatar name={g.parentName} size={44} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px] font-semibold text-nevo-near-black">
                          {g.parentName}
                        </div>
                        <div className="truncate text-[13px] text-nevo-near-black/62">
                          Guardian ·{" "}
                          {g.accountCreated ? "account active" : "no account yet"}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={!g.parentId || phase === "sharing"}
                        onClick={() => g.parentId && share(g.parentId)}
                        className={PRIMARY_BTN}
                      >
                        {phase === "sharing" ? "Sending…" : "Share"}
                      </button>
                    </div>
                  ))}
                  {guardians.some((g) => !g.parentId) ? (
                    <p className="m-0 text-[13px] leading-[1.5] text-nevo-near-black/55">
                      A guardian without an account can&rsquo;t receive this
                      yet. It becomes available once they confirm consent and
                      their account is created.
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          </>
        ) : null}

        {/* --------------------------------------------------------- FAILED */}
        {phase === "failed" ? (
          <div className={cn(CARD, "mt-6 px-[26px] py-7")}>
            <h3 className="text-[17px] font-semibold text-nevo-near-black">
              Something went wrong. We&rsquo;re on it.
            </h3>
            <p className="mt-2 max-w-[52ch] text-sm leading-[1.55] text-nevo-near-black/62">
              {shareFailed
                ? "Anything you had written is still here. We couldn’t confirm whether the share reached them, so check their account before sending it again."
                : "Nothing has been shared, and anything you had written is still here. Please give it another try."}
            </p>
            {/*
              * Back to where the export ACTUALLY is, not to the editor.
              *
              * This read only `draft ? "draft" : "picking"`, so the one route
              * back from a failed share - and it is the only route, a failed
              * share unmounts the whole final block - dropped a FINALISED
              * report into the draft editor. Design's rule is that
              * finalisation is terminal ("Finalize -> irreversible, status
              * draft -> final"), and this re-armed Save and Finalise on a
              * locked report, because their only guard is `phase !== "draft"`.
              */}
            <button
              type="button"
              onClick={() =>
                setPhase(!draft ? "picking" : draft.status === "final" ? "final" : "draft")
              }
              className={cn(PRIMARY_BTN, "mt-5")}
            >
              Go back
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
