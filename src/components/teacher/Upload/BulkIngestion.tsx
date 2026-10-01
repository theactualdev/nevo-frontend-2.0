"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SampleRegion } from "@/components/shared/SampleRegion";
import { uploadsApi, type BatchResult } from "@/lib/api/uploads";
import { getToken } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

/**
 * C07h Bulk Curriculum Ingestion: a whole term's scheme of work at once.
 * Linear - upload, parse, results. The results heading is warm ("Here's what
 * we found") and anything needing attention is "a quick look", never
 * "errors". Lesson-level outcomes only.
 *
 * A STANDALONE takeover screen per the frame (no sidebar): rendered as a
 * fixed full-viewport layer over the console shell. The top bar carries the
 * close X on idle only - the frame drops it while parsing - and swaps to the
 * "Add all to library" commit action on results.
 *
 * DESIGN FLAG (in the PR): this linear term flow sits beside the C07 wizard's
 * SCRUM-102 term path (staged parse + tree). Nothing in the C07g audit
 * supersedes C07h, so it ships as designed; which affordance opens it is
 * design's call.
 *
 * THE BATCH IS REAL. `POST /api/v1/uploads/batch` shipped 1 Sep - up to 20
 * files, each reporting its own outcome - so the sorting beat that stood in
 * for it is gone for a signed-in teacher. The signed-out demo keeps it.
 *
 * WHAT THE RESULTS ACTUALLY ARE. The frame lists LESSONS ("Introduction to
 * Algebra - Week 1"); the batch endpoint reports FILES - a filename, whether
 * it was accepted, and the server's reason when it was not.
 *
 * The lesson TITLE now arrives too. `lessonTitle` landed on the upload status
 * response on 3 Sep, so each accepted upload can be asked what the parse
 * decided it was called, and a teacher sees "Simplifying Expressions" rather
 * than "wk2-final-v3.docx".
 *
 * DOING IT ONCE MEANT DOING IT TOO EARLY, and the feature has been off since
 * the day it shipped. `POST /api/v1/uploads/batch` returns as soon as the files
 * are ACCEPTED; the parse then runs in the background, and `lessonTitle` cannot
 * exist until it has read the file. So the single read fired against a job that
 * had been alive for milliseconds, every title came back null, and every row
 * fell back to its filename - which is exactly what the screen did before 3 Sep.
 * Nothing looked broken, because the fallback is the old behaviour.
 *
 * Measured on a live upload on 23 Sep: the first title could not have arrived
 * before ~30 seconds. So this now ASKS AGAIN until each accepted upload settles,
 * and rows gain their titles as they land.
 *
 * Failures are still absorbed, and an upload whose status read is REFUSED is
 * dropped from the asking rather than retried for ever. A title is an
 * improvement on the filename, never a precondition for showing the row, and
 * this screen spent the whole of a three-week window in which that route
 * answered 500 - retrying would have been an endless request loop behind a
 * teacher's back.
 *
 * TODO(api): Drive/OneDrive imports. `POST /api/v1/uploads/import` EXISTS and
 * takes `{sourceType, fileId}` - so the import itself is no longer the gap. The
 * gap is obtaining a `fileId`: that needs Google's Picker or Microsoft Graph in
 * the browser, with per-school OAuth client ids. Until then the two buttons are
 * not rendered - see the note where they used to be.
 */

type Phase = "idle" | "parsing" | "results";

const TOTAL = 13;
const SORT_MS = 460;
/**
 * How often to ask an accepted upload what the parse has called it.
 *
 * Slower than the wizard's 2s, because this screen asks for up to twenty at
 * once and the answer it wants cannot arrive for half a minute.
 */
const TITLE_POLL_MS = 4000;
/**
 * What a poll learned about one accepted upload.
 *
 * ACCEPTED IS NOT PARSED, and that gap is the whole reason this exists. The
 * batch POST answers when the files are taken; the parse then runs for minutes
 * and can die. Design, 24 Sep: *"the row has to change and own it... keeping
 * the filename and looking like the others is the worst version, because the
 * teacher walks away believing it worked."*
 */
