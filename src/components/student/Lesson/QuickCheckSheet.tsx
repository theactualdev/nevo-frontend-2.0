"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/shared";
import type { QuickCheck } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AnswerCheck, AnswerOption } from "./AnswerOption";
import { READING_BODY, READING_HEADING } from "./readingSupport";
import { SpokenPrompt } from "./SpokenPrompt";

/** Whole milliseconds since a monotonic reading, or null without one. */
function msSince(start: number | null): number | null {
  return start === null
    ? null
    : Math.max(0, Math.round(performance.now() - start));
}

/**
 * How far the phone sheet is pulled down before letting go closes it, and how
 * far a finger moves before it counts as pulling rather than tapping. A
 * gesture's distances, about the sheet and nothing about the child.
 */
const SWIPE_CLOSES_AT_PX = 80;
const SWIPE_STARTS_AT_PX = 8;

/** The Lesson Check frame's `qc-recovery` line, after a miss (17d S1). */
export const RECOVERY_LINE = "Let's look at this another way.";

/**
 * How long the held miss stays up before the sheet gives way: time to read
 * one short line. Lydia, 26 Oct (D1): "1.8 seconds is fine. Long enough to
 * land, short enough not to feel like a penalty." About the sheet, nothing
 * about the child.
 */
export const GIVES_WAY_AFTER_MS = 1800;

/** The sheet is the centred card from `sm:` up, and only the phone's swipes. */
function centredCard(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(min-width: 640px)").matches
  );
}

/**
 * Inline comprehension check (Lesson Check frame) — a bottom sheet on mobile,
 * a centred card on tablet/desktop, over the dimmed player. Feedback is warm
 * and system-owned: a correct pick is affirmed plainly (navy) and "Continue"
 * advances; a miss is held without a verdict and the sheet gives way to the
 * section's other ways in (below). The check is only spent by a correct
 * answer.
 *
 * NO "SEE IT EXPLAINED" (design D93, confirmed 6 Oct). A child who cannot
 * reach the answer is also the Socratic hand-off's (SCRUM-241): the server
 * says so on the reply to a miss, and the player closes this sheet for the
 * panel - see `handOffFrom` in `LessonPlayer`, and `SocraticPanel`.
 *
 * Mount keyed on the segment id so the chosen answer resets per segment.
 *
 * A CHILD CAN TAP OUT OF IT (Olayinka, 23 Oct - reversing IA 31's "no manual
 * dismiss"). A tap on the dimmed player, Esc, or the phone sheet pulled down
 * closes it, and the child is back on the same section with its place kept,
 * free to read it again, try another format or pace, or take a break. Tapping
 * out passes nothing: the check is asked afresh - its last pick cleared - when
 * Next opens it again. No close button: no frame draws one.
 *
 * NO MOVING ON PAST IT BEFORE A RIGHT ANSWER (Olayinka, 23 Oct, under Lydia's
 * gate ruling of the same day). The Keep going it carried before any answer
 * (Lydia, SCRUM-275, 22 Oct: "A child whose only way past is the right answer
 * is trapped") is gone, because tapping out is the way out now and it goes
 * back to the section, not on past it. Continue after a right answer
 * (`onContinue`) is the frame's way on. Olayinka, 25 Oct: "the child
 * shouldn't be able to move with a wrong answer." Lydia, 26 Oct: a check
 * carrying its own authored answer "gates normally" - and the client cannot
 * yet tell an authored key from a generated one, so every check holds.
 *
 * THE BREAK IS INSIDE IT (Lydia, 23 Oct: a hold at a check is not live until
 * the break is reachable at all times, including from inside the check
 * sheet). "Take a break" sits across from QUICK CHECK, as the Lesson Check
 * frame draws it on a section's checks (design 4e03b7f), and starts the
 * child's own break - see `onTakeBreak`.
 *
 * ONE PRIMARY (Lydia, SCRUM-275, 22 Oct): navy and full width is the action
 * that progresses the check - since Lydia's 25 Oct ruling Continue after a
 * right answer, as the Lesson Check frame's `qc-correct` draws it (17d). A
 * miss has no button at all (`qc-recovery`).
 *
 * A SPOKEN CHECK (B16) says its question aloud on opening, with the printed
 * question still in place - see `SpokenPrompt`. The reading accommodation's
 * typographic half reaches the question, the answers and the note (D30).
 *
 * A MISS IS THE FRAME'S `qc-recovery` (17d S1; Lesson Check frame, design
 * 52e3ae3) - Lydia ruled on 25 Oct to ship it ahead of the gate, and
 * Olayinka switched it on for every check on 26 Oct. The answer picked is
 * simply held - navy, no dot, no cross - the line reads "Let's look at this
 * another way.", and there is no Try again: "the sheet gives way to the
 * re-presentation in the player behind it - the alternative arriving is the
 * response." It gives way by itself once the line has been read
 * (`GIVES_WAY_AFTER_MS`, 1.8 seconds - Lydia's D1, 26 Oct), to the
 * section's other ways in (`WaysInCard`), and is asked afresh when Next
 * opens it again. It was "Not quite" and a Try again that put the same
 * question straight back.
 *
 * THE ENGINE'S HINT, WHILE THE CHECK IS OPEN, IS HERE WITH ITS QUESTION
 * (Lydia, SCRUM-275, 21 Oct): "a hint that arrives after the moment it was
 * for is worse than no hint, and away from its question it does not read."
 * Under the sheet it sat behind the scrim, unseen, until the check closed and
 * the segment moved on. The player decides whether there is one (`hint`);
 * this only gives it its place, under the question and over the answers, as
 * the Lesson Player frame's answer sheet draws its hint.
 *
 * SEVERAL CHECKS, ONE AFTER ANOTHER IN THIS SHEET (Lydia, 23 Oct #1; design
 * 4e03b7f's `qc-multi`). The player hands it one check at a time and says
 * where it is (`position`), and the sheet says so in Lydia's words - "Check
 * 2 of 4" (26 Oct, D4: "It works at any count and it matches 'Segment 4 of
 * 6' that the player already shows") - in place of the frame's three lines,
 * whose middle one was wrong past three checks. After a right answer the
 * frame's "Next check", or "Finish" on the last; a miss is a single check's
 * miss, on this check alone. One check is the sheet as it always was.
 */
