"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SampleRegion } from "@/components/shared/SampleRegion";
import { uploadsApi, type BatchResult } from "@/lib/api/uploads";
import { getToken } from "@/lib/auth/session";
import { cn } from "@/lib/utils";
import { useSystemMessages } from "@/components/shared/SystemMessages";

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
/**
 * The results line, from what each file's reading actually came to (T95).
 *
 * "All N came through cleanly" was said from `acceptedCount` - files TAKEN,
 * before a page of any was read - and the file's own comment says accepted is
 * not parsed. While any is still being read this says what is known, in the
 * parsing screen's own words; once all have settled, C07h's sentences, counted
 * from the readings that finished. A reading that stopped needs a look, like a
 * refused file.
 */
function resultsLine(
  batch: { acceptedCount: number; rejectedCount: number },
  accepted: { uploadId: string | null }[],
  outcomes: Record<string, Outcome>,
): string {
  const reading = accepted.filter((u) => readingOf(u.uploadId, outcomes)).length;
  const refused = batch.rejectedCount;
  const needs = (n: number) => `${n} ${n === 1 ? "needs" : "need"} a quick look.`;
  if (reading > 0) {
    const sent = `${accepted.length} ${accepted.length === 1 ? "file" : "files"} sent for reading.`;
    return refused > 0 ? `${sent} ${needs(refused)}` : sent;
  }
  const ready = accepted.filter((u) => readyOf(u.uploadId, outcomes)).length;
  const look = refused + accepted.filter((u) => diedOf(u.uploadId, outcomes)).length;
  return look === 0 ? `All ${ready} came through cleanly.` : `${ready} came through cleanly. ${needs(look)}`;
}

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

/** C07h's "Couldn't be added" files, as drawn on 12 Oct. Sample only. */
const REFUSED: { file: string; reason: string }[] = [
  {
    file: "Term Overview.key",
    reason: "This is a Keynote file, which we can't open yet. A PDF or PowerPoint export of it will come straight in.",
  },
  {
    file: "Scheme of Work (scan).pdf",
    reason: "We started reading this but couldn't make out the text - it looks like a photo of a page. A clearer copy usually does it.",
  },
];

/** C07h's group heading: a small mark, then the group and its count. */
function GroupHead({
  mark,
  tablet,
  desktop,
  first = false,
}: {
  mark: "ready" | "reading" | "refused" | "look";
  tablet: string;
  desktop: string;
  first?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5",
        first ? "mt-[22px] xl:mt-6" : "mt-[22px] xl:mt-[26px]",
      )}
    >
      {mark === "ready" && (
        <span className="text-nevo-navy">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </span>
      )}
      {mark === "reading" && (
        <span
          aria-hidden
          className="block size-[17px] rounded-full border-2 border-nevo-navy/20 border-t-nevo-navy motion-safe:animate-spin motion-safe:[animation-duration:1s] xl:size-[18px]"
        />
      )}
      {(mark === "refused" || mark === "look") && (
        <span
          className={cn(
            "flex size-[17px] items-center justify-center rounded-full border-2 text-nevo-navy xl:size-[18px]",
            mark === "refused" ? "border-nevo-navy" : "border-nevo-violet",
          )}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            {mark === "refused" ? (
              <path d="M6 12h12" />
            ) : (
              <>
                <path d="M12 8v5" />
                <path d="M12 16h.01" />
              </>
            )}
          </svg>
        </span>
      )}
      <h3 className="text-[13.5px] font-semibold tracking-[0.02em] text-nevo-near-black/60 uppercase xl:text-sm">
        <span className="xl:hidden">{tablet}</span>
        <span className="hidden xl:inline">{desktop}</span>
      </h3>
    </div>
  );
}

const fileCount = (n: number) => `${n} ${n === 1 ? "file" : "files"}`;

/** C07h's card for a file that did not get in: navy rule, name, reason, action. */
const REFUSED_CARD =
  "flex items-start gap-3 rounded-[12px] border-l-[3px] border-nevo-navy bg-nevo-cream-elevated px-[18px] py-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.06)] xl:items-center xl:gap-4 xl:px-5 xl:py-4";
const REFUSED_ACTION =
  "inline-flex h-9 shrink-0 cursor-pointer items-center rounded-[10px] border-[1.5px] border-nevo-navy/35 px-[13px] text-[12.5px] font-semibold whitespace-nowrap text-nevo-navy transition-colors hover:bg-nevo-navy/6 disabled:cursor-default disabled:opacity-55 xl:h-10 xl:px-4 xl:text-[13.5px]";

