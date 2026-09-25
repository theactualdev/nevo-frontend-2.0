"use client";

import { useState } from "react";

/**
 * Block-path fallback states (C07f, SCRUM-102.4): the three failure shapes,
 * all calm - no red, no alarm icon, and the system owns the failure in the
 * copy, never the teacher.
 *
 * - "noBoundary": a block with no natural lesson split is a normal outcome -
 *   it degrades to one lesson and flows straight into the section parse.
 * - "partial": a partly-read file shows what we got and offers a quiet retry
 *   on the faint pages.
 * - "unreadable": a plain reason, the recurring "Nothing you did is lost",
 *   and a real forward path.
 * - "unreachable": ours, not the frame's. A live upload can fail because the
 *   backend did, and blaming the teacher's file for our outage would be a
 *   lie - so this one says the fault is ours and offers the same file again.
 *   Flagged to design.
 *
 * Renders the body AND its own foot (Back + status note - no Continue, per
 * the frame). Chrome: STEP 3 OF 5 at 55%, in the wizard's head.
 */

export type FallbackKind =
  | "noBoundary"
  | "partial"
  | "unreadable"
  /** The parse started and could not finish. */
  | "parseFailed"
  | "unreachable";

export const FALLBACK_HEADINGS: Record<FallbackKind, string> = {
  noBoundary: "One continuous lesson",
  partial: "Read most of your block",
  unreadable: "We hit a snag",
  parseFailed: "We hit a snag",
  unreachable: "We hit a snag",
};

const FOOT_NOTES: Record<FallbackKind, string> = {
  noBoundary: "Staying as one lesson - you can split it any time.",
  partial: "Your progress is saved.",
  unreadable: "Your progress is saved - nothing was lost.",
  parseFailed: "Nothing you did is lost - the file is fine to send again.",
  // C07f's own footnote for this state, from the 31 Aug frame.
  unreachable: "Nothing is wrong with your file - try again in a moment.",
};

const FLAT_SEGMENTS = [
  { n: 1, title: "What plants need", mins: "3 min" },
  { n: 2, title: "Inside a leaf", mins: "4 min" },
  { n: 3, title: "Light, water and air", mins: "3 min" },
  { n: 4, title: "The leaf-and-water test", mins: "5 min" },
];

const READ_LESSONS = [
  { n: 1, title: "Photosynthesis", count: "3 sections · 8 segments" },
  { n: 2, title: "Plant transport", count: "2 sections · 6 segments" },
];

const ghostBtn =
  "inline-flex cursor-pointer items-center gap-[7px] rounded-[10px] border-[1.5px] border-nevo-near-black/18 px-[15px] py-[9px] text-[13.5px] font-semibold text-nevo-near-black transition-colors hover:bg-nevo-near-black/5";
const ghostBtnSm =
  "inline-flex cursor-pointer items-center gap-[7px] rounded-[9px] border-[1.5px] border-nevo-navy/30 px-[13px] py-2 text-[12.5px] font-semibold text-nevo-navy transition-colors hover:bg-nevo-navy/6";

/**
 * The backend's reference for this failure, offered quietly.
 *
 * NOT AN ERROR CODE SHOUTED AT A TEACHER. It appears only where the screen has
 * already admitted the fault is ours and has nothing else to tell them - and
 * it is phrased as something to quote if they choose to, never as an
 * instruction. Absent for every failure that is not an unhandled one, which is
 * most of them: a file we could not read has a reason, and a reason is better
 * than a reference.
 */
export function IncidentLine({ id }: { id?: string | null }) {
  if (!id) return null;
  return (
    <p className="mt-4 text-[12.5px] leading-[1.5] text-nevo-near-black/50">
      If you tell us about this, quote{" "}
      <span className="font-mono text-nevo-near-black/70">{id}</span>.
    </p>
  );
}

