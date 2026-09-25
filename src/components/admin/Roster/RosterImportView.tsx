"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ReadFailed } from "../ReadFailed";
import { CARD } from "./primitives";
import {
  onboardingApi,
  type OnboardingState,
  type RejectedRow,
} from "@/lib/api/onboarding";
import { ApiError, apiErrorMessage } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import {
  foundCounts,
  hasStaged,
  mayConfirm,
  rejectedCsv,
  toFixLabel,
} from "./rosterImport";

/**
 * D24 OB-01 "Add your roster" and OB-02 "What Nevo found".
 *
 * A PERMANENT CONSOLE SCREEN, not a wizard step. The frame says so plainly:
 * *"The same screen a school returns to later to add students mid-term."* So
 * it lives at its own route and reads its state on mount rather than being
 * handed anything.
 *
 * TWO FILES, INDEPENDENTLY, IN ANY ORDER. *"Upload either file first -
 * whichever arrives first sets the class list."* Each upload is its own call
 * and returns the whole `OnboardingState`, which is what makes the screen
 * resumable: nothing is remembered between uploads, it is re-read from the
 * answer.
 *
 * NOTHING IS CREATED UNTIL CONFIRM. Backend's own words on the import route:
 * *"Read a file and propose what is in it. Nothing is created here."* That is
 * the promise OB-01's last line makes to the school, and it is the server's to
 * keep - this screen just does not pretend otherwise.
 *
 * NEVER RED, AND NEVER A COUNT ALONE. *"Every rejection names the row, the
 * value, the reason and the fix. No error is only a count. Nothing here is red
 * or urgent - the number states the position and leaves it."*
 *
 * ============================================================================
 * TWO THINGS THE FRAME DRAWS THAT NOTHING CAN FILL:
 *
 * - **"Expected columns"**, shown BEFORE upload rather than after a failure,
 *   and **"Download the … template"**. No endpoint serves either, and the
 *   column names are the one thing here that must not be guessed: a school
 *   that reformats four hundred rows to a header we invented gets four hundred
 *   rejections. Absent rather than wrong.
 *   TODO(api): the expected columns per `kind`, and a template file.
 *
 *   25 Sep, backend named them - and THE FRAME'S LIST IS WRONG. Students:
 *   first_name · last_name · class · date_of_birth · parent_name ·
 *   parent_email. Teachers: first_name · last_name · email · class. All
 *   required. The frame's "Full name", "Class(es)" and missing Parent name
 *   would each fail a file drawn to it. Raised with design; until the frame
 *   is corrected the list stays absent, and a wrong file gets the server's
 *   own 400 naming what is missing (see `uploadFailed`).
 *
 * - **"Teachers found"**, a panel of names and initials. `OnboardingState`
 *   carries `teacherCount` and no teacher list, so the count renders and the
 *   panel does not.
 *   TODO(api): the derived teachers, the way `classes` carries the derived
 *   classes.
 */

type Phase = "loading" | "ready" | "failed";
type Kind = "teacher" | "student";

const KINDS: { kind: Kind; title: string; sub: string }[] = [
  {
    kind: "student",
    title: "Students",
    sub: "One row per student, with the class they are in.",
  },
  {
    kind: "teacher",
    title: "Staff",
    sub: "One row per member of staff, with the classes they teach.",
  },
];