/** The parse's own name for an upload, once it has one. */
function titleOf(
  uploadId: string | null,
  outcomes: Record<string, Outcome>,
): string | undefined {
  return uploadId ? outcomes[uploadId]?.title : undefined;
}

/**
 * STILL BEING READ (T95): taken, and the parse has said nothing final. The
 * row drew the navy tick the moment the batch was accepted, for a file whose
 * reading had not started - "came through cleanly" before anything had.
 */
function readingOf(
  uploadId: string | null,
  outcomes: Record<string, Outcome>,
): boolean {
  if (!uploadId) return false;
  const s = outcomes[uploadId]?.status;
  return !s || !FINISHED.has(s);
}

/** Read and ready to go into the library - the only state a confirm is for. */
function readyOf(
  uploadId: string | null,
  outcomes: Record<string, Outcome>,
): boolean {
  const s = uploadId ? outcomes[uploadId]?.status : undefined;
  return s === "ready" || s === "confirmed";
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
  /** Uploads already added this visit, so asking again adds only the rest. */
  const [added, setAdded] = useState<ReadonlySet<string>>(new Set());
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
  const resendOne = (i: number) => sendInPlace(i, sentFiles.current[i]);

  /**
   * C07h's "Replace this file" (12 Oct), for a file the batch refused: the
   * teacher picks another and it goes in that row's place, through the same
   * single-upload route the resend uses. The row then describes the new file,
   * name and all, and is asked about like any other accepted upload.
   */
  const replaceInput = useRef<HTMLInputElement>(null);
  const [replaceFor, setReplaceFor] = useState<number | null>(null);
  const replaceOne = (i: number, file: File) => {
    sentFiles.current[i] = file;
    sendInPlace(i, file);
  };

  function sendInPlace(i: number, file: File | undefined) {
    /*
     * THE LENGTH CHECK IS IN THE RENDER, not here, and it was in both until a
     * mutation run removed this copy and killed nothing. It could not: the
     * control is only drawn when the lengths agree, and both conditions read
     * the same render's values, so this one was unreachable. A guard that
     * cannot fail reads as load-bearing to the next person and is not.
     */
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
                    ? {
                        ...u,
                        filename: file.name,
                        uploadId: res.uploadId,
                        accepted: true,
                        error: null,
                      }
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
    /*
     * ONLY WHAT IS READY (T96). This confirmed every accepted upload - one
     * still being read, and one whose reading had died - from the first
     * render. The tree and module screens gate on `ready`; so does this.
     */
    const toAdd = (batch?.uploads ?? []).filter(
      (u) =>
        u.accepted &&
        u.uploadId &&
        readyOf(u.uploadId, outcomes) &&
        !added.has(u.uploadId),
    );
    if (toAdd.length === 0) return;
    setCommitting(true);
    setBatchError("");
    const results = await Promise.allSettled(
      toAdd.map((u) => uploadsApi.confirm(u.uploadId as string)),
    );
    setCommitting(false);
    const landed = toAdd
      .filter((_, i) => results[i].status === "fulfilled")
      .map((u) => u.uploadId as string);
    setAdded((prev) => new Set([...prev, ...landed]));
    const failed = toAdd.length - landed.length;
    if (failed === 0) {
      // C07d's own line, in the shared bar, before the Library arrives.
      say.show({ kind: "confirm", message: "Added to your library." });
      close();
      return;
    }
    if (landed.length === 0) {
      setBatchError(
        "We couldn’t add those to your library just now. Nothing has changed - try again in a moment.",
      );
      return;
    }
    // Pressing Add again adds only the rest: "reopen this" started an empty
    // screen, which was no way back to them at all.
    setBatchError(
      `Added ${landed.length} of ${toAdd.length}. The rest didn’t go through - try again in a moment.`,
    );
  };

  const close = () => router.push("/teacher/lessons");
  const say = useSystemMessages();
  /*
   * A WAY OUT OF EVERY BATCH. When every file was refused, "Add all" was
   * disabled and the close control lived only on the drop zone - on a
   * full-screen takeover, so the only exit was the browser's back button. A
   * close then appeared for that case alone; C07h (12 Oct) puts "Back to my
   * library" in the foot of every results screen instead, and the convention
   * behind it is design's: no screen leaves a teacher with only the browser's
   * back button.
   */
  const accepted = (batch?.uploads ?? []).filter((u) => u.accepted && u.uploadId);
  /** Still asking the parse about some of them, so the batch is not settled. */
  const stillReading = awaitingTitles.length > 0;
  const readyToAdd = accepted.filter(
    (u) => readyOf(u.uploadId, outcomes) && !added.has(u.uploadId as string),
  ).length;
  const addDisabled = committing || (batch !== null && (stillReading || readyToAdd === 0));

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
              disabled={addDisabled}
              className={cn(
                "flex h-[42px] items-center rounded-[10px] px-5 text-sm font-semibold xl:h-11 xl:px-[22px] xl:text-[14.5px]",
                addDisabled
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
            <h1 className="mb-1.5 text-[23px] font-semibold tracking-[-0.015em] xl:text-[26px]">
              Upload your term&rsquo;s material
            </h1>
            <p className="mb-5 text-[14.5px] leading-[1.55] text-nevo-near-black/66 xl:mb-[22px] xl:text-[15.5px]">
              Drop the whole scheme of work in - Nevo will sort it into
              individual lessons for you.
            </p>
            {/* A batch that never went returned the teacher here with no
                word: the sentence was set, and only the results screen read
                it. It belongs where they land. */}
            {batchError && (
              <p
                role="alert"
                className="mb-4 rounded-[10px] bg-nevo-violet/14 px-[15px] py-3 text-[13.5px] leading-[1.5] text-nevo-near-black/78"
              >
                {batchError}
              </p>
            )}
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
            <h1 className="mt-[22px] text-[21px] font-semibold tracking-[-0.01em] xl:mt-6 xl:text-[23px]">
              Working through your material&hellip;
            </h1>
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
              <SampleRegion kind="teacher:bulk-demo-progress">
                <div className="mt-[22px] h-1.5 w-[300px] overflow-hidden rounded-full bg-nevo-navy/14 xl:mt-6 xl:w-[320px]">
                  <span
                    className="block h-full rounded-full bg-nevo-navy transition-[width] duration-[300ms] ease-out"
                    style={{ width: `${Math.round((sorted / TOTAL) * 100)}%` }}
                  />
                </div>
                <span className="mt-[11px] block text-[13px] text-nevo-near-black/55 xl:mt-3 xl:text-[13.5px]">
                  {sorted} of {TOTAL} lessons sorted
                </span>
              </SampleRegion>
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
            <h1 className="text-[23px] font-semibold tracking-[-0.015em] xl:mt-2 xl:text-[26px]">
              Here&rsquo;s what we found
            </h1>
            {batch ? (
              <>
                <p className="mt-[9px] text-[14.5px] leading-[1.55] text-nevo-near-black/66 xl:mt-2.5 xl:text-[15.5px]">
                  {resultsLine(batch, accepted, outcomes)}
                </p>

                {batchError && (
                  <p className="mt-3 rounded-[10px] bg-nevo-violet/14 px-[15px] py-3 text-[13px] leading-[1.5] text-nevo-near-black/78">
                    {batchError}
                  </p>
                )}

                {/*
                  C07h'S GROUPS (12 Oct), per FILE, because that is what the
                  endpoint reports - design draws lessons, and a batch reports
                  files. Each file sits in the group its own state puts it in:
                  - Ready to go: the reading finished.
                  - Still being read: ours. C07h shows results once parsing
                    ends; this screen gets them as soon as the files are
                    taken, so a file can still be mid-read here.
                  - Couldn't be added: refused at the door (the server's own
                    reason, and C07h's "Replace this file"), or taken and then
                    the reading stopped (design, 24 Sep: the row owns it, and
                    "Send this one again").
                  C07h's "A quick look needed" group is not drawn: nothing on
                  the wire says a lesson needs a look, and absence is an
                  instruction.
                */}
                {(() => {
                  const rows = batch.uploads.map((u, i) => ({ u, i }));
                  const ready = rows.filter(
                    ({ u }) =>
                      u.accepted &&
                      !readingOf(u.uploadId, outcomes) &&
                      !diedOf(u.uploadId, outcomes),
                  );
                  const reading = rows.filter(
                    ({ u }) => u.accepted && readingOf(u.uploadId, outcomes),
                  );
                  const out = rows.filter(
                    ({ u }) => !u.accepted || diedOf(u.uploadId, outcomes),
                  );
                  // Positional, so only when the rows and the files sent agree
                  // (see `sendInPlace`).
                  const canAct = submitted === batch.uploads.length;
                  const listRow = (
                    { u, i }: { u: (typeof batch.uploads)[number]; i: number },
                    last: boolean,
                    waiting: boolean,
                  ) => (
                    <div
                      key={`${u.filename}-${i}`}
                      className={cn(
                        "flex items-start gap-3 px-[18px] py-3 xl:gap-3.5 xl:px-5 xl:py-3.5",
                        !last && "border-b border-nevo-near-black/7",
                      )}
                    >
                      <span className="mt-px shrink-0 text-nevo-navy">
                        {waiting ? (
                          /* Still being read: the waiting mark, never the
                             tick - the tick is for a reading that finished. */
                          <span
                            data-reading
                            className="mt-px block size-[15px] rounded-full border-2 border-nevo-navy/20 border-t-nevo-navy motion-safe:animate-spin motion-safe:[animation-duration:1s]"
                          />
                        ) : (
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M20 6L9 17l-5-5" />
                          </svg>
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        {/* The parse's own title when it has one, with the
                            filename kept beneath it - a teacher recognises
                            what they dragged in, and sees what Nevo made of
                            it. Filename alone until the title arrives. */}
                        <div className="truncate text-[14.5px] font-medium text-nevo-near-black xl:text-[15px]">
                          {titleOf(u.uploadId, outcomes) || u.filename}
                        </div>
                        {titleOf(u.uploadId, outcomes) && (
                          <div className="mt-[3px] truncate text-[12.5px] text-nevo-near-black/50">
                            {u.filename}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                  return (
                    <>
                      {ready.length > 0 && (
                        <>
                          <GroupHead
                            first
                            mark="ready"
                            tablet={`Ready \u00b7 ${ready.length}`}
                            desktop={`Ready to go \u00b7 ${fileCount(ready.length)}`}
                          />
                          <div className="mt-3 overflow-hidden rounded-[12px] bg-nevo-cream-elevated shadow-[0_2px_8px_rgba(0,0,0,0.06)] xl:mt-3.5">
                            {ready.map((r, k) => listRow(r, k === ready.length - 1, false))}
                          </div>
                        </>
                      )}
                      {reading.length > 0 && (
                        <>
                          <GroupHead
                            first={ready.length === 0}
                            mark="reading"
                            tablet={`Being read \u00b7 ${reading.length}`}
                            desktop={`Still being read \u00b7 ${fileCount(reading.length)}`}
                          />
                          <div className="mt-3 overflow-hidden rounded-[12px] bg-nevo-cream-elevated shadow-[0_2px_8px_rgba(0,0,0,0.06)] xl:mt-3.5">
                            {reading.map((r, k) => listRow(r, k === reading.length - 1, true))}
                          </div>
                        </>
                      )}
                      {out.length > 0 && (
                        <>
                          <GroupHead
                            first={ready.length === 0 && reading.length === 0}
                            mark="refused"
                            tablet={`Couldn\u2019t be added \u00b7 ${out.length}`}
                            desktop={`Couldn\u2019t be added \u00b7 ${fileCount(out.length)}`}
                          />
                          <div className="mt-3 flex flex-col gap-2.5 xl:mt-3.5 xl:gap-[11px]">
                            {out.map(({ u, i }) => {
                              const died = u.accepted ? diedOf(u.uploadId, outcomes) : undefined;
                              return (
                                <div key={`${u.filename}-${i}`} className={REFUSED_CARD}>
                                  <div className="min-w-0 flex-1">
                                    <div className="truncate text-[14.5px] font-semibold text-nevo-near-black xl:text-[15px]">
                                      {u.filename}
                                    </div>
                                    <p className="mt-1 text-[13px] leading-[1.45] text-nevo-near-black/66 xl:text-[13.5px]">
                                      {/* A refusal carries the server's own
                                          reason. A reading that stopped carries
                                          `failureReason`, the field that
                                          promises prose - never `error`, a
                                          driver exception shown nowhere. */}
                                      {died
                                        ? (died.failureReason ??
                                          "We took this one, and the reading stopped partway. That is ours to sort out.")
                                        : (u.error ?? "Nevo couldn\u2019t read this one.")}
                                    </p>
                                    {died?.incidentId && (
                                      <div className="mt-[3px] text-[12px] text-nevo-near-black/50">
                                        {"If you tell us about this, quote "}
                                        <span className="font-mono text-nevo-near-black/70">
                                          {died.incidentId}
                                        </span>
                                        {"."}
                                      </div>
                                    )}
                                  </div>
                                  {/* The one action each has. Refused at the
                                      door: a different file is the remedy
                                      (C07h). Taken and then stopped: the file
                                      was fine, so the same one again. */}
                                  {canAct &&
                                    (died ? (
                                      <button
                                        type="button"
                                        onClick={() => resendOne(i)}
                                        disabled={resending !== null}
                                        className={REFUSED_ACTION}
                                      >
                                        {resending === i ? "Sending\u2026" : "Send this one again"}
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setReplaceFor(i);
                                          replaceInput.current?.click();
                                        }}
                                        disabled={resending !== null}
                                        className={REFUSED_ACTION}
                                      >
                                        {resending === i ? "Sending\u2026" : "Replace this file"}
                                      </button>
                                    ))}
                                </div>
                              );
                            })}
                          </div>
                          <input
                            ref={replaceInput}
                            data-replace
                            type="file"
                            accept=".pdf,.doc,.docx,.ppt,.pptx"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              e.target.value = "";
                              if (file && replaceFor !== null) replaceOne(replaceFor, file);
                              setReplaceFor(null);
                            }}
                          />
                        </>
                      )}
                    </>
                  );
                })()}
              </>
            ) : (
            <SampleRegion kind="teacher:bulk-demo-summary">
            <p className="mt-[9px] text-[14.5px] leading-[1.55] text-nevo-near-black/66 xl:mt-2.5 xl:text-[15.5px]">
              <span className="xl:hidden">
                Eleven came through cleanly. Two need a quick look, and two we
                couldn&rsquo;t add.
              </span>
              <span className="hidden xl:inline">
                Eleven lessons came through cleanly. Two just need a quick
                look, and two files we couldn&rsquo;t add.
              </span>
            </p>
            </SampleRegion>
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
            <div className="mt-3 overflow-hidden rounded-[12px] bg-nevo-cream-elevated shadow-[0_2px_8px_rgba(0,0,0,0.06)] xl:mt-3.5">
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
                  className="flex cursor-pointer items-center gap-4 rounded-[12px] border-l-[3px] border-nevo-violet bg-nevo-cream-elevated px-[18px] py-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.06)] xl:px-5 xl:py-4"
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

            <GroupHead
              mark="refused"
              tablet={`Couldn\u2019t be added \u00b7 ${REFUSED.length}`}
              desktop={`Couldn\u2019t be added \u00b7 ${fileCount(REFUSED.length)}`}
            />
            <div className="mt-3 flex flex-col gap-2.5 xl:mt-3.5 xl:gap-[11px]">
              {REFUSED.map((x) => (
                <div key={x.file} className={REFUSED_CARD}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14.5px] font-semibold xl:text-[15px]">
                      {x.file}
                    </div>
                    <p className="mt-1 text-[13px] leading-[1.45] text-nevo-near-black/66 xl:text-[13.5px]">
                      {x.reason}
                    </p>
                  </div>
                  {/* The sample's action is drawn, not wired: there is no
                      file behind a sample row to replace. */}
                  <span className="inline-flex h-9 shrink-0 items-center rounded-[10px] border-[1.5px] border-nevo-navy/35 px-[13px] text-[12.5px] font-semibold whitespace-nowrap text-nevo-navy xl:h-10 xl:px-4 xl:text-[13.5px]">
                    Replace this file
                  </span>
                </div>
              ))}
            </div>
            </SampleRegion>
            )}
          </div>
        </div>
      )}
      {phase === "results" && (
        <div className="flex shrink-0 items-center border-t border-nevo-near-black/9 bg-nevo-cream px-7 py-3.5 xl:px-8 xl:py-4">
          <button
            type="button"
            onClick={close}
            className="inline-flex h-[42px] cursor-pointer items-center gap-2 rounded-[10px] border-[1.5px] border-nevo-navy/30 px-[18px] text-sm font-medium text-nevo-navy transition-colors hover:bg-nevo-navy/6 xl:h-11 xl:px-5 xl:text-[14.5px]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="xl:size-[17px]">
              <path d="M15 6l-6 6 6 6" />
            </svg>
            Back to my library
          </button>
        </div>
      )}
    </div>
  );
}