export function ParseFallback({
  kind,
  failureReason,
  incident,
  blockName,
  onBack,
  onTryAnother,
  onRetrySameFile,
  onContinueAnyway,
}: {
  kind: FallbackKind;
  /**
   * WHY THE PARSE STOPPED, in the server's words, from the field that promises
   * to be words.
   *
   * THIS PROP EXISTED, WAS DELETED, AND IS BACK AS A DIFFERENT FIELD. It used
   * to carry `error`, which is a driver exception - the first real one anyone
   * saw was an asyncpg `UndefinedColumnError` with the failing INSERT and its
   * bound UUIDs, and it was being rendered as the sentence a teacher reads.
   * Removed on 24 Sep; backend added `failureReason` the same day, a small
   * closed list of recognised causes with an honest generic line for the rest.
   *
   * So this is not the old prop restored. `error` is still not shown anywhere.
   */
  failureReason?: string | null;
  /** The backend's reference, when the failure was an unhandled one. */
  incident?: string | null;
  blockName: string;
  onBack: () => void;
  onTryAnother: () => void;
  /** Resends the SAME file, falling back to the picker if it is gone. */
  onRetrySameFile: () => void;
  /** Proceeds with the pages that did parse. */
  onContinueAnyway: () => void;
}) {
  const [splitOpened, setSplitOpened] = useState(false);
  const [formatsOpen, setFormatsOpen] = useState(false);
  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-[22px] xl:px-8 xl:py-7">
        {kind === "noBoundary" && (
          <div className="max-w-[600px]">
            <div className="flex items-start gap-3 rounded-xl bg-nevo-violet/14 px-[17px] py-[15px]">
              <span className="mt-px shrink-0 text-nevo-navy">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z" />
                  <path d="M2 21c0-3 1.85-5.36 5.08-6" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold text-nevo-near-black">
                  This looks like one continuous lesson.
                </div>
                <p className="mt-[5px] text-[13.5px] leading-[1.55] text-nevo-near-black/70">
                  You can still split it into more lessons if you&rsquo;d like.
                  Otherwise we&rsquo;ll take it straight into sections.
                </p>
                <button
                  type="button"
                  onClick={() => setSplitOpened((v) => !v)}
                  className={`mt-[13px] ${ghostBtnSm}`}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M8 3v18M3 8h10M3 16h10M21 8l-3 4 3 4" />
                  </svg>
                  Split into more lessons myself
                </button>
              </div>
            </div>

            {splitOpened && (
              <div className="mt-3 rounded-[9px] border-l-[3px] border-nevo-violet bg-nevo-navy/6 px-[15px] py-3 text-[13px] leading-[1.5] text-nevo-near-black/75">
                Opening the editable tree - drag a section out to start a
                second lesson. Nothing is committed until you&rsquo;re happy.
              </div>
            )}

            <div className="mt-[18px] font-mono text-[10.5px] tracking-[0.12em] text-nevo-near-black/42">
              FLOWS STRAIGHT INTO THE SECTION PARSE (SCRUM-101)
            </div>
            <div className="mt-2.5 rounded-xl bg-nevo-cream-elevated px-[18px] py-4 shadow-[0_2px_10px_rgba(0,0,0,0.05)]">
              <div className="flex items-center gap-[11px]">
                <span className="shrink-0 font-mono text-[10px] font-bold tracking-[0.1em] text-nevo-violet">
                  LESSON 1
                </span>
                <span className="min-w-0 flex-1 text-[15px] font-semibold text-nevo-near-black">
                  {blockName}
                </span>
                <span className="shrink-0 text-[11.5px] text-nevo-near-black/50">
                  9 segments
                </span>
              </div>
              <div className="mt-3 flex flex-col gap-1.5">
                {FLAT_SEGMENTS.map((s) => (
                  <div
                    key={s.n}
                    className="flex items-center gap-2.5 rounded-lg bg-nevo-cream/55 px-3 py-[9px]"
                  >
                    <span className="flex size-[22px] shrink-0 items-center justify-center rounded-[6px] bg-nevo-navy/10 text-[11px] font-semibold text-nevo-navy">
                      {s.n}
                    </span>
                    <span className="min-w-0 flex-1 text-[13px] text-nevo-near-black">
                      {s.title}
                    </span>
                    <span className="shrink-0 text-[11px] text-nevo-near-black/42">
                      {s.mins}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {kind === "partial" && (
          <div className="max-w-[600px]">
            <div className="flex items-start gap-3 rounded-xl bg-nevo-violet/14 px-[17px] py-[15px]">
              <span className="mt-px shrink-0 text-nevo-navy">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
                  <path d="M14 3v6h6" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold text-nevo-near-black">
                  We read most of this, but a few pages didn&rsquo;t come
                  through.
                </div>
                <p className="mt-[5px] text-[13.5px] leading-[1.55] text-nevo-near-black/70">
                  Pages 1-14 parsed cleanly. Pages 15 and 16 were too faint to
                  read. Nothing you did is lost - you can retry just those
                  pages.
                </p>
                <div className="mt-[13px] flex flex-wrap items-center gap-2.5">
                  {/* The frame draws "Retry pages 15-16" here. It is not drawn
                      while this state is a sample: it waited 900ms and then
                      said "Retried - all pages in", which is a claim that two
                      pages had been re-read when nothing was sent.

                      `POST /api/v1/uploads/{id}/retry-pages` exists and takes
                      the page numbers, but it needs an upload id, and this
                      screen is only ever reached from the mocked block parse -
                      there is no staged upload behind it to retry. The control
                      returns with that upload. */}
                  <button
                    type="button"
                    onClick={onContinueAnyway}
                    className="inline-flex cursor-pointer items-center gap-[7px] rounded-[10px] bg-nevo-navy px-[15px] py-[9px] text-[13px] font-semibold text-nevo-cream transition-[filter] hover:brightness-93"
                  >
                    Continue with what we have
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-[18px] font-mono text-[10.5px] tracking-[0.12em] text-nevo-near-black/42">
              WHAT WE READ SO FAR
            </div>
            <div className="mt-2.5 flex flex-col gap-2">
              {READ_LESSONS.map((l) => (
                <div
                  key={l.n}
                  className="flex items-center gap-[11px] rounded-[10px] bg-nevo-cream-elevated px-[15px] py-3"
                >
                  <span className="shrink-0 font-mono text-[10px] font-bold tracking-[0.1em] text-nevo-violet">
                    LESSON {l.n}
                  </span>
                  <span className="min-w-0 flex-1 text-sm font-semibold text-nevo-near-black">
                    {l.title}
                  </span>
                  <span className="shrink-0 text-[11.5px] text-nevo-near-black/50">
                    {l.count}
                  </span>
                </div>
              ))}
              <div className="flex items-center gap-[11px] rounded-[10px] border-[1.5px] border-dashed border-nevo-navy/28 bg-nevo-navy/6 px-[15px] py-3">
                <span className="shrink-0 text-nevo-violet" aria-hidden>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="5" cy="12" r="1.8" />
                    <circle cx="12" cy="12" r="1.8" />
                    <circle cx="19" cy="12" r="1.8" />
                  </svg>
                </span>
                <span className="min-w-0 flex-1 text-[13.5px] text-nevo-near-black/65">
                  Pages 15-16 - waiting on a retry
                </span>
              </div>
            </div>
          </div>
        )}

        {kind === "parseFailed" && (
          /*
            A PARSE THAT FAILED IS NOT A CONNECTION PROBLEM, and until 18 Sep
            it was reported as one: the wizard turned a run with
            `status: "failed"` into a synthetic 500 and fell through to the
            unreachable screen, which says "nothing is wrong with your file"
            and offers to try again. Both halves were wrong, and the
            `failureReason` the backend had already written was thrown away
            on the line above.

            NOT DRAWN BY DESIGN. C07f has an unreadable file and a lost
            connection, and no state for work that started and could not
            finish. Design ruled this one into existence on 23 Sep.

            IT USED TO SAY THE SERVER'S OWN REASON HERE, on the argument that
            the server knows why and we do not. That was written blind: the
            status route answered 500 for every in-flight upload, so no real
            `error` had ever been seen. The first one seen, on a live upload
            on 23 Sep, was an asyncpg exception with the failing INSERT and
            its bound UUIDs in it - and this paragraph is the sentence a
            teacher reads when their lesson does not arrive. Knowing why is
            not the same as having something to say.
          */
          <div className="mx-auto flex max-w-[560px] flex-col items-center pt-6 text-center xl:pt-10">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-[16px] bg-nevo-violet/18 text-nevo-navy">
              {/* NOT the document-with-a-mark, which is the unreadable
                  screen's. A reading that stopped partway is not a fault in
                  the page - it is ours - so this is a paused read rather than
                  a flawed file. */}
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M4 5a2 2 0 0 1 2-2h5v16H6a2 2 0 0 0-2 2z" />
                <path d="M15 8v8M19 8v8" />
              </svg>
            </span>
            <h3 className="mt-[18px] text-xl font-semibold tracking-[-0.01em] text-nevo-near-black">
              We couldn&rsquo;t finish reading this one
            </h3>
            <p className="mt-[9px] max-w-[440px] text-[14.5px] leading-[1.6] text-nevo-near-black/70">
              {/* "WE", not "Nevo couldn't" and not a word about the file.
                  Design, 23 Sep: a failed parse is OUR problem and the copy
                  should say so rather than implying they gave us a bad file.

                  The server's reason LEADS where it gave one, and ours stands
                  alone where it did not - which is most failures on an older
                  deployment, and every one that has no recognised cause. The
                  generic case is deliberately backend's sentence rather than
                  a guess: "a guess dressed as a diagnosis is worse than saying
                  plainly we don't know." */}
              {failureReason ??
                "The reading started and stopped partway. That is ours to sort out, not anything you did."}
            </p>
            <IncidentLine id={incident} />
            <div className="mt-[22px] flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={onRetrySameFile}
                className="inline-flex cursor-pointer items-center gap-2 rounded-[10px] bg-nevo-navy px-[18px] py-[11px] text-sm font-semibold text-nevo-cream transition-[filter] hover:brightness-93"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                  <path d="M21 3v6h-6" />
                </svg>
                Try this file again
              </button>
              {/* "Try another file" belongs to the UNREADABLE screen, where a
                  different document is genuinely the remedy. Offering it here
                  tells a teacher their file was the problem when we have just
                  said it was not - and sends them to find one they do not
                  need. One next action, chosen by the failure. */}
            </div>
          </div>
        )}

        {kind === "unreachable" && (
          <div className="mx-auto flex max-w-[560px] flex-col items-center pt-6 text-center xl:pt-10">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-[16px] bg-nevo-violet/18 text-nevo-navy">
              {/* The frame's cloud-with-a-slash: this is the connection, not
                  the file. The old circle-and-exclamation read as a fault in
                  what the teacher had done. */}
              <svg width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M7 18a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 17.5 9.5 4 4 0 0 1 17 18" />
                <path d="M10 20.5l4-4M14 20.5l-4-4" />
              </svg>
            </span>
            <h3 className="mt-[18px] text-xl font-semibold tracking-[-0.01em] text-nevo-near-black">
              We couldn&rsquo;t reach Nevo just then.
            </h3>
            <p className="mt-[9px] max-w-[420px] text-[14.5px] leading-[1.6] text-nevo-near-black/70">
              Nothing is wrong with your file. Please try again in a moment.
            </p>
            <IncidentLine id={incident} />
            <div className="mt-[22px] flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                /* "Try again" resends the same file. It used to reopen the
                   picker, which contradicted the sentence above it. */
                onClick={onRetrySameFile}
                className="inline-flex cursor-pointer items-center gap-2 rounded-[10px] bg-nevo-navy px-[18px] py-[11px] text-sm font-semibold text-nevo-cream transition-[filter] hover:brightness-93"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                  <path d="M21 3v6h-6" />
                </svg>
                Try again
              </button>
            </div>
          </div>
        )}

        {kind === "unreadable" && (
          <div className="mx-auto flex max-w-[560px] flex-col items-center pt-6 text-center xl:pt-10">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-[16px] bg-nevo-violet/18 text-nevo-navy">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
                <path d="M14 3v6h6" />
                <path d="M9.5 13.5l5 5M14.5 13.5l-5 5" />
              </svg>
            </span>
            <h3 className="mt-[18px] text-xl font-semibold tracking-[-0.01em] text-nevo-near-black">
              We couldn&rsquo;t read this file
            </h3>
            <p className="mt-[9px] max-w-[420px] text-[14.5px] leading-[1.6] text-nevo-near-black/70">
              It looks like a scan saved in a format we can&rsquo;t open yet.
              Nothing you did is lost - try another file, and we&rsquo;ll take
              it from there.
            </p>
            <div className="mt-[22px] flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={onTryAnother}
                className="inline-flex cursor-pointer items-center gap-2 rounded-[10px] bg-nevo-navy px-[18px] py-[11px] text-sm font-semibold text-nevo-cream transition-[filter] hover:brightness-93"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 16V4M7 9l5-5 5 5" />
                  <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
                </svg>
                Try another file
              </button>
              <button
                type="button"
                onClick={() => setFormatsOpen((v) => !v)}
                className={ghostBtn}
              >
                See supported formats
              </button>
            </div>
            {formatsOpen && (
              <div className="mt-4 max-w-[420px] rounded-[11px] bg-nevo-navy/6 px-[17px] py-3.5 text-left">
                <div className="text-[12.5px] font-semibold text-nevo-navy">
                  We can read:
                </div>
                <div className="mt-1.5 text-[13px] leading-[1.6] text-nevo-near-black/72">
                  PDF, Word (.docx), and clear photos or scans (JPG, PNG). For
                  scans, brighter and straighter pages read best.
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* The state's own foot: Back + note, no Continue (per the frame). */}
      <div className="flex shrink-0 items-center gap-3.5 border-t border-nevo-near-black/10 px-6 py-3.5 xl:px-8 xl:py-4">
        <button type="button" onClick={onBack} className={ghostBtn}>
          Back
        </button>
        <span className="flex-1 text-[12.5px] text-nevo-near-black/55">
          {FOOT_NOTES[kind]}
        </span>
      </div>
    </>
  );
}