type Outcome = {
  /** The parse's own name for it, once there is one. */
  title?: string;
  /** Terminal state, so the row can stop saying "being read". */
  status?: string;
  /** Prose, promised - never `error`, which is a driver exception. */
  failureReason?: string | null;
  /** For a teacher to quote. A parse dies behind the response, so there is no
   *  500 for a reference to ride on; it is a field on the job instead. */
  incidentId?: string | null;
};
/** An upload that has stopped moving has whatever title it is ever getting. */
const FINISHED: ReadonlySet<string> = new Set([
  "ready",
  "confirmed",
  "failed",
  "cancelled",
]);

const READY: { title: string; wk: string }[] = [
  { title: "Introduction to Algebra", wk: "Week 1" },
  { title: "Simplifying Expressions", wk: "Week 2" },
  { title: "Solving Linear Equations", wk: "Week 3" },
  { title: "Simplifying Algebraic Fractions", wk: "Week 4" },
  { title: "Angles & Triangles", wk: "Week 5" },
  { title: "Introduction to Statistics", wk: "Week 6" },
];

const REVIEW: { title: string; reason: string }[] = [
  {
    title: "Quadratic Patterns",
    reason: "The diagrams came through as images - a quick check that the labels read correctly.",
  },
  {
    title: "Word Problems: Rates & Ratios",
    reason: "A couple of sections ran together. Worth confirming where one question ends and the next begins.",
  },
];

/** The parse's own name for an upload, once it has one. */
function titleOf(
  uploadId: string | null,
  outcomes: Record<string, Outcome>,
): string | undefined {
  return uploadId ? outcomes[uploadId]?.title : undefined;
}

/**
 * The failure, when this upload's parse died - and nothing at all otherwise.
 *
 * ACCEPTED IS NOT PARSED. A row with no outcome yet is still being read, which
 * is not the same as having worked; only `status: "failed"` says it stopped.
 */
function diedOf(
  uploadId: string | null,
  outcomes: Record<string, Outcome>,
): Outcome | null {
  if (!uploadId) return null;
  const o = outcomes[uploadId];
  return o && o.status === "failed" ? o : null;
}