export function RosterImportView() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [state, setState] = useState<OnboardingState | null>(null);
  /** Which kind is in flight, so only that panel shows a busy state. */
  const [uploading, setUploading] = useState<Kind | null>(null);
  /**
   * Which upload failed, and the server's reason when it gave one.
   *
   * THE REASON IS THE WHOLE POINT. Two refusals are not transient, and "try
   * again" is a lie for both: a file missing a required column (400
   * `missing_columns`, naming what is absent) and a school that is already
   * running (409 - *"Add people from the admin console instead."*). Retrying
   * either gets the same answer, so the server's sentence is shown instead.
   */
  const [uploadFailed, setUploadFailed] = useState<{
    kind: Kind;
    reason: string | null;
  } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmFailed, setConfirmFailed] = useState(false);
  /** OB-02 is a step forward from OB-01, not a different screen. */
  const [showFound, setShowFound] = useState(false);

  const load = useCallback(() => {
    onboardingApi
      .get()
      .then((s) => {
        setState(s);
        setPhase("ready");
      })
      .catch(() => setPhase("failed"));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const upload = (kind: Kind, file: File) => {
    setUploading(kind);
    setUploadFailed(null);
    onboardingApi
      .stageImport(kind, file)
      .then((s) => setState(s))
      /*
       * A FAILED UPLOAD LEAVES THE PREVIOUS STATE ALONE. Backend replaces a
       * file of the same kind on success; a failure replaced nothing, so the
       * screen must not clear what a school already staged.
       */
      .catch((err) =>
        setUploadFailed({
          kind,
          reason: err instanceof ApiError ? apiErrorMessage(err.detail) : null,
        }),
      )
      .finally(() => setUploading(null));
  };

  const confirm = () => {
    setConfirming(true);
    setConfirmFailed(false);
    onboardingApi
      .confirm()
      .then((s) => setState(s))
      .catch(() => setConfirmFailed(true))
      .finally(() => setConfirming(false));
  };

  if (phase === "loading") {
    return <div className={cn(CARD, "mt-5 h-[380px] animate-pulse")} />;
  }
  if (phase === "failed" || !state) {
    return (
      <ReadFailed
        what="your roster upload"
        onRetry={() => {
          setPhase("loading");
          load();
        }}
      />
    );
  }

  /*
   * AN ACTIVE SCHOOL DOES NOT UPLOAD A ROSTER. Backend, 25 Sep: the import
   * refuses a school past confirm, and must - confirm prices the whole file as
   * a fresh roster, so a running school would be invoiced a second time for
   * children it already pays for. Adding people mid-term is Students and
   * Teachers. The empty-state links still lead here, so the page says where
   * to go rather than offering two upload panels that can only fail.
   */
  if (state.stage === "activated") {
    return <AlreadyActive />;
  }

  const staged = hasStaged(state);
  const counts = foundCounts(state);

  return (
    <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
      <div className="mx-auto max-w-[860px]">
        <p className="m-0 text-[13px] text-nevo-near-black/55">
          {showFound ? "Getting to active · Add your roster" : "Getting to active"}
        </p>

        {showFound && staged ? (
          <WhatNevoFound
            state={state}
            counts={counts}
            confirming={confirming}
            confirmFailed={confirmFailed}
            onBack={() => setShowFound(false)}
            onConfirm={confirm}
          />
        ) : (
          <>
            <h2 className="mt-1.5 text-[23px] font-semibold tracking-[-0.018em] text-nevo-near-black xl:text-[28px]">
              Add your roster
            </h2>
            <p className="mt-2 max-w-[62ch] text-[15px] leading-[1.55] text-nevo-near-black/68">
              Nevo reads your class names out of these files and builds your
              classes for you. Upload either file first &ndash; whichever
              arrives first sets the class list.
            </p>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {KINDS.map((k) => (
                <DropPanel
                  key={k.kind}
                  title={k.title}
                  sub={k.sub}
                  busy={uploading === k.kind}
                  failed={uploadFailed?.kind === k.kind}
                  reason={uploadFailed?.kind === k.kind ? uploadFailed.reason : null}
                  onFile={(f) => upload(k.kind, f)}
                />
              ))}
            </div>

            <p className="mt-5 max-w-[62ch] text-[13px] leading-[1.55] text-nevo-near-black/55">
              You&rsquo;ll see and confirm everything Nevo derives on the next
              screen before anything is created.
            </p>

            {/*
              * The way forward exists only once something is staged. Before
              * that there is genuinely nothing to look at, and a button that
              * leads to an empty screen is worse than one that is not there.
              */}
            {staged ? (
              <button
                type="button"
                onClick={() => setShowFound(true)}
                className="mt-5 h-[48px] cursor-pointer rounded-[10px] bg-nevo-navy px-6 text-[15px] font-semibold text-nevo-cream transition-[filter] hover:brightness-110"
              >
                See what Nevo found
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function AlreadyActive() {
  return (
    <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
      <div className="mx-auto max-w-[860px]">
        <h2 className="m-0 text-[23px] font-semibold tracking-[-0.018em] text-nevo-near-black xl:text-[28px]">
          Your school is already set up
        </h2>
        <p className="mt-2 max-w-[62ch] text-[15px] leading-[1.55] text-nevo-near-black/68">
          The roster upload is for getting a school started. To add someone
          now, add a student from Students or invite a teacher from Teachers.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/admin/students"
            className="inline-flex h-[44px] cursor-pointer items-center rounded-[10px] bg-nevo-navy px-5 text-[14.5px] font-semibold text-nevo-cream transition-[filter] hover:brightness-110"
          >
            Go to Students
          </Link>
          <Link
            href="/admin/teachers"
            className="inline-flex h-[44px] cursor-pointer items-center rounded-[10px] border border-nevo-near-black/15 px-5 text-[14.5px] font-semibold text-nevo-near-black transition-colors hover:bg-nevo-near-black/[0.03]"
          >
            Go to Teachers
          </Link>
        </div>
      </div>
    </div>
  );
}

function DropPanel({
  title,
  sub,
  busy,
  failed,
  reason,
  onFile,
}: {
  title: string;
  sub: string;
  busy: boolean;
  failed: boolean;
  /** The server's sentence, when it gave one. See `uploadFailed`. */
  reason: string | null;
  onFile: (f: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <div className={cn(CARD, "px-[22px] py-[20px]")}>
      <h3 className="m-0 text-[16px] font-semibold text-nevo-near-black">
        {title}
      </h3>
      <p className="mt-1 text-[13px] leading-[1.5] text-nevo-near-black/58">
        {sub}
      </p>

      {/*
        * THE FRAME'S "Expected columns" LIST IS ABSENT. No endpoint serves the
        * column names and they are the one thing here that must not be
        * guessed - a school that reformats four hundred rows to a header we
        * invented gets four hundred rejections. See the header's TODO(api).
        */}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onFile(f);
        }}
        className={cn(
          "mt-4 flex h-[120px] flex-col items-center justify-center rounded-[10px] border border-dashed px-4 text-center transition-colors",
          over ? "border-nevo-navy bg-nevo-navy/[0.04]" : "border-nevo-near-black/20",
        )}
      >
        {busy ? (
          <span className="text-[13.5px] text-nevo-near-black/62">
            Reading your file&hellip;
          </span>
        ) : (
          <>
            <span className="text-[13.5px] text-nevo-near-black/62">
              Drop a file here or
            </span>
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="mt-1 cursor-pointer text-[13.5px] font-semibold text-nevo-navy hover:opacity-75"
            >
              browse
            </button>
          </>
        )}
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv"
          aria-label={`Upload ${title.toLowerCase()}`}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            // So the same file can be chosen twice after a correction.
            e.target.value = "";
          }}
        />
      </div>

      {failed ? (
        <p className="m-0 mt-3 text-[13px] leading-[1.5] text-nevo-navy">
          {reason ? (
            <>
              {reason} Nothing has changed.
            </>
          ) : (
            <>
              We couldn&rsquo;t read that just now. Nothing has changed &ndash;
              try again in a moment.
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}

function WhatNevoFound({
  state,
  counts,
  confirming,
  confirmFailed,
  onBack,
  onConfirm,
}: {
  state: OnboardingState;
  counts: ReturnType<typeof foundCounts>;
  confirming: boolean;
  confirmFailed: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const toFix = toFixLabel(counts.toFix);

  return (
    <>
      <h2 className="mt-1.5 text-[23px] font-semibold tracking-[-0.018em] text-nevo-near-black xl:text-[28px]">
        What Nevo found
      </h2>
      <p className="mt-2 max-w-[64ch] text-[15px] leading-[1.55] text-nevo-near-black/68">
        Nevo read your files and derived these classes, teachers and students.
        Nothing is created until you confirm.
      </p>

      <div className="mt-6 flex flex-wrap gap-3.5">
        <Tile n={counts.classes} label="classes" />
        <Tile n={counts.teachers} label="teachers" />
        <Tile n={counts.students} label="students read cleanly" />
        {/* Absent at zero: a clean file has no position to state. */}
        {toFix ? <Tile n={counts.toFix} label="rows to fix" /> : null}
      </div>

      {state.rejected.length > 0 ? (
        <RejectedList rows={state.rejected} />
      ) : null}

      {state.classes.length > 0 ? (
        <>
          <h3 className="mt-9 text-[13px] font-semibold tracking-[0.05em] text-nevo-near-black/50 uppercase">
            Classes Nevo derived
          </h3>
          <div className={cn(CARD, "mt-3 divide-y divide-nevo-near-black/7")}>
            {state.classes.map((c) => (
              <div
                key={c.normalisedName}
                className="flex items-center justify-between gap-4 px-[22px] py-3.5"
              >
                <span className="min-w-0 truncate text-[15px] font-semibold text-nevo-near-black">
                  {c.name}
                </span>
                <span className="shrink-0 text-[13.5px] text-nevo-near-black/62">
                  {c.studentCount}{" "}
                  {c.studentCount === 1 ? "student" : "students"}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {/*
        * "Teachers found" - the frame's panel of names and initials - is
        * ABSENT. `OnboardingState` carries `teacherCount` and no teacher list,
        * so the count is in the tiles above and the panel is not invented.
        * See the header's TODO(api).
        */}

      {confirmFailed ? (
        <p className="mt-6 max-w-[56ch] text-[13.5px] leading-[1.5] text-nevo-navy">
          We couldn&rsquo;t confirm that just now. Nothing has been created
          &ndash; your files are still here, so try again in a moment.
        </p>
      ) : null}

      <div className="mt-7 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onConfirm}
          disabled={confirming || !mayConfirm(state)}
          className="h-[48px] cursor-pointer rounded-[10px] bg-nevo-navy px-6 text-[15px] font-semibold text-nevo-cream transition-[filter] hover:brightness-110 disabled:cursor-default disabled:opacity-55 disabled:hover:brightness-100"
        >
          {confirming
            ? "Confirming…"
            : `Confirm ${counts.students} ${counts.students === 1 ? "student" : "students"}`}
        </button>
        <button
          type="button"
          onClick={onBack}
          className="h-[48px] cursor-pointer rounded-[10px] px-4 text-[15px] font-semibold text-nevo-near-black/70 transition-colors hover:bg-nevo-near-black/[0.05]"
        >
          Back to upload
        </button>
      </div>
    </>
  );
}

function Tile({ n, label }: { n: number; label: string }) {
  return (
    <div className={cn(CARD, "min-w-[140px] px-[20px] py-[16px]")}>
      <p className="m-0 text-[26px] font-semibold tracking-[-0.02em] text-nevo-near-black">
        {n}
      </p>
      <p className="m-0 mt-0.5 text-[13px] text-nevo-near-black/58">{label}</p>
    </div>
  );
}

/**
 * Every rejection, individually.
 *
 * *"No error is only a count."* The frame's own reasoning, and the same ruling
 * the invitation import already carries: a school creating thirty classes will
 * not notice a count of failures, and did not, when an import of four hundred
 * children reported only that some rows failed.
 *
 * The download is a client-side CSV because the fix happens in the spreadsheet
 * the file came from - OB-01's whole argument is that the format is strict, so
 * there is no inline editor here and the frame does not draw one.
 */
function RejectedList({ rows }: { rows: RejectedRow[] }) {
  const download = () => {
    const blob = new Blob([rejectedCsv(rows)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "rows-to-fix.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="mt-9 flex flex-wrap items-center justify-between gap-3">
        <h3 className="m-0 text-[13px] font-semibold tracking-[0.05em] text-nevo-near-black/50 uppercase">
          Rows to fix before these students can join
        </h3>
        <button
          type="button"
          onClick={download}
          className="cursor-pointer text-[13.5px] font-semibold text-nevo-navy hover:opacity-75"
        >
          Download the {rows.length} {rows.length === 1 ? "row" : "rows"}
        </button>
      </div>

      <div className={cn(CARD, "mt-3 divide-y divide-nevo-near-black/7")}>
        {rows.map((r) => (
          <div
            key={`${r.rowNumber}-${r.field}`}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-[22px] py-3.5"
          >
            <span className="text-[13px] font-semibold text-nevo-near-black/55">
              Row {r.rowNumber}
            </span>
            <span className="text-[15px] font-semibold break-all text-nevo-near-black">
              {r.value}
            </span>
            <span className="w-full text-[13.5px] leading-[1.5] text-nevo-near-black/62">
              {r.reason}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-3 max-w-[62ch] text-[13px] leading-[1.55] text-nevo-near-black/55">
        These can be fixed now or left for later &ndash; they simply won&rsquo;t
        join until they&rsquo;re sorted.
      </p>
    </>
  );
}
