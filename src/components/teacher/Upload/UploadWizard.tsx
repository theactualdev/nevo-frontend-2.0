"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { lessonsApi, type LessonDetailResponse } from "@/lib/api/lessons";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useStagedUpload } from "@/hooks/useStagedUpload";
import { getToken } from "@/lib/auth/session";
import { cn } from "@/lib/utils";
import {
  FALLBACK_HEADINGS,
  IncidentLine,
  ParseFallback,
  type FallbackKind,
} from "./ParseFallback";
import { LiveModuleReview } from "./LiveModuleReview";
import { PARSE_STAGES, ParseProgress, rungFor } from "./ParseProgress";
import { LONGEST_STAGE, ProcessingStages, stageOf } from "./ProcessingStages";
import { SectionReview } from "./SectionReview";
import { LiveStructureTree } from "./LiveStructureTree";
import { StructureTree } from "./StructureTree";
import { UploadResult } from "./UploadResult";
import { MaybeSample, SampleRegion } from "@/components/shared/SampleRegion";

/**
 * Lesson Upload wizard (SCRUM-102.6 reconciled flow, C07g): one flow, two
 * honest paths. Scope declaration is Step 1 for every entry point; a single
 * lesson stays light (3 steps), a unit/term switches on the staged parse
 * (5 steps). The "Step N of M" line is dynamic - an honest count for the
 * chosen path, "N" until a path exists.
 *
 * Chrome per C07c (SCRUM-102.1): step line + progress in the head, the
 * question as the heading, Back / route-note / Continue in the foot. Step
 * copy per the reconciled `Nevo Teacher Upload` frame. The disabled Continue
 * is the one honest disabled case - nothing chosen yet - with the live
 * outstanding line beside it.
 *
 * The single path's Step 3 is the SCRUM-101 section review (SectionReview) -
 * per C07g it replaces the straight-to-done demo of the component frame. Its
 * "STEP 3 OF 4 / 75%" chrome predates the reconciliation; here it reads
 * 3 OF 3 at 85% (between processing's 70% and done's 100%).
 *
 * The block path's processing is the C07e staged parse (ParseProgress), and
 * its failure shapes are C07f (ParseFallback). That path's outcome is still
 * mocked from the file: an extension outside the accepted set reads as
 * unreadable (real validation - drag-and-drop bypasses the picker's accept
 * filter), and for demos a filename containing "partial" or "continuous"
 * walks the matching fallback.
 *
 * THE UPLOAD IS LIVE. `POST /api/content/upload` takes the file itself and
 * extracts server-side, so PDF, Word, PowerPoint, Markdown and plain text all
 * work - the browser-side pdfjs extraction this flow used to need could never
 * cover Word or PowerPoint, and is gone.
 *
 * The upload now answers 202 with a receipt rather than the parsed lesson, so
 * this flow is accept -> poll the run -> read the lesson. The lesson exists
 * from the moment the receipt arrives; there is still no separate commit on
 * this path, so step 3 reviews what was parsed rather than asking for approval
 * it does not need.
 *
 * The block path's staged parse is still the designed demo beat, but the
 * reason changed on 31 Aug and the copy says the new one. The staged
 * endpoints are real AND the structure is now typed - `POST /api/v1/uploads`
 * takes the file with its scope and subject, and `GET /api/v1/uploads/{id}`
 * returns `{lessonId, modules[...]}`.
 *
 * `structure.lessons[]` shipped on 1 Sep, so the missing level - a unit
 * becoming SEVERAL lessons - can be expressed, and the block path is live for
 * a signed-in teacher: it stages, polls, renders what the parser produced and
 * commits it. The designed demo beat stands for a signed-out visitor.
 *
 * Backend's own caveat, worth keeping: the parser still emits one lesson per
 * upload, so a real unit will usually show as one. That is the parse being
 * honest, not the screen.
 */

/**
 * "Page 4", "Pages 4 and 7", "Pages 4, 7 and 12" - said the way a person
 * says them.
 *
 * Not a count and not a threshold: the list is whatever the server sent, in
 * the order it sent it. The page numbers are the parser's, not ours.
 */
export function faintPagesLine(pages: number[]): string {
  const many = pages.length > 1;
  const list = many
    ? `${pages.slice(0, -1).join(", ")} and ${pages[pages.length - 1]}`
    : String(pages[0] ?? "");
  return (
    `${many ? "Pages" : "Page"} ${list} didn\u2019t come through clearly, ` +
    `so nothing from ${many ? "them" : "it"} is in what you see below.`
  );
}

type ScopeId = "single" | "unit" | "term";
type Phase =
  | "scope"
  | "file"
  | "processing"
  | "review"
  | "done"
  | "blockParsed"
  /**
   * The DEMO's structure tree, shown in place.
   *
   * "Review the structure" used to be a `<Link>` to
   * `/teacher/lessons/upload/structure`, a standalone route this repo invented -
   * C07e draws the control as a button - which served a hardcoded P5 Science
   * fixture and, on the live path, discarded the in-flight poll on the way. The
   * route is deleted; the signed-out walkthrough now opens the same tree here,
   * without leaving the wizard.
   */
  | "demoStructure"
  | "fallback";

