"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Check, LoaderCircle } from "lucide-react";
import { Button } from "@/components/shared";
import { randomId } from "@/lib/utils";
import {
  MARK_WAIT_LINE,
  SEND_AGAIN,
  SLOW_MARK_MS,
} from "@/lib/lessons/verdict";

/**
 * PAPER WORK: DO IT ON PAPER, PHOTOGRAPH THE PAGE (design 17g, 5 Nov; the
 * learner photo-upload screens Lydia reviewed at the 18 Nov standup).
 *
 * UNREACHABLE, ON PURPOSE. Nothing in the lesson player opens this yet, and
 * nothing may until two things exist that do not:
 * - a field on the lesson read saying THIS item is done on paper, and the
 *   words of what to do ("the lesson says what is being asked for rather
 *   than the screen assuming" - 17g). `ComprehensionCheckpoint.answerType`
 *   is single_choice, multiple_choice, text, numeric or boolean, and nothing
 *   else carries it;
 * - the camera route (SCRUM-343, Teslim's: 7-10 backend days behind the
 *   checker baseline, Lydia 16 Nov). The only paper-work route today is
 *   `POST .../paper-work/typed`, which takes typed steps, not a picture.
 * Rule 5: with no instruction this renders nothing, and it invents none.
 *
 * WHAT IS BUILT: the frame's P1 (the instruction), P2 (the camera on the
 * page), P3 (retake before sending), P5 (can't or won't use the camera -
 * never blocked) and P6 (the photo couldn't be read - calm, no blame), in the
 * frame's words, at its one 460 column on every viewport.
 *
 * AND, IN LYDIA'S WORDS NOW THAT PHOTOS ARE NEVER STORED (25 Nov, L15, L16
 * and L41), in place of the frame's, which said the page was saved and a
 * teacher would see it (SCRUM-343: "Nevo reads it, keeps the step marks and
 * discards the image"):
 * - P4, the photo read: "Got it, Nevo has read your page." / "Your teacher
 *   will see how you did." - and Keep going, the frame's.
 * - P5's second sentence: "If you can photograph it later, Nevo will still
 *   read it."
 * - Anything else the check holds, in P6's layout.
 * Each of her lines is one paragraph; its first sentence takes the frame's
 * bold line and the rest the sentence under it. Not a word is changed.
 *
 * P7 AND P8 IN THE FRAME'S WORDS (Lydia, 28 Nov, on L16 and L17: all three
 * photo states are drawn, in student/ and Individual Learner/ alike):
 * - P7, a person in the photo: "There's someone in this one" / "Nevo only
 *   needs your page. Take it again with just your working in the frame, or
 *   carry on without it." Retake, and Continue without it in navy.
 * - P8, a send that fails: "Something went wrong. We're on it." / "Your
 *   photo is still here on your device. Try sending it again, or carry on
 *   and send it later." Its own state, so nothing calls a dropped connection
 *   an unreadable photo, and the photo is kept to send again: Try again
 *   leads in navy, with Continue without it the quiet line under it.
 *
 * P9, read but the working needs more doing, in her words (28 Nov, L94):
 * "There's more to do on this one" / "Nevo read your page, and part of the
 * working is still missing. Finish it and take another photo, or keep
 * going." In the frame's layout, with its two ways on: Retake, and Keep
 * going (`onContinue("needs_work")`).
 *
 * TYPED, WHERE THERE IS NO CAMERA (Lydia, 25 Nov, L59), built to her spec
 * before its frame, from what exists. Where the check's steps can be typed
 * (`typed`), "I can't use a camera right now" leads to "No camera? You can
 * type what you worked out instead.", and her screen heading is "Type what
 * you worked out." One field per guided step, named by its prompt; "Check"
 * sends them, as every check does; past two seconds the wait's one line, and
 * "Send again" only on a real failure (the mark wait's words, SCRUM-315).
 * The server says whether they matched; NO WORDS FOR WHAT IT SAYS YET, so
 * the child is handed back to the lesson with the answer (`typed` or
 * `typed_needs_work`) - raised, not guessed. It never passes the check.
 * Where nothing can be typed, P5 is as above.
 *
 * THE VERDICTS ARE OURS TO NAME UNTIL THE CAMERA ROUTE IS SPECIFIED (T5).
 * They are the outcomes her lines cover; the server's shape maps onto them
 * when it exists.
 *
 * NEVER STORED, ON THIS SIDE TOO (SCRUM-343, ADR 0009: "never written to
 * disk ... no thumbnail and no cache of ours. The camera roll is the
 * child's"). The camera is read through `getUserMedia`, not a file input
 * that can hand the picture to the device's camera app and its roll. The
 * picture lives in memory as one Blob, goes nowhere but `onSend`, is dropped
 * when the child retakes, sends, carries on or leaves, and its preview URL
 * is revoked with it. The camera is switched off the moment the child leaves
 * the viewfinder.
 */

