"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, LoaderCircle } from "lucide-react";

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
 * WHAT IS HELD, for Lydia (rule 10: the frame and the 12 Nov ruling differ):
 * - P4, "Got it - your page is saved" / "Your teacher will see what you
 *   wrote." SCRUM-343 (ruled 12 Nov, after the frame): the picture is NEVER
 *   stored - "Nevo reads it, keeps the step marks and discards the image".
 *   The page is not saved and no teacher sees it, so both lines are untrue.
 *   A read photo hands straight back to the lesson (`onContinue("read")`)
 *   until there are true words for it.
 * - P5's second sentence, "If you can photograph it later, your teacher
 *   will still see it." Untrue for the same reason, and there is no later.
 * - The person-in-the-photo refusal (SCRUM-343's person-present verdict).
 *   Not drawn; its words are in Lydia's 28 Oct document, quoted, never ours.
 * - A send that fails. Not drawn: the photo stays held on P3 so it can be
 *   sent again, and nothing calls a dropped connection an unreadable photo.
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

/** The server's word on a photo. Only what the frame draws. */
export type PaperWorkVerdict = "read" | "unreadable";

/** How the child carried on. */
export type PaperWorkExit = "read" | "without_photo" | "no_camera";

/**
 * The longest side a photo is sent at. The checker refuses images over 3.5 MB
 * (Teslim, 12 Nov), and a phone's full sensor can pass that; this keeps a
 * page legible well inside it. About the picture, not the child.
 */
const LONGEST_SIDE_PX = 2000;
const JPEG_QUALITY = 0.85;

type Step = "instruction" | "capture" | "review" | "unreadable" | "noCamera";

export function PaperWorkCapture({
  instruction,
  teacherAsked = false,
  onSend,
  onContinue,
}: {
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
      // Not drawn (see the docblock): held on P3, to send again.
      setSending(false);
      return;
    }
    setSending(false);
    if (verdict === "unreadable") {
      setStep("unreadable");
      return;
    }
    dropPhoto();
    onContinue("read");
  };

  const carryOnWithout = () => {
    dropPhoto();
    onContinue("without_photo");
  };

  if (!instruction) return null;

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

      {step === "noCamera" && (
        <>
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <span className="flex size-[60px] items-center justify-center rounded-full bg-nevo-violet/22 text-nevo-navy">
              <CameraOff className="size-7" strokeWidth={1.9} aria-hidden />
            </span>
            <h2 className="mt-5 text-[21px] font-semibold">No problem</h2>
            <p className="mt-2 max-w-[290px] text-[14.5px] leading-[1.55] text-pretty text-nevo-near-black/66">
              Do this one on paper and carry on.
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