const SCOPES: {
  id: ScopeId;
  title: string;
  sub: string;
  passes: string;
  route: string;
  icon: React.ReactNode;
}[] = [
  {
    id: "single",
    title: "A single lesson",
    sub: "One lesson's worth of notes or a slide deck. We'll split it into segments.",
    passes: "ONE QUICK REVIEW",
    route: "the short path - segment review, then done.",
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
        <path d="M14 3v6h6" />
        <path d="M9 14h6" />
      </svg>
    ),
  },
  {
    id: "unit",
    title: "A unit or scheme - several lessons",
    sub: "A set of related lessons. We'll find the lessons, then the sections inside each.",
    passes: "A FEW REVIEW PASSES",
    route: "the staged parse - lessons, sections, then segments.",
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <rect x="4" y="4" width="16" height="5" rx="1.5" />
        <rect x="4" y="12" width="16" height="5" rx="1.5" />
        <path d="M8 19h8" />
      </svg>
    ),
  },
  {
    id: "term",
    title: "A term or textbook chapter",
    sub: "A whole term or chapter. We'll break it into lessons, sections and segments.",
    passes: "GUIDED, LEVEL BY LEVEL",
    route: "the full staged parse - we'll guide you level by level.",
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M4 5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4z" />
        <path d="M20 5v14a2 2 0 0 0-2-2" />
      </svg>
    ),
  },
];

const SCOPE_CHIP: Record<ScopeId, string> = {
  single: "A single lesson",
  unit: "A unit or scheme",
  term: "A term or chapter",
};

/** Mock parse beats - the block path only; the single path uploads for real. */
const PROCESS_MS = 2400;
const BLOCK_STAGE_MS = 1150;
const ACCEPTED = /\.(pdf|docx?|pptx?)$/i;
/** The file step's own promise: "PDF, Word, or PowerPoint · up to 25 MB". */
const MAX_BYTES = 25 * 1024 * 1024;

/** Mock outcome of the block parse, read from the file (see header note). */
function mockBlockOutcome(name: string): FallbackKind | "parsed" {
  if (!ACCEPTED.test(name)) return "unreadable";
  if (/partial/i.test(name)) return "partial";
  if (/continuous/i.test(name)) return "noBoundary";
  return "parsed";
}

