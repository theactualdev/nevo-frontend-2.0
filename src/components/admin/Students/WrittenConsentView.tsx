"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { classesApi } from "@/lib/api/classes";
import { ApiError, apiErrorMessage } from "@/lib/api/client";
import { consentsApi, type WrittenConsentRecord } from "@/lib/api/consents";
import { studentsApi, type AdminStudentDetail } from "@/lib/api/students";
import { yearGroupLabel } from "@/lib/constants/yearGroups";
import { cn } from "@/lib/utils";
import { NoAccess, failureKind } from "../NoAccess";
import type { Back } from "../back";
import { Avatar, CARD, FailureLine, GHOST_BTN, PRIMARY_BTN } from "../Roster/primitives";
import { ConsentFormDownload } from "./ConsentFormDownload";

/**
 * D25 PC-02 "Record written consent": a signed paper form, entered against
 * one child (`POST /students/{id}/consents/written`, multipart).
 *
 * THE NAME IS THE PARENT'S, NEVER THE ADMIN'S. The frame's sub-line says it,
 * and the backend now keeps the two facts apart: the parent is recorded as
 * the one who consented, the school as the uploader.
 *
 * WHAT THE FRAME DOES NOT DRAW, and how it is filled:
 * - Relationship is a select showing "Mother"; no options are drawn and the
 *   contract takes free text. Mother, Father and Guardian, with "Someone
 *   else" opening a field.
 * - No saving, saved or refused states are drawn. Saved says what happened
 *   and whether the parent was told (`parentNotified`); a refusal is shown in
 *   the server's words ("Check the date on the form: it is later than
 *   today.", "That file is very large...").
 * - Consent types: none are asked. The printed form has one tick box, to use
 *   Nevo, which is `REQUESTED_CONSENT_TYPES` - the consent the console asks
 *   for everywhere.
 *
 * A WITHDRAWN CHILD GETS NO FORM. The backend would set consent back to
 * confirmed, and SCRUM-80 makes withdrawal the parent's to lift - so the page
 * says so instead, as the student page does.
 *
 * The photo is optional on the contract, and stays optional here: a form
 * recorded without its photograph is still the parent's consent.
 */

const RELATIONSHIPS = ["Mother", "Father", "Guardian"] as const;
const OTHER = "Someone else";

const LABEL = "mb-[7px] block text-[12.5px] font-semibold text-nevo-near-black/60";
const FIELD =
  "h-12 w-full rounded-[10px] border-[1.5px] border-nevo-near-black/16 bg-nevo-cream-elevated px-4 text-[15px] text-nevo-near-black outline-none focus:border-nevo-navy disabled:opacity-60";

type Phase = "loading" | "ready" | "failed" | "denied";

/** Today, as the bare date a date field holds - on this device. */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "Photo · 2.1 MB", as the frame's evidence card has it. */
const MEGABYTES = new Intl.NumberFormat("en-GB", {
  style: "unit",
  unit: "megabyte",
  maximumSignificantDigits: 2,
});

function sizeLine(file: File): string {
  const kind = file.type === "application/pdf" ? "PDF" : "Photo";
  return `${kind} · ${MEGABYTES.format(file.size / 1_000_000)}`;
}

