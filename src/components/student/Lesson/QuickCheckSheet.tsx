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
import type { ReteachingResponse } from "@/lib/api/lessons";
import type { WayIn } from "@/lib/lessons/waysIn";
import { onVerdict, type Verdict, type VerdictReply } from "@/lib/lessons/verdict";
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

/** The re-teach box's words, the 17f frame's (design 1397ec4). */
export const RETEACH_COPY = {
  title: "Let's work through it together",
  check: "Check",
  done: "That's it",
  keepGoing: "Keep going",
  again: "Let's try it a different way",
  waysLine:
    "Here are some other ways to look at it. Take any of them, as many times as you like.",
  shortBreak: "Take a short break",
} as const;

/** 17f's names for the ways in it draws, beside a second miss. */
export const RETEACH_WAY_LABEL: Partial<Record<WayIn, string>> = {
  picture: "As a picture",
  audio: "Listen to it",
  simpler: "Simpler",
};

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
 * carrying its own authored answer "gates normally", and a generated,
 * unreviewed key never gates. Since 30 Oct (Olayinka's go) the player holds
 * only a check the server marks `teacherReviewed`, or its own gate where it is
 * on (`shownHolds`); any other is asked here as before, and Next then takes
 * the child past it. This sheet is the same either way.
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
  reteaching = null,
  ways = [],
  onTakeWay,
}: {
  check: QuickCheck;
  /**
   * The server's re-teaching for THIS check, from its reply to a miss
   * (`ReteachingResponse`) - what the re-teach box draws. Absent, a miss is
   * held and gives way, as it always did.
   */
  reteaching?: ReteachingResponse | null;
  /**
   * The ways in the server offers for this section that it can serve here
   * (`waysInFor`), for the box after a second miss. Only 17f's are drawn.
   */
  ways?: readonly WayIn[];
  /** One of those ways, taken from the box: the sheet closes for it. */
  onTakeWay?: (way: WayIn) => void;
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
   *
   * GIVES BACK THE MARK, which this sheet moves on (test 9): the server's,
   * from the attempt's reply, online; the package's offline. Never one made
   * here. While it is on its way the pick is held, quietly - see `Verdict`.
   */
  onAnswered: (answered: {
    selectedId: string;
    responseTimeMs?: number;
  }) => VerdictReply;
  /**
   * The way on after a correct answer: "Continue", or with several checks
   * "Next check" and, on the last, "Finish". The player decides where it goes.
   */
  onContinue: () => void;
  /** "Take a break" - the child's own break, from inside the check. */
  onTakeBreak: () => void;
}) {
  const [chosenId, setChosenId] = useState<string | null>(null);
  /**
   * THE MARK ON THE PICK IN PLACE, as the answer's reply gave it (test 9):
   * undefined while it is on its way. The sheet never marks a pick itself.
   */
  const [verdict, setVerdict] = useState<Verdict | undefined>(undefined);
  /** Which ask a mark answers, so one for a pick since let go lands nowhere. */
  const ask = useRef(0);
  const resolved = chosenId !== null && verdict !== undefined;
  const correct = resolved && verdict === true;
  /** Marked wrong: the only mark that holds the child. */
  const missed = resolved && verdict === false;
  /**
   * The way on: a right answer, or one the server could not mark - which is
   * never wrong, says nothing, and holds no one ("NULL MEANS UNMARKABLE").
   */
  const through = resolved && verdict !== false;

  /*
   * THE RE-TEACH BOX (17f, design 1397ec4; Lydia, 4 Nov, her 19: "the box
   * shows the guided steps only and the explanation is held back until after
   * the retry"). A miss on a check the server re-teaches opens it here, in
   * the sheet, over the same question:
   *  - R1/R2: "Let's work through it together" and the server's steps
   *    (`screens`), numbered. The same check is answered again: the earlier
   *    pick held calm (no red, no cross, no verdict), and "Check" quiet until
   *    a new pick, the primary once there is one.
   *  - R3, the retry right: "That's it", then the check's own explanation as
   *    the server sends it, then "Keep going" - never before, never on a
   *    second miss.
   *  - R4, the retry missed: "Let's try it a different way", and the ways in
   *    the server offers that 17f names. Still no answer, no explanation.
   * WHAT IT SAYS IS ALL THE SERVER'S. Which steps, which ways: its reply's.
   * Nothing here chooses by the check's level, or by anything else (rule 3).
   * Without a re-teaching for this check, a miss is held and gives way, as
   * before.
   */
  const [box, setBox] = useState<{
    held: string;
    pick: string | null;
    after: "asking" | "right" | "again";
    /** The retry's mark is on its way: the pick held, nothing said. */
    marking?: boolean;
  } | null>(null);
  const reteachHere = reteaching?.questionId === check.id ? reteaching : null;
  /** The server's steps, less any that is only the question again. */
  const steps = (reteachHere?.screens ?? []).filter(
    (s) => s.trim() !== "" && s.trim() !== check.question.trim(),
  );
  const boxWays = ways.flatMap((w) => {
    const label = RETEACH_WAY_LABEL[w];
    return label ? [{ way: w, label }] : [];
  });

  // When the question was last put in front of the child: on opening, and
  // again once a miss has given way.
  const askedAt = useRef<number | null>(null);
  useEffect(() => {
    if (open && chosenId === null) askedAt.current = performance.now();
  }, [open, chosenId]);

  const choose = (id: string) => {
    // One pick per ask: a second tap while the first is marked is no answer.
    if (chosenId !== null) return;
    setChosenId(id);
    const responseTimeMs = msSince(askedAt.current);
    const mine = ++ask.current;
    onVerdict(
      onAnswered({
        selectedId: id,
        ...(responseTimeMs === null ? {} : { responseTimeMs }),
      }),
      (mark) => {
        if (ask.current === mine) setVerdict(mark);
      },
    );
  };

  /** Tapped out: the check is asked afresh next time, unless it was passed. */
  const tapOut = () => {
    if (!through) {
      // A mark still on its way answers a pick that is no longer there.
      ask.current += 1;
      setChosenId(null);
      setVerdict(undefined);
      setBox(null);
    }
    onTapOut();
  };

  // A miss the server re-teaches opens the box, in place of giving way -
  // taken as the reply lands, during render, so no frame shows it giving way.
  if (!box && missed && reteachHere && chosenId !== null) {
    setBox({ held: chosenId, pick: null, after: "asking" });
  }
  // The retry is timed from the box opening (rule 4).
  const boxOpen = box !== null;
  useEffect(() => {
    if (boxOpen) askedAt.current = performance.now();
  }, [boxOpen]);

  /**
   * The retry, answered with "Check": sent as any answer is, and moved on by
   * its mark. While that is on its way the pick and Check stay as they are.
   * One the server could not mark leaves the box for the sheet's way on, as
   * a first answer it could not mark does.
   */
  const checkRetry = () => {
    if (!box || box.after !== "asking" || box.pick === null || box.marking)
      return;
    const pick = box.pick;
    const responseTimeMs = msSince(askedAt.current);
    const mine = ++ask.current;
    setBox({ ...box, marking: true });
    onVerdict(
      onAnswered({
        selectedId: pick,
        ...(responseTimeMs === null ? {} : { responseTimeMs }),
      }),
      (mark) => {
        if (ask.current !== mine) return;
        if (mark === null) {
          setBox(null);
          setChosenId(pick);
          setVerdict(null);
          return;
        }
        setBox((b) =>
          b ? { ...b, marking: false, after: mark ? "right" : "again" } : b,
        );
      },
    );
  };

  // A miss is held - not marked - and then gives way, unless the box opens.
  const recovering = missed && !box;
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
    // Held from the tap: while its mark is on its way, as after.
    if (chosenId === null) return "idle";
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

        {box ? (
          <ReteachBox
            box={box}
            steps={steps}
            explanation={check.explanation}
            ways={boxWays}
            options={check.options}
            reading={reading}
            onPick={(id) => {
              if (!box.marking) setBox({ ...box, pick: id });
            }}
            onCheck={checkRetry}
            onKeepGoing={onContinue}
            onTakeWay={(way) => onTakeWay?.(way)}
            onTakeBreak={onTakeBreak}
          />
        ) : (
          <>
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

        {/* Result note — plain text, lands instantly (results never animate).
            None for an answer the server could not mark: nothing is true to
            say about it. */}
        {(correct || missed) && (
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

        {/* The way on, and only after a right answer - or one the server
            could not mark, which holds no one. */}
        {through && (
          <Button className="mt-5 w-full" onClick={onContinue}>
            {!position
              ? "Continue"
              : position.at < position.of
                ? "Next check"
                : "Finish"}
          </Button>
        )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/**
 * The re-teach box itself (17f): the frame's cream card, then the options and
 * the action under it. See `box` above for what each state shows and why.
 */
function ReteachBox({
  box,
  steps,
  explanation,
  ways,
  options,
  reading,
  onPick,
  onCheck,
  onKeepGoing,
  onTakeWay,
  onTakeBreak,
}: {
  box: {
    held: string;
    pick: string | null;
    after: "asking" | "right" | "again";
    marking?: boolean;
  };
  steps: string[];
  explanation?: string;
  ways: { way: WayIn; label: string }[];
  options: QuickCheck["options"];
  reading: boolean;
  onPick: (id: string) => void;
  onCheck: () => void;
  onKeepGoing: () => void;
  onTakeWay: (way: WayIn) => void;
  onTakeBreak: () => void;
}) {
  const asking = box.after === "asking";
  const right = box.after === "right";
  const title = right
    ? RETEACH_COPY.done
    : asking
      ? RETEACH_COPY.title
      : RETEACH_COPY.again;
  const body = cn("text-[14px] leading-[1.5] text-nevo-near-black/82", reading && READING_BODY);
  return (
    <div data-reteach-box={box.after}>
      <div role="status" className="mt-[18px] rounded-[12px] bg-nevo-cream-elevated p-[18px]">
        <div className="flex items-center gap-[9px]">
          {right ? (
            <span
              aria-hidden
              className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-nevo-navy text-nevo-cream motion-safe:animate-in motion-safe:zoom-in-50"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </span>
          ) : (
            <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" className="shrink-0 fill-nevo-navy">
              <path d="M12 2l1.6 4.8L18 8.4l-4.4 1.6L12 15l-1.6-5L6 8.4l4.4-1.6z" />
              <circle cx="18.5" cy="17.5" r="2.2" />
            </svg>
          )}
          <p className="text-[15.5px] font-semibold text-nevo-near-black">{title}</p>
        </div>
        {asking && steps.length > 0 && (
          <ol className="mt-3.5 flex flex-col gap-3">
            {steps.map((text, i) => (
              <li key={i} className="flex items-start gap-[11px]">
                <span
                  aria-hidden
                  className="mt-px flex size-[22px] shrink-0 items-center justify-center rounded-full bg-nevo-violet/30 text-[12px] font-semibold text-nevo-navy"
                >
                  {i + 1}
                </span>
                <span className={body}>{text}</span>
              </li>
            ))}
          </ol>
        )}
        {right && explanation && (
          <p className={cn("mt-3 text-[14px] leading-[1.55] text-nevo-near-black/78 text-pretty", reading && READING_BODY)}>
            {explanation}
          </p>
        )}
        {box.after === "again" && ways.length > 0 && (
          <>
            <p className="mt-2.5 text-[13.5px] leading-[1.5] text-nevo-near-black/66">
              {RETEACH_COPY.waysLine}
            </p>
            <div className="mt-[13px] flex flex-wrap gap-2">
              {ways.map(({ way, label }) => (
                <button
                  key={way}
                  type="button"
                  onClick={() => onTakeWay(way)}
                  className="inline-flex h-10 cursor-pointer items-center rounded-full border-[1.5px] border-nevo-navy/30 bg-nevo-cream px-[15px] text-[13.5px] font-semibold text-nevo-navy"
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {asking && (
        <>
          <div className="mt-3.5 flex flex-col gap-2.5">
            {options.map((option) => {
              const picked = box.pick === option.id;
              const held = box.pick === null && box.held === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={picked}
                  onClick={() => onPick(option.id)}
                  className={cn(
                    "flex h-[50px] w-full cursor-pointer items-center rounded-[10px] px-4 text-left text-[15px]",
                    picked
                      ? "bg-nevo-navy font-semibold text-nevo-cream"
                      : held
                        ? "border-[1.5px] border-nevo-navy/40 bg-nevo-cream-elevated font-medium text-nevo-near-black"
                        : "border-[1.5px] border-nevo-near-black/16 bg-nevo-cream font-medium text-nevo-near-black/80",
                    reading && READING_BODY,
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={onCheck}
            aria-disabled={box.pick === null || box.marking === true}
            className={cn(
              "mt-3.5 flex h-[52px] w-full cursor-pointer items-center justify-center rounded-[10px] text-[15.5px] font-semibold",
              box.pick === null
                ? "bg-nevo-navy/12 text-nevo-navy"
                : "bg-nevo-navy text-nevo-cream",
            )}
          >
            {RETEACH_COPY.check}
          </button>
        </>
      )}
      {right && (
        <Button className="mt-3.5 w-full" onClick={onKeepGoing}>
          {RETEACH_COPY.keepGoing}
        </Button>
      )}
      {box.after === "again" && (
        <button
          type="button"
          onClick={onTakeBreak}
          className="mt-3.5 w-full cursor-pointer text-center text-[13.5px] font-semibold text-nevo-navy"
        >
          {RETEACH_COPY.shortBreak}
        </button>
      )}
    </div>
  );
}