export function QuickCheckSheet({
  check,
  open,
  onTapOut,
  onAnswered,
  onContinue,
  onTakeBreak,
  reading = false,
  onAudioBusy,
  hint,
  onGiveWay,
  position,
}: {
  check: QuickCheck;
  /**
   * Where this check is among its section's, counted from 1, where the
   * section has more than one. Absent for a section's only check.
   */
  position?: { at: number; of: number };
  open: boolean;
  /**
   * A miss has been read and the sheet gives way to the ways in behind it.
   * The system's move, not the child's: never `onTapOut`.
   */
  onGiveWay?: () => void;
  /**
   * The child tapped out - the dimmed player, Esc, or the phone sheet pulled
   * down. The sheet's own buttons close it through their own callbacks, never
   * this. It only ever closes: Next opens it, by `open`.
   */
  onTapOut: () => void;
  /** The reading accommodation is on - see `readingSupport`. */
  reading?: boolean;
  /** The engine's hint for this check's segment, as the player draws it. */
  hint?: ReactNode;
  /** `system_busy` bracket while a spoken question plays. */
  onAudioBusy?: (phase: "start" | "end") => void;
  /**
   * Fired per attempt, the moment an option is picked - with what was picked
   * and how long the question had been in front of the child (rule 4).
   */
  onAnswered: (
    correct: boolean,
    answered: { selectedId: string; responseTimeMs?: number },
  ) => void;
  /**
   * The way on after a correct answer: "Continue", or with several checks
   * "Next check" and, on the last, "Finish". The player decides where it goes.
   */
  onContinue: () => void;
  /** "Take a break" - the child's own break, from inside the check. */
  onTakeBreak: () => void;
}) {
  const [chosenId, setChosenId] = useState<string | null>(null);
  const resolved = chosenId !== null;
  const correct = chosenId === check.correctId;

  // When the question was last put in front of the child: on opening, and
  // again once a miss has given way.
  const askedAt = useRef<number | null>(null);
  useEffect(() => {
    if (open && chosenId === null) askedAt.current = performance.now();
  }, [open, chosenId]);

  const choose = (id: string) => {
    if (resolved) return;
    setChosenId(id);
    const responseTimeMs = msSince(askedAt.current);
    onAnswered(id === check.correctId, {
      selectedId: id,
      ...(responseTimeMs === null ? {} : { responseTimeMs }),
    });
  };

  /** Tapped out: the check is asked afresh next time, unless it was passed. */
  const tapOut = () => {
    if (!correct) setChosenId(null);
    onTapOut();
  };

  // A miss is held - not marked - and then gives way.
  const recovering = resolved && !correct;
  const giveWay = useRef(onGiveWay);
  useEffect(() => {
    giveWay.current = onGiveWay;
  });
  useEffect(() => {
    if (!recovering || !open) return;
    const timer = setTimeout(() => {
      setChosenId(null);
      giveWay.current?.();
    }, GIVES_WAY_AFTER_MS);
    return () => clearTimeout(timer);
  }, [recovering, open]);

  /*
   * THE PHONE SHEET PULLED DOWN. It follows the finger once it has moved far
   * enough to be a pull, and closes if let go far enough down; short of that
   * it settles back. A pull that ends on an answer does not pick it.
   */
  const pull = useRef<{ id: number; from: number; pulling: boolean } | null>(
    null,
  );
  const [pulledBy, setPulledBy] = useState(0);
  const pulled = useRef(false);
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    pulled.current = false;
    if (!e.isPrimary || centredCard()) return;
    pull.current = { id: e.pointerId, from: e.clientY, pulling: false };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const p = pull.current;
    if (!p || p.id !== e.pointerId) return;
    const by = e.clientY - p.from;
    if (!p.pulling) {
      if (by < -SWIPE_STARTS_AT_PX) pull.current = null;
      if (by < SWIPE_STARTS_AT_PX) return;
      p.pulling = true;
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    setPulledBy(Math.max(0, by));
  };
  const endPull = (e: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const p = pull.current;
    pull.current = null;
    if (!p?.pulling || p.id !== e.pointerId) return;
    pulled.current = true;
    setPulledBy(0);
    if (!cancelled && e.clientY - p.from >= SWIPE_CLOSES_AT_PX) tapOut();
  };

  const tone = (id: string) => {
    if (!resolved) return "idle";
    if (id !== chosenId) return "muted";
    // Right or not, the pick is held in navy: `qc-recovery` puts no verdict
    // on a miss.
    return "navy";
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) tapOut();
      }}
    >
      <SheetContent
        data-nevo-console="student"
        side="bottom"
        showCloseButton={false}
        aria-describedby={undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endPull(e, false)}
        onPointerCancel={(e) => endPull(e, true)}
        onClickCapture={(e) => {
          if (!pulled.current) return;
          pulled.current = false;
          e.preventDefault();
          e.stopPropagation();
        }}
        style={
          pulledBy > 0
            ? { transform: `translateY(${pulledBy}px)`, transition: "none" }
            : undefined
        }
        // The `!` marks out-shout the stock data-[side=bottom] variants (class +
        // attribute selectors), which otherwise beat these breakpoint overrides
        // and leave the panel pinned to the bottom-left while the centering
        // translate still applies. On the phone the sheet takes vertical
        // drags for its pull (`touch-pan-x`) and keeps pinch zoom.
        className="gap-0 rounded-t-[16px] border-0! bg-nevo-cream px-6 pt-3 pb-7 text-nevo-near-black shadow-[0_-8px_32px_rgba(0,0,0,0.16)] max-sm:touch-pan-x max-sm:touch-pinch-zoom sm:inset-x-auto! sm:top-1/2 sm:bottom-auto! sm:left-1/2! sm:w-[560px] sm:max-w-[calc(100%-48px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[16px] sm:px-8 sm:py-7 sm:shadow-[0_8px_32px_rgba(0,0,0,0.16)] lg:w-[600px] lg:px-10"
      >
        {/* Drag handle — sheet form only */}
        <div className="mx-auto mb-[18px] h-1 w-8 rounded-full bg-nevo-near-black/30 sm:hidden" />

        {/* QUICK CHECK, and the break across from it (design 4e03b7f). */}
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-[11px] tracking-[0.08em] text-nevo-navy uppercase">
            Quick check
          </p>
          <button
            type="button"
            onClick={onTakeBreak}
            className="shrink-0 cursor-pointer rounded-md px-2 py-[11px] text-[13px] font-medium text-nevo-navy outline-none focus-visible:ring-2 focus-visible:ring-nevo-navy motion-safe:transition-transform motion-safe:duration-[120ms] motion-safe:active:scale-[0.98]"
          >
            Take a break
          </button>
        </div>
        {position && (
          <p className="mt-2 text-[13.5px] font-medium text-nevo-violet-text">
            Check {position.at} of {position.of}
          </p>
        )}
        {check.promptAudio && (
          <div className="mt-3">
            <SpokenPrompt src={check.promptAudio} onBusy={onAudioBusy} />
          </div>
        )}
        <SheetTitle
          className={cn(
            "mt-3 text-[19px] leading-[1.35] font-semibold tracking-[-0.01em] text-nevo-near-black sm:text-[21px]",
            reading && READING_HEADING,
          )}
        >
          {check.question}
        </SheetTitle>
        {hint}

        <div className="mt-[18px] flex flex-col gap-2.5">
          {check.options.map((option) => (
            <AnswerOption
              key={option.id}
              label={option.label}
              reading={reading}
              tone={tone(option.id)}
              trailing={
                correct && option.id === chosenId ? <AnswerCheck /> : undefined
              }
              onSelect={() => choose(option.id)}
            />
          ))}
        </div>

        {/* Result note — plain text, lands instantly (results never animate) */}
        {resolved && (
          <p
            role="status"
            className={cn(
              correct
                ? "mt-4 text-[15px] leading-[1.5] font-medium text-nevo-navy"
                : // The note after a WRONG answer. Violet at 2.34:1 made the
                  // one sentence a struggling child most needs the hardest to
                  // read; the correct note beside it is navy at 8.8:1.
                  "mt-4 text-[15px] leading-[1.5] font-medium text-nevo-violet-text",
              // Size and spacing only: the note's colour says which it is.
              reading && READING_BODY,
            )}
          >
            {correct ? check.correctNote : RECOVERY_LINE}
          </p>
        )}

        {/* The way on, and only after a right answer. */}
        {correct && (
          <Button className="mt-5 w-full" onClick={onContinue}>
            {!position
              ? "Continue"
              : position.at < position.of
                ? "Next check"
                : "Finish"}
          </Button>
        )}
      </SheetContent>
    </Sheet>
  );
}