export function WrittenConsentView({
  studentId,
  back = null,
}: {
  studentId: string;
  /** The student's page, as the admin left it - see `back.ts`. */
  back?: Back | null;
}) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [student, setStudent] = useState<AdminStudentDetail | null>(null);
  const [classLine, setClassLine] = useState<string | null>(null);

  const [parentName, setParentName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [otherRelationship, setOtherRelationship] = useState("");
  const [signedOn, setSignedOn] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const [save, setSave] = useState<"idle" | "saving" | "failed">("idle");
  const [note, setNote] = useState<string | null>(null);
  const [saved, setSaved] = useState<WrittenConsentRecord | null>(null);
  const [max] = useState(today);

  useEffect(() => {
    let alive = true;
    studentsApi
      .get(studentId)
      .then((s) => {
        if (!alive) return;
        setStudent(s);
        setPhase("ready");
        // The class under the name, as the frame's chip has it. Its own read
        // and its own absence: no class line rather than a wrong one.
        classesApi
          .list()
          .then((classes) => {
            if (!alive) return;
            const held = classes.filter((c) => s.classIds.includes(c.id));
            const first = held[0];
            setClassLine(
              first
                ? [first.name, yearGroupLabel(first.yearGroup)].filter(Boolean).join(" · ")
                : null,
            );
          })
          .catch(() => undefined);
      })
      .catch((err: unknown) => {
        if (alive) setPhase(failureKind(err));
      });
    return () => {
      alive = false;
    };
  }, [studentId]);

  const name =
    [student?.firstName, student?.lastName].filter(Boolean).join(" ") || "This student";
  const firstName = student?.firstName?.trim() || "this student";
  const relation = relationship === OTHER ? otherRelationship.trim() : relationship;
  const valid =
    parentName.trim().length >= 2 &&
    relation.length >= 2 &&
    Boolean(signedOn) &&
    signedOn <= max;

  const submit = () => {
    if (!valid || save === "saving") return;
    setSave("saving");
    setNote(null);
    consentsApi
      .recordWrittenConsent(studentId, {
        parentName,
        parentRelationship: relation,
        signedOn,
        form: file,
      })
      .then((record) => {
        setSaved(record);
        setSave("idle");
      })
      .catch((err: unknown) => {
        setNote(err instanceof ApiError ? apiErrorMessage(err.detail) : null);
        setSave("failed");
      });
  };

  // Back to the student's page as the admin left it, its own back intact.
  const toStudent = back?.href ?? `/admin/students/${studentId}`;

  return (
    <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
      <div className="mx-auto max-w-[900px]">
        {phase === "loading" ? (
          <div className={cn(CARD, "h-[420px] animate-pulse")} />
        ) : phase === "denied" ? (
          <NoAccess what="this student" />
        ) : phase === "failed" || !student ? (
          <div className={cn(CARD, "px-[26px] py-7")}>
            <h3 className="m-0 text-[17px] font-semibold text-nevo-near-black">
              We couldn&rsquo;t load this student
            </h3>
            <p className="m-0 mt-2 max-w-[52ch] text-sm leading-[1.55] text-nevo-near-black/62">
              Nothing has been recorded. Try again in a moment.
            </p>
            <Link href="/admin/students" className={cn(GHOST_BTN, "mt-5")}>
              Back to students
            </Link>
          </div>
        ) : saved ? (
          <div className={cn(CARD, "px-[26px] py-7")} role="status">
            <h2 className="m-0 text-[22px] font-semibold tracking-[-0.015em] text-nevo-near-black">
              Written consent recorded for {name}
            </h2>
            <p className="m-0 mt-2 max-w-[60ch] text-[14.5px] leading-[1.55] text-nevo-near-black/68">
              Signed by {saved.parentName} ({saved.parentRelationship.toLowerCase()})
              {saved.evidenceStoragePath ? ", with the form kept as evidence." : "."}
              {saved.parentNotified
                ? " Their parent has been sent a note saying so, with a way to withdraw at any time."
                : ""}
            </p>
            <Link href={toStudent} className={cn(PRIMARY_BTN, "mt-5")}>
              Back to {firstName}
            </Link>
          </div>
        ) : student.consent?.status === "withdrawn" ? (
          <div className={cn(CARD, "px-[26px] py-7")}>
            <h2 className="m-0 text-[22px] font-semibold tracking-[-0.015em] text-nevo-near-black">
              A parent has withdrawn consent for {name}
            </h2>
            <p className="m-0 mt-2 max-w-[60ch] text-[14.5px] leading-[1.55] text-nevo-near-black/68">
              Only the parent who withdrew can restore it, so a paper form
              can&rsquo;t be recorded here.
            </p>
            <Link href={toStudent} className={cn(GHOST_BTN, "mt-5")}>
              Back to {firstName}
            </Link>
          </div>
        ) : (
          <div className="grid items-start gap-6 lg:grid-cols-2">
            <div>
              <span className="mb-2 inline-block text-[13.5px] text-nevo-near-black/55">
                Students &middot; Consent
              </span>
              <h2 className="m-0 text-[26px] font-semibold tracking-[-0.018em] text-nevo-near-black">
                Record written consent
              </h2>
              <p className="m-0 mt-2 max-w-[560px] text-[14.5px] leading-[1.55] text-nevo-near-black/62">
                For a signed paper form. Enter what the form says &ndash; the
                name is the parent&rsquo;s, never yours.
              </p>

              <div className="mt-[18px] flex items-center gap-3 rounded-xl bg-nevo-cream-elevated px-3.5 py-3 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
                <Avatar name={name} size={38} />
                <div className="min-w-0">
                  <div className="truncate text-[14.5px] font-semibold text-nevo-near-black">{name}</div>
                  {classLine ? (
                    <div className="truncate text-[12.5px] text-nevo-near-black/60">{classLine}</div>
                  ) : null}
                </div>
              </div>

              <div className="mt-[18px] flex flex-col gap-4">
                <div>
                  <label htmlFor="wc-parent" className={LABEL}>
                    Parent&rsquo;s full name{" "}
                    <span className="font-normal text-nevo-near-black/45">as written on the form</span>
                  </label>
                  <input
                    id="wc-parent"
                    value={parentName}
                    onChange={(e) => setParentName(e.target.value)}
                    maxLength={255}
                    disabled={save === "saving"}
                    className={FIELD}
                  />
                </div>
                <div className="flex gap-3.5 max-sm:flex-col">
                  <div className="flex-1">
                    <label htmlFor="wc-relationship" className={LABEL}>
                      Relationship to child
                    </label>
                    <select
                      id="wc-relationship"
                      value={relationship}
                      onChange={(e) => setRelationship(e.target.value)}
                      disabled={save === "saving"}
                      className={cn(FIELD, "cursor-pointer")}
                    >
                      <option value="">Choose</option>
                      {RELATIONSHIPS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                      <option value={OTHER}>{OTHER}</option>
                    </select>
                  </div>
                  <div className="flex-1">
                    <label htmlFor="wc-signed" className={LABEL}>
                      Date signed
                    </label>
                    <input
                      id="wc-signed"
                      type="date"
                      value={signedOn}
                      max={max}
                      onChange={(e) => setSignedOn(e.target.value)}
                      disabled={save === "saving"}
                      className={FIELD}
                    />
                  </div>
                </div>
                {relationship === OTHER ? (
                  <div>
                    <label htmlFor="wc-other" className={LABEL}>
                      Their relationship, as on the form
                    </label>
                    <input
                      id="wc-other"
                      value={otherRelationship}
                      onChange={(e) => setOtherRelationship(e.target.value)}
                      maxLength={80}
                      disabled={save === "saving"}
                      className={FIELD}
                    />
                  </div>
                ) : null}
              </div>
            </div>

            <div>
              <span className="mb-3 block text-[11.5px] font-semibold tracking-[0.05em] text-nevo-near-black/50 uppercase">
                The signed form
              </span>
              {file ? (
                <div className="flex items-center gap-[13px] rounded-xl bg-nevo-cream-elevated px-4 py-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
                  <div className="h-14 w-11 flex-none rounded-md border border-nevo-near-black/14 bg-nevo-cream" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-semibold text-nevo-near-black">{file.name}</div>
                    <div className="text-[12.5px] text-nevo-near-black/60">{sizeLine(file)}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                    disabled={save === "saving"}
                    className="cursor-pointer text-[12.5px] font-semibold text-nevo-navy hover:underline"
                  >
                    Replace
                  </button>
                </div>
              ) : null}
              <label
                className={cn(
                  "flex cursor-pointer items-center justify-center gap-[9px] rounded-[10px] border-[1.5px] border-dashed border-nevo-navy/35 p-4 text-[13.5px] font-semibold text-nevo-navy",
                  file && "mt-3",
                )}
              >
                {file ? "Take a photo or upload another" : "Take a photo or upload the form"}
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
                  className="sr-only"
                  disabled={save === "saving"}
                  onChange={(e) => {
                    const picked = e.target.files?.[0];
                    if (picked) setFile(picked);
                    e.target.value = "";
                  }}
                />
              </label>
              <p className="mx-0.5 mt-3 mb-0 text-[12.5px] leading-[1.55] text-nevo-near-black/58">
                The photo is kept as the evidence for this consent. A school
                office usually photographs rather than scans &ndash; either is
                fine.
              </p>

              {save === "failed" ? (
                <div className="mt-3">
                  <FailureLine>
                    {note ?? "That didn’t save, so nothing has been recorded. Try again in a moment."}
                  </FailureLine>
                </div>
              ) : null}

              <div className="mt-4 flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={submit}
                  disabled={!valid || save === "saving"}
                  className={cn(PRIMARY_BTN, "justify-center")}
                >
                  {save === "saving" ? "Saving…" : "Save consent record"}
                </button>
                <Link href={toStudent} className={GHOST_BTN}>
                  Cancel
                </Link>
              </div>

              <div className="mt-5">
                <ConsentFormDownload studentId={studentId} label="Download the form for this child" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