/**
 * The server's word on a photo: read; read, but the working needs more doing
 * (P9); couldn't be read (P6); a person in it (P7); or held by the check for
 * anything else.
 */
export type PaperWorkVerdict =
  | "read"
  | "needs_work"
  | "unreadable"
  | "person"
  | "held";

/** How the child carried on. */
export type PaperWorkExit =
  | "read"
  | "needs_work"
  | "without_photo"
  | "no_camera"
  | "typed"
  | "typed_needs_work";

/** One guided step of the check, as the lesson read gives it to a child. */
export interface PaperStep {
  stepId: string;
  prompt: string;
}

/** The typed route for this check: its steps, and how to send them. */
export interface TypedPaperWork {
  /** Every guided step of the check, in order. None: nothing is typed. */
  steps: PaperStep[];
  /**
   * Sends what was typed, one answer per step in order, under one
   * submission id (so a send sent again is the same one), and resolves with
   * the server's word on it.
   */
  onSubmit: (
    answers: { stepId: string; answer: string }[],
    clientSubmissionId: string,
  ) => Promise<"matched" | "needs_work">;
}

/**
 * The longest side a photo is sent at. The checker refuses images over 3.5 MB
 * (Teslim, 12 Nov), and a phone's full sensor can pass that; this keeps a
 * page legible well inside it. About the picture, not the child.
 */
const LONGEST_SIDE_PX = 2000;
const JPEG_QUALITY = 0.85;

type Step =
  | "instruction"
  | "capture"
  | "review"
  | "done"
  | "unreadable"
  | "person"
  | "held"
  | "sendFailed"
  | "moreToDo"
  | "noCamera"
  | "typed";