export function UploadWizard() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("scope");
  const [scope, setScope] = useState<ScopeId | null>(null);
  const [subject, setSubject] = useState("");
  const identity = useCurrentUser();
  const [fileName, setFileName] = useState("");
  // The File itself, not just its name: "Try again" on a server fault must
  // resend the same upload, not reopen the picker and ask a teacher to find
  // their file a second time for a failure that was ours.
  const lastFile = useRef<File | null>(null);
  const [parseStage, setParseStage] = useState(0);
  const [fallbackKind, setFallbackKind] = useState<FallbackKind>("unreadable");
  const [dragOver, setDragOver] = useState(false);
  /**
   * C07's "That file didn't come through" (T65), on the file step where the
   * frame draws it. A refused file used to land on the could-not-read screen,
   * which says it "looks like a scan saved in a format we can't open" - a
   * cause asserted for a proxy's 413 and our own 422 alike.
   */
  const [refused, setRefused] = useState(false);
  /** The screen is showing fixture content, never the teacher's own file. */
  const [sample, setSample] = useState(false);
  const staged = useStagedUpload();
  /** What the upload actually returned, when it was live. */
  const [parsed, setParsed] = useState<LessonDetailResponse | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const isBlock = scope !== null && scope !== "single";
  /**
   * Which rung the single-lesson ladder is on.
   *
   * Read twice now - by the ladder and by the sentence under it - so it is
   * derived once rather than computed in two places that could disagree about
   * the same upload.
   */
  const singleStage = stageOf(staged.uploadId, staged.stage, staged.status);
  /**
   * The single lesson's parse has settled and its structure is on screen.
   *
   * Derived rather than a phase of its own, which is how the block path
   * already does it: the staged upload owns when the review can begin, and a
   * phase would only be a second copy of that answer, kept in step by hand.
   */
  const singleReview =
    !isBlock &&
    phase === "processing" &&
    staged.uploadId !== null &&
    staged.structure !== null &&
    (staged.status === "ready" || staged.status === "confirmed");

  /**
   * The fallback screen, and which failure it is about, from either source.
   *
   * The demo beats set a phase; a staged parse reports its failure through a
   * poll, and DERIVING it from that is the point - an effect that pushed
   * `staged.failed` into `phase` would be a second copy of the answer, one
   * cascading render behind the first.
   *
   * C07f is the designed screen for a file that could not be read, and the
   * single path has shown it since 18 Sep. The pipeline underneath changed;
   * what a teacher meets when a parse fails should not.
   */
  const fallback: { kind: FallbackKind } | null =
    phase === "fallback"
      ? { kind: fallbackKind }
      : !isBlock &&
          phase === "processing" &&
          staged.failed &&
          // A refused file goes back to the file step (T65), not here.
          staged.failureKind !== "file"
        ? {
            kind:
              staged.failureKind === "request" ? "unreachable" : "parseFailed",
          }
        : null;
  const stepTotal = scope === null ? "N" : scope === "single" ? 3 : 5;
  const stepNum = {
    scope: 1,
    file: 2,
    processing: 3,
    review: 3,
    done: 3,
    blockParsed: 4,
    // Same step as the result it opens from: reviewing the structure IS step 4,
    // not a fifth one. The frame numbers the flow, not the screens.
    demoStructure: 4,
    fallback: 3,
  }[phase];
  const progress = {
    scope: scope ? (scope === "single" ? "33%" : "20%") : "8%",
    file: scope === "single" ? "40%" : "24%",
    processing: scope === "single" ? (singleReview ? "85%" : "70%") : "50%",
    review: "85%",
    done: "100%",
    blockParsed: "80%",
    demoStructure: "90%",
    fallback: "55%",
  }[fallback ? "fallback" : phase];

  const blockName = fileName.replace(/\.[^.]+$/, "");
  const heading = {
    scope: "What are you uploading?",
    // C07e's dedicated screen: "Breaking down '<block>'" supersedes the
    // component frame's generic "While we read your block" head.
    processing: isBlock
      ? `Breaking down '${blockName}'`
      : singleReview
        ? "How should this lesson be split up?"
        : "Getting it ready",
    file: "Choose a file",
    review: "How should this lesson be split up?",
    done: "Added to your library",
    blockParsed: "Here's how we've broken it up",
    demoStructure: "Adjust anything before it goes to your library",
    fallback: FALLBACK_HEADINGS[fallback?.kind ?? fallbackKind],
  }[fallback ? "fallback" : phase];

  const stopTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const startFile = (file: File) => {
    stopTimer();
    lastFile.current = file;
    setFileName(file.name);
    setSample(false);
    setParsed(null);
    setRefused(false);
    /*
     * CHECKED HERE FIRST (T65). The step promises PDF, Word or PowerPoint up
     * to 25 MB, and nothing held it to that: a 40 MB file uploaded in full to
     * be refused, and a drag-and-drop skipped the picker's `accept` entirely.
     * Signed in only - the walkthrough's beats are driven by the file's name.
     */
    if (getToken() && (file.size > MAX_BYTES || !ACCEPTED.test(file.name))) {
      setRefused(true);
      setPhase("file");
      return;
    }
    setPhase("processing");

    // A signed-out visitor has no token, so the designed demo beat stands.
    if (!getToken()) {
      runMockBeats(file.name);
      return;
    }

    /*
     * BOTH SCOPES STAGE THE FILE NOW, and this is the change that gives a
     * single lesson its review step at all.
     *
     * `POST /api/v1/uploads` takes `scope`, its pattern is
     * `^(lesson|unit|term)$` and its default is `lesson`: the staged
     * pipeline was built with one lesson as its base case. The single path was
     * using `POST /api/content/upload` instead, whose receipt carries a
     * lesson id and a parse run id and NO upload id - so there was no upload
     * to ask about, and `PUT /uploads/{id}/structure` is the only endpoint
     * in the contract that writes module boundaries. That is why C07g's step
     * 3 could be drawn and never wired.
     *
     * What a teacher gains: the sections Nevo proposed, and the split, merge,
     * rename and re-order the frame has always promised. What changes
     * otherwise: the lesson lands in the library on confirm rather than on
     * upload, which is the step the frame draws as "Looks right, continue".
     */
    if (scope) {
      void staged
        .start(file, scope === "single" ? "lesson" : scope, subject || undefined)
        .then((outcome) => {
          // The server's answer about the file belongs where the file was
          // chosen, as C07 draws it - not on the could-not-read screen.
          if (outcome !== "refused" || isBlock) return;
          staged.reset();
          setRefused(true);
          setPhase("file");
        });
      return;
    }

  };

  const runMockBeats = (name: string) => {
    setSample(true);
    if (!isBlock) {
      timer.current = setTimeout(() => setPhase("review"), PROCESS_MS);
      return;
    }
    setParseStage(0);
    const outcome = mockBlockOutcome(name);
    if (outcome === "unreadable") {
      // An unreadable file fails on the first rung, not after the ladder.
      timer.current = setTimeout(() => {
        setFallbackKind("unreadable");
        setPhase("fallback");
      }, BLOCK_STAGE_MS);
      return;
    }
    let stage = 0;
    const tick = () => {
      stage += 1;
      if (stage < PARSE_STAGES.length) {
        setParseStage(stage);
        timer.current = setTimeout(tick, BLOCK_STAGE_MS);
      } else if (outcome === "parsed") {
        setPhase("blockParsed");
      } else {
        setFallbackKind(outcome);
        setPhase("fallback");
      }
    };
    timer.current = setTimeout(tick, BLOCK_STAGE_MS);
  };

  /**
   * "Try again" after the CONNECTION failed - never a new upload when one exists.
   *
   * Both of these used to start over: the fallback resent the file, staging a
   * second copy of a parse that had very likely finished server-side, and the
   * unit card reopened the picker. With an upload id the right move is to ask
   * about THAT upload again. Only when the create itself never landed is there
   * nothing to ask about, and then the same file goes again - the teacher is
   * not sent to find it a second time for a failure that was ours.
   */
  const tryAgain = () => {
    if (staged.uploadId && staged.failureKind === "request") {
      staged.resume();
      return;
    }
    const f = lastFile.current;
    if (f) startFile(f);
    else setPhase("file");
  };

  const reset = () => {
    stopTimer();
    staged.reset();
    setRefused(false);
    setPhase("scope");
    setScope(null);
    setSubject("");
    setFileName("");
    setSample(false);
  };

  return (
    <div className="flex min-h-full flex-1 flex-col">
      {/* Head - step line, progress, the question (C07c) */}
      <div className="shrink-0 border-b border-nevo-near-black/9 px-6 pt-[18px] pb-4 xl:px-8 xl:pt-[22px] xl:pb-5">
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-[11px] font-semibold tracking-[0.08em] whitespace-nowrap text-nevo-violet">
            STEP {stepNum} OF {stepTotal}
          </span>
          <div className="h-1 flex-1 rounded-full bg-nevo-near-black/10">
            <div
              className="h-full rounded-full bg-nevo-violet transition-[width] duration-[220ms] ease-out"
              style={{ width: progress }}
            />
          </div>
        </div>
        <h1 className="mt-3 text-[21px] font-semibold tracking-[-0.014em] text-nevo-near-black xl:text-2xl">
          {heading}
        </h1>
        {phase === "scope" && (
          <p className="mt-1.5 max-w-[560px] text-sm leading-[1.55] text-nevo-near-black/62">
            This just tells us how deeply to break it up. You can change any of
            it later.
          </p>
        )}
        {(singleReview || (phase === "review" && sample)) && (
          <p className="mt-1.5 max-w-[560px] text-sm leading-[1.55] text-nevo-near-black/62">
            We&rsquo;ve broken this lesson into sections that flow well. Adjust
            anything, rename a section, or keep it as one continuous flow.
          </p>
        )}
        {sample && (phase === "review" || phase === "blockParsed") && (
          <p className="mt-1.5 max-w-[560px] text-[13px] leading-[1.5] text-nevo-near-black/55 italic">
            {/* Two different reasons, and a teacher deserves the right one:
                a whole unit cannot be split into lessons yet, whereas a
                signed-out visitor simply has nothing to read the file with. */}
            {isBlock
              ? "We can’t split a unit into separate lessons yet, so this is a sample - nothing below comes from what you uploaded."
              : "We can’t read your file yet, so this is a sample lesson - nothing below comes from what you uploaded."}
          </p>
        )}
      </div>

      {phase === "review" && parsed && (
        <UploadResult
            lesson={parsed}
            fileName={fileName}
            onUploadAnother={() => {
              setParsed(null);
              setPhase("file");
            }}
            /* In place: the re-read lesson replaces this one, same id, same
               row in the library. That is the whole point of regenerate over
               re-upload. */
          onRegenerated={setParsed}
        />
      )}

      {/* The designed walkthrough, on fixture content, for a visitor with no
          token. A signed-in teacher reaches the live review above. */}
      {phase === "review" && sample && (
        <SampleRegion kind="teacher:upload-demo-review">
          <SectionReview
            onBack={() => setPhase("file")}
            onDone={() => setPhase("done")}
          />
        </SampleRegion>
      )}

      {/* THE SINGLE LESSON'S OWN REVIEW - C07g step 3, live. */}
      {singleReview && staged.uploadId && staged.structure && (
        <LiveModuleReview
          uploadId={staged.uploadId}
          structure={staged.structure}
          segments={staged.segments}
          banner={
            staged.failedPages.length > 0 ? (
              <div className="mb-5 w-full rounded-[12px] border-l-[3px] border-nevo-violet bg-nevo-violet/16 px-[18px] py-4">
                <p className="text-[14.5px] leading-[1.55] text-nevo-near-black/82">
                  {faintPagesLine(staged.failedPages)}
                </p>
                <button
                  type="button"
                  onClick={staged.retryFailedPages}
                  disabled={staged.retrying}
                  className="mt-3 inline-flex h-[42px] cursor-pointer items-center rounded-[10px] border-[1.5px] border-nevo-navy/35 bg-nevo-cream-elevated px-[18px] text-[14px] font-medium text-nevo-navy transition-colors hover:bg-nevo-navy/6 disabled:cursor-default disabled:opacity-55"
                >
                  {staged.retrying
                    ? "Reading them again…"
                    : staged.failedPages.length === 1
                      ? "Read that page again"
                      : "Read those pages again"}
                </button>
              </div>
            ) : null
          }
          onBack={() => {
            staged.reset();
            setPhase("file");
          }}
          onConfirmed={(lessonId) => {
            /*
             * The lesson exists the moment confirm answers. Reading it back is
             * what lets the outcome screen offer "Try that again" over the
             * real thing - so a failure to READ it is not a failure to add it,
             * and says the lesson is ready rather than that something broke.
             */
            void lessonsApi
              .detail(lessonId)
              .then((lesson) => {
                setParsed(lesson);
                setPhase("review");
              })
              .catch(() => setPhase("done"));
          }}
        />
      )}

      {fallback && (
        <MaybeSample showing={sample} kind="teacher:upload-demo-fallback">
        <ParseFallback
          kind={fallback.kind}
          failureReason={staged.failureReason}
          incident={staged.incident}
          blockName={blockName}
          onBack={() => setPhase("file")}
          onTryAnother={() => setPhase("file")}
          onContinueAnyway={() => setPhase("blockParsed")}
          onRetrySameFile={tryAgain}
        />
        </MaybeSample>
      )}

      {/*
        Body.

        C07's 20 Sep drop is a LAYOUT change and nothing else: every step's
        content went from a fixed column - 540, 560, 600, 640px, pinned to the
        left edge - to `width:100%; max-width:<cap>` inside a centring body.
        LR-01 makes the same complaint about the lesson page in words: "fills
        the width; it currently crops into a column."

        Two caps, and which step gets which is the frame's call, not a
        rounding of it: the steps where a teacher is CHOOSING get the narrower
        760 (a wide row of options is harder to compare, not easier), and the
        steps where they are READING what Nevo produced get 860.
      */}
      {phase !== "review" && !fallback && !singleReview && (
        <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-6 py-[22px] xl:px-8 xl:py-7">
          <div
            className={cn(
              // `min-h-full` because `ParseProgress` centres itself against
              // the FULL height of whatever holds it. Wrapping it in a plain
              // auto-height div would have collapsed that to nothing, and the
              // signed-out block demo is the only place that shows.
              "w-full min-h-full",
              phase === "file" || phase === "processing"
                ? "max-w-[760px]"
                : "max-w-[860px]",
            )}
          >
          {phase === "scope" && (
            <div className="flex w-full flex-col gap-3.5">
              {SCOPES.map((s) => {
                const on = scope === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setScope(s.id)}
                    aria-pressed={on}
                    className={cn(
                      "flex w-full cursor-pointer items-start gap-[15px] rounded-[12px] border-2 bg-nevo-cream-elevated p-[18px] text-left transition-[border-color,box-shadow] xl:px-5",
                      on
                        ? "border-nevo-navy shadow-[0_4px_16px_rgba(0,0,0,0.1)]"
                        : "border-transparent",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-[42px] shrink-0 items-center justify-center rounded-[11px]",
                        on
                          ? "bg-nevo-navy text-nevo-cream"
                          : "bg-nevo-navy/10 text-nevo-navy",
                      )}
                    >
                      {s.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-semibold tracking-[-0.008em] text-nevo-near-black xl:text-[17px]">
                        {s.title}
                      </span>
                      <span className="mt-1 block text-[13.5px] leading-[1.5] text-nevo-near-black/66">
                        {s.sub}
                      </span>
                      <span className="mt-[7px] block font-mono text-[11px] tracking-[0.02em] text-nevo-violet">
                        {s.passes}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-nevo-cream",
                        on
                          ? "bg-nevo-violet motion-safe:animate-nevo-pop"
                          : "border-[1.5px] border-nevo-near-black/16 opacity-0",
                      )}
                    >
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <path d="M5 12l4 4L19 6" />
                      </svg>
                    </span>
                  </button>
                );
              })}

              {/*
                SUBJECT, from the teacher's own subjects.

                Both upload routes have accepted an optional `subject` all
                along and neither wrapper sent one, so every lesson this
                console created arrived unlabelled and the library's filter
                had nothing to sort by.

                THE OPTIONS ARE NOT A LIST WRITTEN HERE. C07 draws a select
                of Mathematics, English, Basic Science and Social Studies -
                a taxonomy that is already wrong for this product's own
                fixtures, where a class is Biology, Chemistry and Physics.
                `users/me` carries the subjects a teacher actually teaches,
                including ones the backend infers from their lessons, so
                that is the source. A teacher with none recorded gets no
                field rather than a made-up one, and the upload carries no
                subject - which is what absence means.

                Raised with design: a teacher uploading outside their own
                subjects cannot label it, and the question of where the
                vocabulary comes from is theirs.
              */}
              {(identity?.subjects.length ?? 0) > 0 && (
                <label className="mt-2 block max-w-[420px]">
                  <span className="text-xs font-semibold tracking-[0.03em] text-nevo-near-black/55 uppercase">
                    Subject
                  </span>
                  <select
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="mt-1.5 h-12 w-full cursor-pointer rounded-[10px] border border-nevo-near-black/14 bg-nevo-cream-elevated px-3.5 text-[15px] text-nevo-near-black outline-none transition-colors focus:border-nevo-navy"
                  >
                    <option value="">Not set</option>
                    {identity?.subjects.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}

          {phase === "file" && scope && (
            <div className="w-full">
              <div className="inline-flex items-center gap-2 rounded-full bg-nevo-violet/16 py-1.5 pr-[13px] pl-[13px]">
                <span className="text-[12.5px] font-semibold text-nevo-navy">
                  {SCOPE_CHIP[scope]}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setRefused(false);
                    setPhase("scope");
                  }}
                  className="cursor-pointer text-xs text-nevo-navy underline underline-offset-2"
                >
                  change
                </button>
              </div>
              <p className="mt-3 text-[15.5px] leading-[1.55] text-nevo-near-black/66">
                {isBlock
                  ? "Drop in the file. Nevo reads it, finds the lessons inside, then the sections and segments - you'll review each level."
                  : "Drop in a PDF, Word doc or slides. Nevo reads it, then builds the read, listen and watch versions your students can choose from."}
              </p>
              <input
                ref={fileInput}
                type="file"
                accept=".pdf,.doc,.docx,.ppt,.pptx"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) startFile(f);
                }}
              />
              {refused ? (
                <>
                  {/* C07 step 2, "File didn't come through (gentle recovery)". */}
                  <div
                    role="alert"
                    className="mt-[22px] flex gap-4 rounded-[12px] border border-nevo-violet/50 bg-nevo-violet/16 px-6 py-[22px]"
                  >
                    <span className="flex size-[42px] shrink-0 items-center justify-center rounded-[11px] bg-nevo-violet/20 text-nevo-navy">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M6 2h9l5 5v15H6z" />
                        <path d="M14 2v6h6" />
                      </svg>
                    </span>
                    <div>
                      <p className="text-base font-semibold text-nevo-near-black">
                        That file didn&rsquo;t come through.
                      </p>
                      <p className="mt-2 text-[14.5px] leading-[1.55] text-nevo-near-black/70">
                        It looks larger than 25 MB, or it isn&rsquo;t a format
                        we read yet (PDF, Word or PowerPoint). Nothing&rsquo;s
                        lost - try that one again, or pick another.
                      </p>
                    </div>
                  </div>
                  <div className="mt-[18px] flex justify-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => fileInput.current?.click()}
                      className="inline-flex h-12 cursor-pointer items-center rounded-[10px] border-[1.5px] border-nevo-navy/30 px-5 text-[15px] font-medium text-nevo-navy transition-colors hover:bg-nevo-navy/6"
                    >
                      Choose another file
                    </button>
                    <button
                      type="button"
                      onClick={() => lastFile.current && startFile(lastFile.current)}
                      className="inline-flex h-12 cursor-pointer items-center rounded-[10px] bg-nevo-navy px-[22px] text-[15px] font-semibold text-nevo-cream transition-[filter] hover:brightness-93"
                    >
                      Try again
                    </button>
                  </div>
                </>
              ) : (
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
                  const f = e.dataTransfer.files?.[0];
                  if (f) startFile(f);
                }}
                className={cn(
                  "mt-5 w-full cursor-pointer rounded-[16px] border-2 border-dashed bg-nevo-cream-elevated px-8 py-[52px] text-center transition-[filter,border-color] hover:brightness-[0.985]",
                  dragOver ? "border-nevo-navy" : "border-nevo-navy/35",
                )}
              >
                <span className="inline-flex size-16 items-center justify-center rounded-[16px] bg-nevo-navy/10 text-nevo-navy">
                  <svg
                    width="30"
                    height="30"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M12 16V4" />
                    <path d="M7 9l5-5 5 5" />
                    <path d="M5 20h14" />
                  </svg>
                </span>
                <p className="mt-[18px] text-[17px] font-semibold text-nevo-near-black">
                  Choose a file or drag it here
                </p>
                <p className="mt-1.5 text-[13.5px] text-nevo-near-black/55">
                  {isBlock
                    ? "PDF, Word, or clear scans · up to ~40 pages per upload"
                    : "PDF, Word, or PowerPoint · up to 25 MB"}
                </p>
              </button>
              )}
            </div>
          )}

          {/* The designed structure tree, in place of the route it used to
              live at. Signed-out only by construction: `blockParsed` is
              reached from the mocked beats. */}
          {phase === "demoStructure" && (
            <SampleRegion kind="teacher:upload-demo-structure">
              <div className="w-full">
                <StructureTree />
              </div>
            </SampleRegion>
          )}

          {/* A REAL staged upload takes over the block path. `ParseProgress`
              keeps driving the signed-out demo, which still walks its beats.

              A FAILED ONE TAKES IT OVER TOO, upload id or not. A unit whose
              file never landed has no id, so it fell through to the demo
              ladder below - stuck on its first rung for ever, over a failure
              nobody was told about. */}
          {phase === "processing" && isBlock && (staged.uploadId || staged.failed) && (
            <div className="w-full">
              {staged.uploadId &&
              staged.structure &&
              (staged.status === "ready" || staged.status === "confirmed") ? (
                <>
                  {/*
                    FAINT PAGES, SAID OUT LOUD.

                    `failedPages` is on the status response and was missing
                    from the client type, so until 18 Sep a teacher whose
                    PDF was partly unreadable got this tree with those pages
                    silently absent from it - a unit that looks complete and
                    is not. The retry endpoint was wrapped the whole time
                    and had nothing to ask for, because the page numbers
                    only exist in the field nobody was reading.

                    NOT DRAWN BY DESIGN. C07f covers a parse that failed
                    outright, not one that came back with holes in it, so
                    this is the honest minimum - what is missing, and the
                    one action that fixes it - and it is raised rather than
                    invented further.
                  */}
                  {staged.failedPages.length > 0 && (
                    <div className="mb-5 w-full rounded-[12px] border-l-[3px] border-nevo-violet bg-nevo-violet/16 px-[18px] py-4">
                      <p className="text-[14.5px] leading-[1.55] text-nevo-near-black/82">
                        {faintPagesLine(staged.failedPages)}
                      </p>
                      <button
                        type="button"
                        onClick={staged.retryFailedPages}
                        disabled={staged.retrying}
                        className="mt-3 inline-flex h-[42px] cursor-pointer items-center rounded-[10px] border-[1.5px] border-nevo-navy/35 bg-nevo-cream-elevated px-[18px] text-[14px] font-medium text-nevo-navy transition-colors hover:bg-nevo-navy/6 disabled:cursor-default disabled:opacity-55"
                      >
                        {staged.retrying
                          ? "Reading them again…"
                          : staged.failedPages.length === 1
                            ? "Read that page again"
                            : "Read those pages again"}
                      </button>
                    </div>
                  )}
                  <LiveStructureTree
                    uploadId={staged.uploadId}
                    structure={staged.structure}
                    segments={staged.segments}
                    blockName={blockName}
                  />
                </>
              ) : staged.failed ? (
                /*
                  TWO FAILURES, TWO SENTENCES.

                  This said "We couldn't read that one" over both a parse
                  that failed and a request that never landed - so our own
                  server being unreachable was reported as a fault in the
                  teacher's file, and the advice was to go and find another
                  one. Backend asked for the split on 18 Sep.
                */
                <div className="w-full rounded-[16px] bg-nevo-cream-elevated p-8 shadow-elevation-1">
                  <h3 className="text-[17px] font-semibold text-nevo-near-black">
                    {/* Three answers, because a refused file, a parse that
                        stopped and a call that never landed are three
                        different things to be told. */}
                    {staged.failureKind === "request"
                      ? "We couldn’t reach Nevo just then"
                      : staged.failureKind === "file"
                        ? "We couldn’t read that one"
                        : "Nevo couldn’t finish that one"}
                  </h3>
                  <p className="mt-2 text-sm leading-[1.55] text-nevo-near-black/62">
                    {/* `error` USED TO LEAD HERE AND CANNOT: it carries a
                        database driver's exception, which nobody had seen
                        until the status route stopped answering 500 on 23 Sep.
                        `failureReason` can, and does - it is the field that
                        promises prose, added 24 Sep because this screen asked
                        for one. Ours stands where the server gave none, which
                        is every failure that is not the parse's own. */}
                    {staged.failureReason ??
                      (staged.failureKind === "request"
                        ? "Nothing is wrong with your file, and nothing you did is lost. Try again in a moment."
                        : staged.failureKind === "file"
                          ? "Nevo couldn’t find lesson text in that file. A PDF, Word file or slides with readable text works best."
                          : "The reading started and stopped partway. Nothing you did is lost.")}
                  </p>
                  {/* The unit path's own failure card. Same line, same
                      reason: a 500 is the one failure we can say nothing
                      useful about, so the least we can do is let a teacher
                      report it precisely. */}
                  <IncidentLine id={staged.incident} />
                  <button
                    type="button"
                    onClick={() => {
                      if (staged.failureKind === "request") {
                        tryAgain();
                        return;
                      }
                      staged.reset();
                      setPhase("file");
                    }}
                    className="mt-5 h-[46px] cursor-pointer rounded-[10px] bg-nevo-navy px-5 text-sm font-semibold text-nevo-cream transition-[filter] hover:brightness-93"
                  >
                    {/* Sending the same file again is the right move when
                        the call failed; a different one is only worth
                        suggesting when this file could not be read. */}
                    {staged.failureKind === "request"
                      ? "Try again"
                      : "Try another file"}
                  </button>
                </div>
              ) : rungFor(staged.stage) >= 0 ? (
                /*
                 * THE LADDER, ON THE LIVE PATH. It used to render only when
                 * there was NO real upload id - so the one teacher who saw the
                 * staged parse story was the one not doing a real upload, and
                 * everybody else got the spinner below.
                 *
                 * `staged.stage` has been on the hook all along and was read by
                 * nothing. Now that the rungs are keyed to `UploadStage` there
                 * is an honest mapping, so the real parse drives the real
                 * ladder. An unrecognised stage falls through to the spinner
                 * rather than guessing at a rung.
                 */
                <ParseProgress stage={rungFor(staged.stage)} />
              ) : (
                <div className="flex w-full items-center gap-5 rounded-[16px] bg-nevo-cream-elevated p-9 shadow-elevation-1">
                  <span className="size-11 shrink-0 rounded-full border-4 border-nevo-navy/20 border-t-nevo-navy motion-safe:animate-spin motion-safe:[animation-duration:800ms]" />
                  <div>
                    <p className="text-[17px] font-semibold text-nevo-near-black">
                      Nevo is reading your unit
                    </p>
                    <p className="mt-1.5 text-sm leading-[1.5] text-nevo-near-black/62">
                      {staged.slow
                        ? "This one is taking a while. It hasn’t stalled, and a longer document takes longer to read."
                        : "This can take a minute for a longer document."}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {phase === "processing" && isBlock && !staged.uploadId && !staged.failed && (
            <ParseProgress stage={parseStage} />
          )}

          {phase === "processing" && !isBlock && (
            /*
             * SCRUM-172 LU-01. What stood here was a spinner and two
             * sentences for work backend measures at about 115 seconds of
             * text plus up to 600 per generated picture - "the time is
             * currently dead... the only available conclusion is that the
             * product has hung".
             */
            <div className="w-full rounded-[16px] bg-nevo-cream-elevated p-9 shadow-elevation-1">
              <ProcessingStages lessonName={blockName} current={singleStage} />
              <p className="mt-6 max-w-[440px] text-[14.5px] leading-[1.5] text-nevo-near-black/60">
                {/* The leave-and-return promise, in the frame's own words.
                    It is TRUE and has been since the single path moved to
                    the staged pipeline: the job has its own id server-side
                    and nothing stops when this tab does.

                    LU-02's action and LU-03's persistent indicator are what
                    make it usable rather than merely true - a teacher who
                    leaves today has no way back to this screen. Both are
                    raised on the ticket; this sentence is deliberately a
                    statement about the work rather than an invitation to go,
                    until there is somewhere to come back from. */}
                {/* C07j's own line, with its hyphen: no em dashes in
                    rendered copy (D1). */}
                Carry on - we&rsquo;ll tell you when it&rsquo;s ready.
                {/*
                  WHAT THE WAIT IS, SAID ON THE RUNG THAT IS LONG.

                  LU-01's frame carries "This usually takes under a minute",
                  which we never shipped - and design struck it on 24 Sep for
                  the reason it was never shipped: *"if a single picture can
                  take ten minutes, that line is a lie and it has to go...
                  a teacher who was promised a minute and waits twelve
                  concludes the product is broken."*

                  NO FIGURE HERE EITHER, in place of a wrong one. Backend
                  measures this stage in minutes per picture and the server
                  reports no estimate for any given lesson, so a number would
                  be a promise a teacher can time and we cannot keep. What can
                  be said is WHICH part is long and WHY, on the rung where it
                  is happening.
                */}
                {singleStage === LONGEST_STAGE &&
                  " This part is the long one - Nevo is making the pictures and the spoken version, and that runs into minutes."}
                {/*
                  THE SLOW LINE USED TO BLAME THE DOCUMENT'S LENGTH - "a longer
                  document takes longer to read" - and that is the wrong
                  explanation: the minutes go on making pictures, not on
                  reading. The half that mattered stays, because a wait running
                  long has to say so rather than leaving a teacher to conclude
                  the product has hung.
                */}
                {staged.slow &&
                  " This one is taking a while. It hasn’t stalled."}
              </p>
            </div>
          )}

          {phase === "done" && (
            <MaybeSample showing={sample} kind="teacher:upload-demo-done">
            <div className="w-full rounded-[16px] bg-nevo-cream-elevated p-8 shadow-elevation-1">
              <div className="flex items-center gap-4">
                <span className="flex size-[52px] shrink-0 items-center justify-center rounded-full bg-nevo-navy motion-safe:animate-nevo-pop">
                  <svg
                    width="26"
                    height="26"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#f7f1e6"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </span>
                <div>
                  {/*
                    A REAL LESSON REACHES THIS SCREEN ONLY WHEN IT COULD NOT BE
                    READ BACK (T82) - the confirm landed, the detail read did
                    not. It said the lesson was ready and that "read, listen
                    and watch versions are all built": nothing was known about
                    any version, and it may still need review. So for a real
                    lesson, its name and the one thing that is known.
                  */}
                  <h3 className="text-[19px] font-semibold text-nevo-near-black">
                    {sample
                      ? `"${fileName.replace(/\.[^.]+$/, "")}" is ready`
                      : `"${fileName.replace(/\.[^.]+$/, "")}"`}
                  </h3>
                  <p className="mt-1 text-[14.5px] text-nevo-near-black/66">
                    {sample
                      ? "Read, listen and watch versions are all built. It’s in your library now."
                      : "It’s in your library now."}
                  </p>
                </div>
              </div>
              <div className="mt-6 flex gap-3">
                <Link
                  href="/teacher/lessons"
                  className="inline-flex h-12 cursor-pointer items-center rounded-[10px] bg-nevo-navy px-[22px] text-[15px] font-semibold text-nevo-cream transition-[filter] hover:brightness-93"
                >
                  See it in the library
                </Link>
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex h-12 cursor-pointer items-center rounded-[10px] border-[1.5px] border-nevo-navy/30 px-5 text-[15px] font-medium text-nevo-navy transition-colors hover:bg-nevo-navy/6"
                >
                  Upload another
                </button>
              </div>
            </div>
            </MaybeSample>
          )}

          {phase === "blockParsed" && (
            <MaybeSample showing={sample} kind="teacher:upload-demo-parsed">
            <div className="w-full rounded-[16px] bg-nevo-cream-elevated p-8 shadow-elevation-1">
              <div className="flex items-center gap-4">
                <span className="flex size-[52px] shrink-0 items-center justify-center rounded-full bg-nevo-navy motion-safe:animate-nevo-pop">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#f7f1e6"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M4 5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4z" />
                    <path d="M20 5v14a2 2 0 0 0-2-2" />
                  </svg>
                </span>
                <div>
                  <h3 className="text-[19px] font-semibold text-nevo-near-black">
                    We&rsquo;ve broken it into 3 lessons
                  </h3>
                  <p className="mt-1 text-[14.5px] leading-[1.5] text-nevo-near-black/66">
                    7 sections and 21 segments in all. Have a look and adjust
                    anything before it goes to your library.
                  </p>
                </div>
              </div>
              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setPhase("demoStructure")}
                  className="inline-flex h-12 cursor-pointer items-center rounded-[10px] bg-nevo-navy px-[22px] text-[15px] font-semibold text-nevo-cream transition-[filter] hover:brightness-93"
                >
                  Review the structure
                </button>
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex h-12 cursor-pointer items-center rounded-[10px] border-[1.5px] border-nevo-navy/30 px-5 text-[15px] font-medium text-nevo-navy transition-colors hover:bg-nevo-navy/6"
                >
                  Start over
                </button>
              </div>
            </div>
            </MaybeSample>
          )}
          </div>
        </div>
      )}

      {/* Foot - Back / route line / Continue (C07c). Only the choosing steps
          carry the foot; working and terminal states own their actions -
          the review step brings its own (inside SectionReview). */}
      {(phase === "scope" || phase === "file") && (
        <div className="flex shrink-0 items-center gap-3.5 border-t border-nevo-near-black/10 px-6 py-3.5 xl:px-8 xl:py-4">
          <button
            type="button"
            onClick={() =>
              phase === "scope"
                ? router.push("/teacher/lessons")
                : setPhase("scope")
            }
            className="inline-flex cursor-pointer items-center gap-[7px] rounded-[10px] border-[1.5px] border-nevo-near-black/18 px-[15px] py-[9px] text-[13.5px] font-semibold text-nevo-near-black transition-colors hover:bg-nevo-near-black/5"
          >
            Back
          </button>
          <span
            className={cn(
              "flex-1 text-[12.5px]",
              phase === "scope" && !scope
                ? "text-nevo-navy"
                : "text-nevo-near-black/60",
            )}
          >
            {phase === "scope" &&
              (scope
                ? `Continue takes you to ${SCOPES.find((s) => s.id === scope)!.route}`
                : "Choose what you're uploading to continue.")}
          </span>
          {phase === "scope" && (
            <button
              type="button"
              onClick={() => scope && setPhase("file")}
              disabled={!scope}
              className={cn(
                "inline-flex items-center gap-2 rounded-[10px] border-none px-[18px] py-[11px] text-sm font-semibold",
                scope
                  ? "cursor-pointer bg-nevo-navy text-nevo-cream transition-[filter] hover:brightness-93"
                  : "cursor-not-allowed bg-nevo-navy/18 text-nevo-near-black/40",
              )}
            >
              Continue
            </button>
          )}
        </div>
      )}
    </div>
  );
}