export function BulkIngestion() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [sorted, setSorted] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [batch, setBatch] = useState<BatchResult | null>(null);
  /**
   * uploadId -> what the parse has said about it so far.
   *
   * WAS `titles`, a map of strings, and a title was all this screen read. The
   * same poll has always carried the outcome too, and dropping it is how a
   * row could go on looking like a success for a parse that had failed.
   */
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});

  /**
   * The accepted uploads still worth asking about: their parse has not
   * settled, so a title may yet arrive.
   *
   * Emptying this is what stops the asking. Each round writes a NEW list even
   * when the same ids are still in flight, which is what re-arms the effect
   * below - the same shape as the wizard's poll, for the same reason.
   */
  const [awaitingTitles, setAwaitingTitles] = useState<string[]>([]);
  /**
   * The files this batch was made of, kept so one of them can be sent again.
   * A ref, read only in the resend handler - never during render, where its
   * length would be a value React cannot see change. `submitted` is the
   * rendered count.
   *
   * NOTHING IN THE CONTRACT RE-RUNS A FAILED PARSE, and that is worth writing
   * down because design asked for a retry and the obvious routes do not do it.
   * `retry-pages` needs page numbers and takes at least one - a parse that
   * died wholesale reports no failed pages. `regenerate` needs a lesson id,
   * and a staged upload that failed reports `structure.lessonId: null`.
   *
   * So the retry is what a teacher would do by hand: send that one file again.
   * The browser still holds it while these results are on screen, and this
   * screen is a takeover that loses its results on reload anyway - so the
   * control exists exactly as long as it can work.
   */
  const sentFiles = useRef<File[]>([]);
  /** The row a retry is in flight for, so it cannot be pressed twice. */
  const [resending, setResending] = useState<number | null>(null);
  /**
   * Keep asking the accepted uploads what the parse called them.
   *
   * Every read is settled independently: one slow or missing title must not
   * hold up the other nineteen, and titles are merged in a batch so the list
   * does not repaint per response.
   */
  useEffect(() => {
    if (awaitingTitles.length === 0) return;
    let cancelled = false;
    const ids = awaitingTitles;
    const t = setTimeout(() => {
      /*
       * ONE REQUEST FOR THE WHOLE BATCH, not one per upload.
       *
       * This asked each accepted upload separately - up to twenty requests a
       * round, every four seconds, for one field each. Backend added
       * `GET /api/v1/uploads` on 24 Sep to stop precisely that.
       *
       * NOT `unsettledOnly`, though a poll is what that flag is for. A job
       * that settles drops out of that answer, and settling is the moment its
       * title and its outcome come into existence - so this asks for the
       * recent window and matches on id. Headroom above the batch size,
       * because another tab's upload would otherwise push the oldest of this
       * batch out of the window.
       */
      void uploadsApi
        .list({ limit: Math.min(100, ids.length + 5) })
        .then((rows) => {
          if (cancelled) return;
          const byId = new Map(rows.map((r) => [r.id, r]));
          const found: Record<string, Outcome> = {};
          const again: string[] = [];
          ids.forEach((id) => {
            const row = byId.get(id);
            /*
             * AN ID THE WINDOW DID NOT COVER KEEPS ASKING. It is not evidence
             * of anything - the upload has not settled, it simply was not in
             * the answer - and treating absence as settled would leave a row
             * saying "being read" for ever.
             */
            if (!row) {
              again.push(id);
              return;
            }
            const title = row.lessonTitle?.trim();
            found[id] = {
              ...(title ? { title } : {}),
              status: row.status,
              failureReason: row.failureReason ?? null,
              incidentId: row.incidentId ?? null,
            };
            if (!FINISHED.has(row.status)) again.push(id);
          });
          if (Object.keys(found).length > 0) {
            setOutcomes((prev) => {
              const next = { ...prev };
              for (const [id, o] of Object.entries(found)) {
                next[id] = { ...next[id], ...o };
              }
              return next;
            });
          }
          setAwaitingTitles(again);
        })
        .catch(() => {
          /*
           * A REFUSED READ STOPS THE ASKING, as it did when this was twenty
           * requests. That route answered 500 for every in-flight upload for
           * three weeks; retrying until it answers would be an endless request
           * loop behind a teacher's back. Rows keep what they have.
           *
           * A MUTATION RUN CANNOT KILL THIS LINE, and it stays anyway. Removing
           * it looks equivalent: the effect re-arms only when `awaitingTitles`
           * gets a new reference, so leaving the list untouched also happens to
           * stop the loop. What it does not stop is the NEXT render - pressing
           * a resend, or any other state change - re-running the effect with the
           * old list still in it and resuming the poll against a route that is
           * refusing. Clearing it is the difference between stopped and
           * accidentally idle.
           */
          if (!cancelled) setAwaitingTitles([]);
        });
    }, TITLE_POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [awaitingTitles]);

  const [batchError, setBatchError] = useState("");
  /**
   * Whether this is the signed-out designed beat. Only `runDemo` advances
   * `sorted`, and `TOTAL` is the frame's hardcoded 13, so both belong to the
   * demo and neither describes a real batch.
   */
  const [demo, setDemo] = useState(false);
  /** How many files the teacher actually submitted. Known; the rest is not. */
  const [submitted, setSubmitted] = useState(0);
  const [committing, setCommitting] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  /** The designed demo beat - signed-out only. */
  const runDemo = () => {
    setPhase("parsing");
    setDemo(true);
    setSorted(0);
    let n = 0;
    const tick = () => {
      n += 1;
      if (n <= TOTAL) {
        setSorted(n);
        timer.current = setTimeout(tick, SORT_MS);
      } else {
        setPhase("results");
      }
    };
    timer.current = setTimeout(tick, SORT_MS);
  };

  const startParse = (files: File[]) => {
    if (!getToken()) {
      runDemo();
      return;
    }
    setPhase("parsing");
    // Not the demo, so the counted progress bar below stays off. `sorted` is
    // only ever advanced by `runDemo`; leaving the bar on meant a signed-in
    // teacher watched "0 of 13 lessons sorted" at 0% for the whole batch,
    // however many files they actually dropped.
    setDemo(false);
    setSubmitted(files.length);
    sentFiles.current = files;
    setBatch(null);
    setOutcomes({});
    setAwaitingTitles([]);
    setBatchError("");
    // `scope: "term"` - this screen is the term flow by definition.
    void uploadsApi
      .batch(files, "term")
      .then((res) => {
        setBatch(res);
        setPhase("results");
        setAwaitingTitles(
          res.uploads
            .filter((u) => u.accepted && u.uploadId)
            .map((u) => u.uploadId as string),
        );
      })
      .catch(() => {
        setBatchError(
          "We couldn’t send those just now. Nothing has been added - try again in a moment.",
        );
        setPhase("idle");
      });
  };

  /**
   * Send one file again, in place, after its parse died.
   *
   * POSITIONAL: the batch endpoint reports one row per file sent, in order, so
   * row `i` is file `i`. Guarded on the lengths agreeing rather than trusted,
   * because a mismatch would re-upload the wrong document - and doing nothing
   * is the only safe answer to not knowing which file a row is.
   */
  const resendOne = (i: number) => {
    /*
     * THE LENGTH CHECK IS IN THE RENDER, not here, and it was in both until a
     * mutation run removed this copy and killed nothing. It could not: the
     * control is only drawn when the lengths agree, and both conditions read
     * the same render's values, so this one was unreachable. A guard that
     * cannot fail reads as load-bearing to the next person and is not.
     */
    const file = sentFiles.current[i];
    if (!file || resending !== null) return;
    setResending(i);
    setBatchError("");
    void uploadsApi
      .create(file, "term")
      .then((res) => {
        setResending(null);
        // The row now describes a DIFFERENT upload, so its old outcome must go
        // with its old id - otherwise the failure it just reported outlives the
        // upload that failed.
        setBatch((prev) =>
          prev
            ? {
                ...prev,
                uploads: prev.uploads.map((u, j) =>
                  j === i
                    ? { ...u, uploadId: res.uploadId, accepted: true, error: null }
                    : u,
                ),
              }
            : prev,
        );
        setAwaitingTitles((prev) => [...prev, res.uploadId]);
      })
      .catch(() => {
        setResending(null);
        setBatchError(
          "We couldn’t send that one again just now. Nothing else has changed - try in a moment.",
        );
      });
  };

  /**
   * One confirm per accepted upload, with `allSettled` so a single failure
   * does not report the whole batch as unsent - and so a partial outcome can
   * name what did land.
   */
  const addAll = async () => {
    const accepted = (batch?.uploads ?? []).filter((u) => u.accepted && u.uploadId);
    if (accepted.length === 0) return;
    setCommitting(true);
    setBatchError("");
    const results = await Promise.allSettled(
      accepted.map((u) => uploadsApi.confirm(u.uploadId as string)),
    );
    setCommitting(false);
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed === 0) {
      close();
      return;
    }
    if (failed === accepted.length) {
      setBatchError(
        "We couldn’t add those to your library just now. Nothing has changed - try again in a moment.",
      );
      return;
    }
    setBatchError(
      `Added ${accepted.length - failed} of ${accepted.length}. The rest didn’t go through - reopen this to try them again.`,
    );
  };

  const close = () => router.push("/teacher/lessons");

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-nevo-cream text-nevo-near-black">
      {/* Top bar */}
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-nevo-near-black/8 px-7 xl:h-[72px] xl:px-8">
        {phase === "results" ? (
          <>
            <span className="text-[14.5px] font-medium text-nevo-near-black/70 xl:text-[15px]">
              Add a term&rsquo;s material
            </span>
            <button
              type="button"
              onClick={() => (batch ? void addAll() : close())}
              disabled={committing || (batch !== null && batch.acceptedCount === 0)}
              className={cn(
                "flex h-[42px] items-center rounded-[10px] px-5 text-sm font-semibold xl:h-11 xl:px-[22px] xl:text-[14.5px]",
                committing || (batch !== null && batch.acceptedCount === 0)
                  ? "cursor-not-allowed bg-nevo-navy/18 text-nevo-near-black/40"
                  : "cursor-pointer bg-nevo-navy text-nevo-cream transition-[filter] hover:brightness-93",
              )}
            >
              <span className="xl:hidden">
                {committing ? "Adding…" : "Add all"}
              </span>
              <span className="hidden xl:inline">
                {committing ? "Adding…" : "Add all to library"}
              </span>
            </button>
          </>
        ) : (
          <>
            {phase === "idle" ? (
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="flex size-10 cursor-pointer items-center justify-center rounded-[10px] text-nevo-near-black/60 transition-colors hover:bg-nevo-near-black/5"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            ) : (
              <span className="w-10" />
            )}
            <span className="text-[15px] font-medium text-nevo-near-black/70">
              Add a term&rsquo;s material
            </span>
            <span className="w-10" />
          </>
        )}
      </div>

      {phase === "idle" && (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-7 py-6 xl:px-8">
          <div className="w-full max-w-[560px] xl:max-w-[620px]">
            <h2 className="mb-1.5 text-[23px] font-semibold tracking-[-0.015em] xl:text-[26px]">
              Upload your term&rsquo;s material
            </h2>
            <p className="mb-5 text-[14.5px] leading-[1.55] text-nevo-near-black/66 xl:mb-[22px] xl:text-[15.5px]">
              Drop the whole scheme of work in - Nevo will sort it into
              individual lessons for you.
            </p>
            <input
              ref={fileInput}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.ppt,.pptx"
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (files.length) startParse(files);
              }}
            />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const dropped = Array.from(e.dataTransfer.files ?? []);
                if (dropped.length) startParse(dropped);
              }}
              className={cn(
                "flex w-full cursor-pointer flex-col items-center rounded-[16px] border-2 border-dashed bg-nevo-violet/8 px-7 py-9 text-center transition-[filter,border-color] hover:brightness-[0.99] xl:px-8 xl:py-11",
                dragOver ? "border-nevo-navy" : "border-nevo-violet/75",
              )}
            >
              <span className="flex size-[58px] items-center justify-center rounded-[16px] bg-nevo-violet/24 text-nevo-navy xl:size-16">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 16V4" />
                  <path d="M7 9l5-5 5 5" />
                  <path d="M5 20h14" />
                </svg>
              </span>
              <p className="mt-4 text-base font-medium xl:mt-[18px] xl:text-[17px]">
                Drop your files here, or click to browse
              </p>
              <p className="mt-[7px] text-[13.5px] text-nevo-near-black/55 xl:mt-2 xl:text-sm">
                PDF, Word, or PowerPoint &middot; several at once is fine
              </p>
            </button>
            {/*
              "OR BRING IT FROM GOOGLE DRIVE / ONEDRIVE" USED TO BE DRAWN HERE,
              as two buttons with no handler and a divider introducing them. A
              teacher whose files live in Drive - which is most of them - clicked
              one of those and nothing at all happened.

              The precedent is in this directory: "a rung with nowhere to go
              should not offer to take you there" (`ParseProgress`, on a control
              that pointed at a route that served a fixture). The divider goes
              with them, because "or bring it from" introduces nothing.

              WHAT IT WOULD TAKE, since the row that tracked this said "blocked
              on per-school credentials" and that is now only half true.
              `POST /api/v1/uploads/import` exists and takes
              `{sourceType: "google_drive" | "onedrive", fileId}`, so the import
              is built. What nobody has is a `fileId`: obtaining one means
              running Google's Picker or Microsoft Graph in this browser, which
              needs an OAuth client id per school. That is the ask, and it is
              not a frontend afternoon.
            */}
          </div>
        </div>
      )}

      {phase === "parsing" && (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-7 py-6 xl:px-8">
          <div className="flex flex-col items-center text-center">
            <span className="block size-[42px] rounded-full border-[3px] border-nevo-navy/20 border-t-nevo-navy motion-safe:animate-spin motion-safe:[animation-duration:1s] xl:size-11" />
            <h2 className="mt-[22px] text-[21px] font-semibold tracking-[-0.01em] xl:mt-6 xl:text-[23px]">
              Working through your material&hellip;
            </h2>
            <p className="mt-[9px] max-w-[360px] text-[14.5px] leading-[1.55] text-nevo-near-black/66 xl:mt-2.5 xl:max-w-[380px] xl:text-[15.5px]">
              This one&rsquo;s a bigger read - a term&rsquo;s worth. Feel free
              to carry on elsewhere; we&rsquo;ll have it ready shortly.
            </p>
            {/*
              A COUNTED BAR ONLY WHERE THERE IS A COUNT.
              
              `TOTAL` is the frame's 13 and `sorted` is advanced only by
              `runDemo`, so on the live path this rendered "0 of 13 lessons
              sorted" at 0% for the entire batch - a number belonging to
              neither the teacher's files nor their progress.
              
              The batch endpoint reports FILES accepted, not lessons sorted, and
              there is no per-lesson progress on the wire. So the live path says
              what it knows - how many files went - and lets the spinner above
              carry the waiting. Inventing a denominator is how the fixture got
              here in the first place.
            */}
            {demo ? (
              <>
                <div className="mt-[22px] h-1.5 w-[300px] overflow-hidden rounded-full bg-nevo-navy/14 xl:mt-6 xl:w-[320px]">
                  <span
                    className="block h-full rounded-full bg-nevo-navy transition-[width] duration-[300ms] ease-out"
                    style={{ width: `${Math.round((sorted / TOTAL) * 100)}%` }}
                  />
                </div>
                <span className="mt-[11px] text-[13px] text-nevo-near-black/55 xl:mt-3 xl:text-[13.5px]">
                  {sorted} of {TOTAL} lessons sorted
                </span>
              </>
            ) : (
              submitted > 0 && (
                <span className="mt-[22px] text-[13px] text-nevo-near-black/55 xl:mt-6 xl:text-[13.5px]">
                  {`${submitted} ${submitted === 1 ? "file" : "files"} sent for reading`}
                </span>
              )
            )}
          </div>
        </div>
      )}

      {phase === "results" && (
        <div className="flex min-h-0 flex-1 justify-center overflow-y-auto px-7 pt-6 pb-7 xl:px-8 xl:pb-8">
          <div className="w-full max-w-[600px] xl:max-w-[660px]">
            <h2 className="text-[23px] font-semibold tracking-[-0.015em] xl:mt-2 xl:text-[26px]">
              Here&rsquo;s what we found
            </h2>
            {batch ? (
              <>
                <p className="mt-[9px] text-[14.5px] leading-[1.55] text-nevo-near-black/66 xl:mt-2.5 xl:text-[15.5px]">
                  {batch.rejectedCount === 0
                    ? `All ${batch.acceptedCount} came through cleanly.`
                    : `${batch.acceptedCount} came through cleanly. ${batch.rejectedCount} ${batch.rejectedCount === 1 ? "needs" : "need"} a quick look.`}
                </p>

                {batchError && (
                  <p className="mt-3 rounded-[10px] bg-nevo-violet/14 px-[15px] py-3 text-[13px] leading-[1.5] text-nevo-near-black/78">
                    {batchError}
                  </p>
                )}

                {/* Per FILE, because that is what the endpoint reports. A
                    rejected file carries the server's own reason and sits on
                    its own line - it has not sunk the others. */}
                <div className="mt-[22px] overflow-hidden rounded-xl bg-nevo-cream-elevated shadow-[0_2px_8px_rgba(0,0,0,0.06)] xl:mt-6">
                  {batch.uploads.map((u, i) => (
                    <div
                      key={`${u.filename}-${i}`}
                      className={cn(
                        "flex items-start gap-3 px-[18px] py-3.5",
                        i < batch.uploads.length - 1 &&
                          "border-b border-nevo-near-black/7",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-px shrink-0",
                          u.accepted && !diedOf(u.uploadId, outcomes)
                            ? "text-nevo-navy"
                            : "text-nevo-violet",
                        )}
                      >
                        {u.accepted && !diedOf(u.uploadId, outcomes) ? (
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M20 6L9 17l-5-5" />
                          </svg>
                        ) : u.accepted ? (
                          /* A READING THAT STOPPED, not a flawed page. The
                             same mark the single-lesson failure screen uses,
                             because it is the same event. Violet, never red -
                             the frame is explicit about that. */
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M4 5a2 2 0 0 1 2-2h5v16H6a2 2 0 0 0-2 2z" />
                            <path d="M15 8v8M19 8v8" />
                          </svg>
                        ) : (
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <circle cx="12" cy="12" r="9" />
                            <path d="M12 8v5M12 16h.01" />
                          </svg>
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        {/* The parse's own title when it has one, with the
                            filename kept beneath it - a teacher recognises
                            what they dragged in, and sees what Nevo made of
                            it. Filename alone until the title arrives. */}
                        <div className="truncate text-[14.5px] font-medium text-nevo-near-black">
                          {titleOf(u.uploadId, outcomes) || u.filename}
                        </div>
                        {titleOf(u.uploadId, outcomes) && (
                          <div className="mt-[3px] truncate text-[12.5px] text-nevo-near-black/50">
                            {u.filename}
                          </div>
                        )}
                        {!u.accepted && (
                          <div className="mt-[3px] text-[13px] leading-[1.45] text-nevo-near-black/62">
                            {u.error ?? "Nevo couldn’t read this one."}
                          </div>
                        )}
                        {/*
                          ACCEPTED, THEN FAILED - the state design ruled into
                          existence on 24 Sep. *"The row has to change and own
                          it... keeping the filename and looking like the others
                          is the worst version, because the teacher walks away
                          believing it worked."*
                          It says the file WAS taken, that the reading is what
                          stopped, why when the server said, and offers the one
                          action that exists.
                        */}
                        {u.accepted && diedOf(u.uploadId, outcomes) && (
                          <div className="mt-[3px]">
                            <div className="text-[13px] leading-[1.45] text-nevo-near-black/62">
                              {/* `failureReason` is the field that promises
                                  prose. `error` is a driver exception and is
                                  not shown anywhere. */}
                              {diedOf(u.uploadId, outcomes)?.failureReason ??
                                "We took this one, and the reading stopped partway. That is ours to sort out."}
                            </div>
                            {diedOf(u.uploadId, outcomes)?.incidentId && (
                              <div className="mt-[3px] text-[12px] text-nevo-near-black/50">
                                {"If you tell us about this, quote "}
                                <span className="font-mono text-nevo-near-black/70">
                                  {diedOf(u.uploadId, outcomes)?.incidentId}
                                </span>
                                {"."}
                              </div>
                            )}
                            {/* `submitted` RATHER THAN THE REF'S LENGTH, and
                                not a style choice: reading a ref during render
                                is a lint error here, and rightly - a render
                                that depends on a ref does not re-run when the
                                ref changes. The count is already state, set
                                from the same files. */}
                            {submitted === batch.uploads.length && (
                              <button
                                type="button"
                                onClick={() => resendOne(i)}
                                disabled={resending !== null}
                                className="mt-2 inline-flex cursor-pointer items-center rounded-lg border-[1.5px] border-nevo-navy/30 px-[11px] py-[5px] text-[12px] font-semibold whitespace-nowrap text-nevo-navy transition-colors hover:bg-nevo-navy/6 disabled:cursor-default disabled:opacity-55"
                              >
                                {resending === i
                                  ? "Sending\u2026"
                                  : "Send this one again"}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
            <p className="mt-[9px] text-[14.5px] leading-[1.55] text-nevo-near-black/66 xl:mt-2.5 xl:text-[15.5px]">
              <span className="xl:hidden">
                Eleven came through cleanly. Two need a quick look.
              </span>
              <span className="hidden xl:inline">
                Eleven lessons came through cleanly. Two just need a quick look
                from you before they&rsquo;re ready.
              </span>
            </p>
            )}

            {/* The frame's 13 lessons back the signed-out demo only - a
                real batch reports files, and those render above. */}
            {!batch && (
            <SampleRegion kind="teacher:bulk-demo">
            <div className="mt-[22px] flex items-center gap-2.5 xl:mt-6">
              <span className="text-nevo-navy">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </span>
              <h3 className="text-[13.5px] font-semibold tracking-[0.02em] text-nevo-near-black/60 uppercase xl:text-sm">
                <span className="xl:hidden">Ready &middot; 11</span>
                <span className="hidden xl:inline">Ready to go &middot; 11 lessons</span>
              </h3>
            </div>
            <div className="mt-3 overflow-hidden rounded-xl bg-nevo-cream-elevated shadow-[0_2px_8px_rgba(0,0,0,0.06)] xl:mt-3.5">
              {READY.map((r, i) => (
                <div
                  key={r.title}
                  className={cn(
                    "flex items-center gap-3 px-[18px] py-3 xl:gap-3.5 xl:px-5 xl:py-3.5",
                    i < READY.length - 1 && "border-b border-nevo-near-black/7",
                  )}
                >
                  <span className="shrink-0 text-nevo-navy">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  </span>
                  <span className="flex-1 text-[14.5px] font-medium xl:text-[15px]">
                    {r.title}
                  </span>
                  <span className="shrink-0 text-[12.5px] text-nevo-near-black/50 xl:text-[13px]">
                    {r.wk}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-[22px] flex items-center gap-2.5 xl:mt-[26px]">
              <span className="flex size-[17px] items-center justify-center rounded-full border-2 border-nevo-violet text-nevo-navy xl:size-[18px]">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 8v5" />
                  <path d="M12 16h.01" />
                </svg>
              </span>
              <h3 className="text-[13.5px] font-semibold tracking-[0.02em] text-nevo-near-black/60 uppercase xl:text-sm">
                <span className="xl:hidden">A quick look &middot; 2</span>
                <span className="hidden xl:inline">A quick look needed &middot; 2 lessons</span>
              </h3>
            </div>
            <div className="mt-3 flex flex-col gap-2.5 xl:mt-3.5 xl:gap-[11px]">
              {REVIEW.map((v) => (
                <div
                  key={v.title}
                  className="flex cursor-pointer items-center gap-4 rounded-xl border-l-[3px] border-nevo-violet bg-nevo-cream-elevated px-[18px] py-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.06)] xl:px-5 xl:py-4"
                >
                  <div className="min-w-0 flex-1">
                    <span className="text-[14.5px] font-semibold xl:text-[15px]">
                      {v.title}
                    </span>
                    <p className="mt-1 text-[13px] leading-[1.45] text-nevo-near-black/66 xl:text-[13.5px]">
                      {v.reason}
                    </p>
                  </div>
                  <span className="hidden shrink-0 text-[13.5px] font-medium text-nevo-navy xl:inline">
                    Take a look &rarr;
                  </span>
                </div>
              ))}
            </div>
            </SampleRegion>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