export function PaperWorkCapture({
  instruction,
  teacherAsked = false,
  typed,
  onSend,
  onContinue,
}: {
  /** The typed route, where this check's steps can be typed (L59). */
  typed?: TypedPaperWork | null;
  /** What to do on paper, in the lesson's words. Absent renders nothing. */
  instruction: string | null | undefined;
  /** The server says the teacher asked for this one on paper. */
  teacherAsked?: boolean;
  /** Sends the photo and resolves with the server's verdict. */
  onSend: (photo: Blob) => Promise<PaperWorkVerdict>;
  /** The child carries on - with a read photo, without one, or no camera. */
  onContinue: (how: PaperWorkExit) => void;
}) {
  const [step, setStep] = useState<Step>("instruction");
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(
    null,
  );
  const [sending, setSending] = useState(false);
  const stream = useRef<MediaStream | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);

  const cameraOff = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);

  /** Drop the picture. Its preview URL goes with it (below). */
  const dropPhoto = useCallback(() => setPhoto(null), []);

  // A picture's preview URL lives exactly as long as the picture: revoked
  // when it is replaced or dropped, and when the screen goes.
  useEffect(() => {
    if (!photo) return;
    return () => URL.revokeObjectURL(photo.url);
  }, [photo]);

  // Leaving switches the camera off.
  useEffect(() => cameraOff, [cameraOff]);

  const openCamera = useCallback(async () => {
    dropPhoto();
    const media =
      typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!media?.getUserMedia) {
      // No camera to ask for: the frame's "can't use the camera".
      setStep("noCamera");
      return;
    }
    try {
      stream.current = await media.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      setStep("capture");
    } catch {
      // Refused, or none on this device. Never blocked (17g P5).
      cameraOff();
      setStep("noCamera");
    }
  }, [cameraOff, dropPhoto]);

  // The live picture, once the viewfinder is on screen.
  useEffect(() => {
    if (step !== "capture" || !video.current || !stream.current) return;
    video.current.srcObject = stream.current;
  }, [step]);

  const cancelCapture = () => {
    cameraOff();
    setStep("instruction");
  };

  /**
   * The picture is WHAT THE VIEWFINDER SHOWED, not the whole sensor. The live
   * view fills its box and crops the rest (`object-cover`), and the child
   * lines their page up inside those corners - so sending the full frame
   * would send what they never framed, a person beside the desk included.
   */
  const takePhoto = () => {
    const el = video.current;
    if (!el || !el.videoWidth || !el.videoHeight) return;
    const vw = el.videoWidth;
    const vh = el.videoHeight;
    const box = el.getBoundingClientRect();
    const shown = box.width && box.height ? box.width / box.height : vw / vh;
    const sw = Math.min(vw, vh * shown);
    const sh = Math.min(vh, vw / shown);
    const scale = Math.min(1, LONGEST_SIDE_PX / Math.max(sw, sh));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(sw * scale);
    canvas.height = Math.round(sh * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(
      el,
      (vw - sw) / 2,
      (vh - sh) / 2,
      sw,
      sh,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    canvas.toBlob(
      (blob) => {
        // The canvas is not kept either.
        canvas.width = 0;
        canvas.height = 0;
        if (!blob) return;
        cameraOff();
        setPhoto({ blob, url: URL.createObjectURL(blob) });
        setStep("review");
      },
      "image/jpeg",
      JPEG_QUALITY,
    );
  };

  const send = async () => {
    if (!photo || sending) return;
    setSending(true);
    let verdict: PaperWorkVerdict;
    try {
      verdict = await onSend(photo.blob);
    } catch {
      // P8: the send, not the photo. The picture stays, to send again.
      setSending(false);
      setStep("sendFailed");
      return;
    }
    setSending(false);
    if (verdict === "unreadable" || verdict === "person" || verdict === "held") {
      setStep(verdict);
      return;
    }
    // P9: read, with more to do - the page stays on screen beside her words.
    if (verdict === "needs_work") {
      setStep("moreToDo");
      return;
    }
    dropPhoto();
    setStep("done");
  };

  const carryOnWithout = () => {
    dropPhoto();
    onContinue("without_photo");
  };

  if (!instruction) return null;
  const canType = !!typed && typed.steps.length > 0;

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-[460px] flex-1 flex-col p-[22px] text-nevo-near-black">
      {step === "instruction" && (
        <>
          <Eyebrow>On paper</Eyebrow>
          <h2 className="mt-2 text-xl leading-[1.35] font-semibold tracking-[-0.01em]">
            {instruction}
          </h2>
          {teacherAsked && (
            <p className="mt-2.5 text-sm leading-normal text-nevo-near-black/66">
              Your teacher asked for this one on paper.
            </p>
          )}
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => void openCamera()}
            className={PRIMARY}
          >
            <Camera className="size-5" strokeWidth={1.9} aria-hidden />
            Take a photo
          </button>
          <button
            type="button"
            onClick={() => setStep("noCamera")}
            className={QUIET}
          >
            I can&apos;t use a camera right now
          </button>
        </>
      )}

      {step === "capture" && (
        <>
          <div className="relative flex min-h-[360px] flex-1 items-center justify-center overflow-hidden rounded-2xl bg-nevo-near-black">
            <video
              ref={video}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 size-full object-cover"
            />
            <Corner className="top-3.5 left-3.5 rounded-tl border-t-[3px] border-l-[3px]" />
            <Corner className="top-3.5 right-3.5 rounded-tr border-t-[3px] border-r-[3px]" />
            <Corner className="bottom-3.5 left-3.5 rounded-bl border-b-[3px] border-l-[3px]" />
            <Corner className="right-3.5 bottom-3.5 rounded-br border-r-[3px] border-b-[3px]" />
            <span className="absolute inset-x-0 bottom-4 text-center text-[12.5px] text-nevo-cream/80">
              Line your page up inside the frame
            </span>
          </div>
          <div className="mt-4 flex items-center justify-center gap-7">
            <button
              type="button"
              onClick={cancelCapture}
              className="min-h-11 w-12 cursor-pointer text-[14.5px] font-semibold text-nevo-navy"
            >
              Cancel
            </button>
            <button
              type="button"
              aria-label="Take a photo"
              onClick={takePhoto}
              className="size-16 shrink-0 cursor-pointer rounded-full border-4 border-nevo-navy/25 bg-nevo-navy"
            />
            <span className="w-12" aria-hidden />
          </div>
        </>
      )}

      {step === "review" && photo && (
        <>
          <Eyebrow>Happy with this?</Eyebrow>
          <Picture url={photo.url} className="mt-3 min-h-[300px]" />
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              disabled={sending}
              onClick={() => void openCamera()}
              className={SECONDARY}
            >
              Retake
            </button>
            <button
              type="button"
              aria-busy={sending || undefined}
              onClick={() => void send()}
              className={`${SOLID} h-[52px] flex-1 rounded-[10px] text-[15px]`}
            >
              {sending ? (
                <LoaderCircle
                  role="status"
                  aria-label="Loading"
                  className="size-5 motion-safe:animate-spin"
                />
              ) : (
                "Use this photo"
              )}
            </button>
          </div>
        </>
      )}

      {step === "done" && (
        <>
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <span className="flex size-[60px] items-center justify-center rounded-full bg-nevo-navy text-nevo-cream motion-safe:animate-nevo-pop">
              <Check className="size-[30px]" strokeWidth={2.4} aria-hidden />
            </span>
            <h2 className="mt-5 text-[21px] font-semibold">
              Got it, Nevo has read your page.
            </h2>
            <p className="mt-2 max-w-[290px] text-[14.5px] leading-[1.55] text-pretty text-nevo-near-black/66">
              Your teacher will see how you did.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onContinue("read")}
            className={PRIMARY}
          >
            Keep going
          </button>
        </>
      )}

      {step === "person" && photo && (
        <PhotoHeld
          url={photo.url}
          title="There's someone in this one"
          body="Nevo only needs your page. Take it again with just your working in the frame, or carry on without it."
          again="Retake"
          onAgain={() => void openCamera()}
          onCarryOn={carryOnWithout}
        />
      )}

      {step === "held" && photo && (
        <PhotoHeld
          url={photo.url}
          title="Nevo couldn't read this one."
          body="Take another photo of just the page, with the whole page in frame."
          again="Retake"
          onAgain={() => void openCamera()}
          onCarryOn={carryOnWithout}
        />
      )}

      {step === "moreToDo" && photo && (
        <PhotoHeld
          url={photo.url}
          title="There's more to do on this one"
          body="Nevo read your page, and part of the working is still missing. Finish it and take another photo, or keep going."
          again="Retake"
          onAgain={() => void openCamera()}
          carryOn="Keep going"
          onCarryOn={() => {
            dropPhoto();
            onContinue("needs_work");
          }}
        />
      )}

      {step === "sendFailed" && photo && (
        <PhotoHeld
          url={photo.url}
          title="Something went wrong. We're on it."
          body="Your photo is still here on your device. Try sending it again, or carry on and send it later."
          again="Try again"
          againLeads
          busy={sending}
          onAgain={() => void send()}
          onCarryOn={carryOnWithout}
        />
      )}

      {step === "unreadable" && photo && (
        <>
          <Eyebrow>On paper</Eyebrow>
          <Picture url={photo.url} className="mt-3 min-h-[240px]" />
          <div
            role="status"
            className="mt-3.5 rounded-xl bg-nevo-violet/18 px-4 py-3.5"
          >
            <p className="text-[15px] font-semibold">
              We couldn&apos;t quite read that one
            </p>
            <p className="mt-1.5 text-[13.5px] leading-normal text-nevo-violet-text">
              That&apos;s the photo, not your working. Try again in better
              light, or carry on without it.
            </p>
          </div>
          <div className="mt-3.5 flex gap-3">
            <button
              type="button"
              onClick={() => void openCamera()}
              className={SECONDARY}
            >
              Retake
            </button>
            <button
              type="button"
              onClick={carryOnWithout}
              className={`${SOLID} h-[52px] flex-1 rounded-[10px] text-[15px]`}
            >
              Continue without it
            </button>
          </div>
        </>
      )}

      {step === "noCamera" && canType && (
        <>
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <span className="flex size-[60px] items-center justify-center rounded-full bg-nevo-violet/22 text-nevo-navy">
              <CameraOff className="size-7" strokeWidth={1.9} aria-hidden />
            </span>
            <h2 className="mt-5 text-[21px] font-semibold">No camera?</h2>
            <p className="mt-2 max-w-[290px] text-[14.5px] leading-[1.55] text-pretty text-nevo-near-black/66">
              You can type what you worked out instead.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setStep("typed")}
            className={PRIMARY}
          >
            Type what you worked out
          </button>
          <button
            type="button"
            onClick={() => onContinue("no_camera")}
            className={QUIET}
          >
            Keep going
          </button>
          <button
            type="button"
            onClick={() => void openCamera()}
            className={QUIET}
          >
            Try the camera again
          </button>
        </>
      )}

      {step === "typed" && typed && (
        <TypedSteps typed={typed} onDone={onContinue} />
      )}

      {step === "noCamera" && !canType && (
        <>
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <span className="flex size-[60px] items-center justify-center rounded-full bg-nevo-violet/22 text-nevo-navy">
              <CameraOff className="size-7" strokeWidth={1.9} aria-hidden />
            </span>
            <h2 className="mt-5 text-[21px] font-semibold">No problem</h2>
            <p className="mt-2 max-w-[290px] text-[14.5px] leading-[1.55] text-pretty text-nevo-near-black/66">
              Do this one on paper and carry on. If you can photograph it
              later, Nevo will still read it.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onContinue("no_camera")}
            className={PRIMARY}
          >
            Keep going
          </button>
          <button
            type="button"
            onClick={() => void openCamera()}
            className={QUIET}
          >
            Try the camera again
          </button>
        </>
      )}
    </div>
  );
}

const SOLID =
  "flex cursor-pointer items-center justify-center gap-2 bg-nevo-navy font-semibold text-nevo-cream";
const PRIMARY = `${SOLID} h-14 w-full rounded-xl text-base`;
const QUIET =
  "mt-2.5 h-12 w-full cursor-pointer rounded-[10px] text-[14.5px] font-semibold text-nevo-navy";
const SECONDARY =
  "h-[52px] flex-1 cursor-pointer rounded-[10px] border-[1.5px] border-nevo-navy/30 text-[15px] font-semibold text-nevo-navy disabled:cursor-default";

function Eyebrow({ children }: { children: string }) {
  return (
    <span className="text-xs font-semibold tracking-[0.04em] text-nevo-violet uppercase">
      {children}
    </span>
  );
}

function Corner({ className }: { className: string }) {
  return (
    <span
      aria-hidden
      className={`absolute size-[26px] border-nevo-cream ${className}`}
    />
  );
}

/** The child's own photo, shown back to them and kept nowhere else. */
function Picture({ url, className }: { url: string; className: string }) {
  return (
    <div
      className={`relative flex-1 overflow-hidden rounded-xl bg-nevo-cream-elevated ${className}`}
    >
      {/* Fitted inside the panel, so a tall photo never pushes the buttons
          off the screen. A Blob URL in memory: next/image would fetch and
          cache it. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        className="absolute inset-0 size-full object-contain"
      />
    </div>
  );
}

/**
 * P6's layout, for the frame's other holds on a photo (P7, P8, P9) and the
 * check's: the photo, a calm violet box with the line, and two ways on - one
 * always carries on, so no state is a dead end (17g).
 */
function PhotoHeld({
  url,
  title,
  body,
  again,
  busy = false,
  againLeads = false,
  onAgain,
  carryOn = "Continue without it",
  onCarryOn,
}: {
  url: string;
  title: string;
  body: string;
  again: string;
  busy?: boolean;
  /**
   * P8's order: sending again is the way on, so it leads in navy, and
   * carrying on is the quiet line under it. Otherwise the retake is the
   * outlined button beside the navy way on.
   */
  againLeads?: boolean;
  onAgain: () => void;
  /** The way on: "Continue without it", or P9's "Keep going". */
  carryOn?: string;
  onCarryOn: () => void;
}) {
  return (
    <>
      <Eyebrow>On paper</Eyebrow>
      <Picture url={url} className="mt-3 min-h-[240px]" />
      <div role="status" className="mt-3.5 rounded-xl bg-nevo-violet/18 px-4 py-3.5">
        <p className="text-[15px] font-semibold">{title}</p>
        <p className="mt-1.5 text-[13.5px] leading-normal text-nevo-violet-text">
          {body}
        </p>
      </div>
      {againLeads ? (
        <div className="mt-3.5 flex flex-col">
          <button
            type="button"
            disabled={busy}
            aria-busy={busy || undefined}
            onClick={onAgain}
            className={`${SOLID} h-[52px] w-full rounded-[10px] text-[15px] disabled:cursor-default`}
          >
            {again}
          </button>
          <button type="button" onClick={onCarryOn} className={QUIET}>
            {carryOn}
          </button>
        </div>
      ) : (
        <div className="mt-3.5 flex gap-3">
          <button
            type="button"
            disabled={busy}
            aria-busy={busy || undefined}
            onClick={onAgain}
            className={SECONDARY}
          >
            {again}
          </button>
          <button
            type="button"
            onClick={onCarryOn}
            className={`${SOLID} h-[52px] flex-1 rounded-[10px] text-[15px]`}
          >
            {carryOn}
          </button>
        </div>
      )}
    </>
  );
}

/**
 * "Type what you worked out." (L59): one field per guided step, named by its
 * prompt, all of them answered before "Check" sends them - the server takes
 * every step, in order, or none. The wait and the failure are the mark
 * wait's (SCRUM-315): nothing said for two seconds, then its one line;
 * "Send again" only on a real failure, sending the same submission again.
 */
function TypedSteps({
  typed,
  onDone,
}: {
  typed: TypedPaperWork;
  onDone: (how: PaperWorkExit) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [slow, setSlow] = useState(false);
  const [failed, setFailed] = useState(false);
  // One submission, however many times it is sent.
  const [submission] = useState(() => randomId());
  const slowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (slowTimer.current) clearTimeout(slowTimer.current);
    },
    [],
  );

  const ready = typed.steps.every((s) => (answers[s.stepId] ?? "").trim() !== "");

  const send = async () => {
    if (!ready || sending) return;
    setSending(true);
    setFailed(false);
    setSlow(false);
    slowTimer.current = setTimeout(() => setSlow(true), SLOW_MARK_MS);
    let status: "matched" | "needs_work";
    try {
      status = await typed.onSubmit(
        typed.steps.map((s) => ({ stepId: s.stepId, answer: answers[s.stepId].trim() })),
        submission,
      );
    } catch {
      setFailed(true);
      return;
    } finally {
      if (slowTimer.current) clearTimeout(slowTimer.current);
      setSlow(false);
      setSending(false);
    }
    onDone(status === "matched" ? "typed" : "typed_needs_work");
  };

  return (
    <>
      <Eyebrow>On paper</Eyebrow>
      <h2 className="mt-2 text-xl leading-[1.35] font-semibold tracking-[-0.01em]">
        Type what you worked out.
      </h2>
      <div className="mt-5 flex flex-col gap-4">
        {typed.steps.map((s) => (
          <label key={s.stepId} className="flex flex-col gap-2">
            <span className="text-[14.5px] leading-[1.5] text-pretty text-nevo-near-black">
              {s.prompt}
            </span>
            <input
              type="text"
              autoComplete="off"
              value={answers[s.stepId] ?? ""}
              onChange={(e) =>
                setAnswers((prev) => ({ ...prev, [s.stepId]: e.target.value }))
              }
              disabled={sending}
              className="h-[52px] w-full rounded-[10px] border-[1.5px] border-nevo-near-black/16 bg-nevo-cream-elevated px-4 text-base text-nevo-near-black outline-none focus:border-nevo-navy focus:bg-nevo-cream"
            />
          </label>
        ))}
      </div>
      <div className="flex-1" />
      <button
        type="button"
        disabled={!ready || sending}
        aria-busy={sending || undefined}
        onClick={() => void send()}
        className={`${PRIMARY} mt-6 disabled:cursor-default disabled:bg-nevo-navy/32`}
      >
        Check
      </button>
      <div aria-live="polite">
        {failed ? (
          <Button variant="secondary" className="mt-3 w-full" onClick={() => void send()}>
            {SEND_AGAIN}
          </Button>
        ) : slow ? (
          <p className="mt-3 text-center text-[13.5px] leading-[1.5] text-nevo-near-black/70">
            {MARK_WAIT_LINE}
          </p>
        ) : null}
      </div>
    </>
  );
}
