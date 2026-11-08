"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Delete, Pause, Play } from "lucide-react";
import { Button, NevoKeyboard } from "@/components/shared";
import {
  SCAFFOLD_FILLED,
  SCAFFOLD_LEVELS,
  type ScaffoldLevel,
} from "@/lib/constants";
import type {
  CalcHighlight,
  CalcMiniStep,
  CalcNarration,
  CalcNumberStep,
  CalcScaffold,
  CalcToken,
  CalculationSegment,
  CalculationStep,
  ScaffoldQuantity,
} from "@/lib/types";
import { isStoredAnswer } from "@/lib/lessons/storedAnswer";
import {
  onVerdict,
  retryOf,
  type Verdict,
  type VerdictReply,
} from "@/lib/lessons/verdict";
import { HoldRetry, useLongHold } from "./HoldRetry";
import { cn } from "@/lib/utils";
import { NO_SOUND, PressedLine } from "./PressedLine";
import { READING_BODY, READING_HEADING, READING_INK } from "./readingSupport";
import { revealIn, scrollerOf, type Stretch } from "./revealStep";
import { useMediaSource, type MediaFailReason } from "./useMediaSource";

/** One committed step, as the answer the server marks takes it. */
export interface StepGiven {
  stepId: string;
  answer: string | number;
  responseTimeMs?: number;
  hinted: boolean;
}

/** Whole milliseconds since a monotonic reading, or undefined without one. */
function msSince(start: number | null): number | undefined {
  return start === null
    ? undefined
    : Math.max(0, Math.round(performance.now() - start));
}

/**
 * SLOWER'S NEXT PIECE COMES WHEN THE CHILD TAPS, never on a timer (Lydia, 2
 * Nov). The control is the one chunked reading already uses for its
 * tap-to-continue parts (`TextSegment`), in its words - 37c UDL
 * Accommodations: "each tap-to-continue", "Tap to continue" (Hub, 4 Nov:
 * reuse the player's tap-to-continue control, no new words).
 */
export const SLOWER_NEXT = "Tap to continue";

/** More support's card, as the solver frame labels it. */
export const MORE_SUPPORT_LABEL = "LET'S LOOK AT THIS PART TOGETHER";

/** Fewer steps' label over each mini-step, as the solver frame draws it. */
export const FEWER_LABEL = "ONE PIECE AT A TIME";

/** The card's lines after a miss, Lydia's, verbatim (4 Nov). */
export const CALC_SUPPORT_LINES = {
  standard: "Here it is as a picture.",
  strong: "Here it is as a picture, with a hint on the question.",
  /**
   * Only the hint is new - the picture was already on screen (Lydia, 7 Nov,
   * copy pass). Neither line above is true then.
   */
  hintOnly: "Here's a hint for this step.",
} as const;

/** The frame's own Slower line (`presentSlower`), above the question. */
export const SLOWER_LINE = "No rush. Let's take this one a step at a time.";

/**
 * Calculation Solver (17b, co-construction), rendered from the engine's
 * payload (SCRUM-181, on SCRUM-177).
 *
 * The system holds the notation and the drawing on screen throughout; the
 * child supplies one step at a time; the solution assembles as they go. Never
 * a generic "enter the answer" component (17b §2), and never the full worked
 * example: only the step in front of the child is shown.
 *
 * THE FRONT END COMPUTES NOTHING. The previous solver worked the maths out
 * itself - it summed the bars, wrote the result row and drew the fraction from
 * numbers it had added - which is why it only ever handled two like
 * fractions. Now:
 *   - the drawing is the payload's `scaffold`, drawn with the values given,
 *     and what each answered step does to it is that step's `highlights`;
 *   - the equation is the payload's own `assembles` and `equationState`, and
 *     its `fullEquation` once every step is done;
 *   - a step is right when the child's entry is one of the answers the
 *     pipeline stored for it (`isStoredAnswer`), and never otherwise;
 *   - each step takes the input it names: a choice, a number, or a tap.
 *
 * NOT COUNTED HERE: misses. The hint used to surface itself after two missed
 * picks or one missed number, which is a threshold this screen has no
 * business setting (rule 3). The engine offers a hint after misses (B18), and
 * the player hands it here to show (`engineHint`). What stays is the child's
 * own "Need a hint?", which opens this step's hint because they asked.
 *
 * HOW MUCH SUPPORT IS THE ENGINE'S LEVEL, the one the support dots show
 * (B116): "strong shows scaffold, prompt and available hint; standard shows
 * scaffold and prompt; light shows prompt and equation without the
 * scaffold; none shows the authored problem with no added support". See
 * `supportAt`.
 *
 * No evaluative colour ever - never red or green, never a cross. A miss is a
 * soft violet ring pulse and nothing else. No score, percentage or counter.
 *
 * READING SUPPORT'S TYPOGRAPHY REACHES EVERY WORD A CHILD READS HERE (D30):
 * the prompt, the options, the confirmation and completion lines, the hint,
 * the scaffold's labels and the unit. The notation takes the heading's
 * spacing only - "notation is never simplified away, because the notation is
 * the content". The drawing's geometry, the field a child types into and the
 * controls are left as they are, as they are on the checks.
 *
 * THE CHILD'S OWN ROW: SLOWER, MORE SUPPORT AND FEWER STEPS (the frame's gate
 * controls; Lydia, 29 Oct: "A gap on the backend should not cost a child a
 * control on their screen"; "While anything is absent from a screen, the
 * engine must not offer it as a route there"). Each only where there is
 * something behind it.
 *  - SLOWER is the lesson's pace, the same switch the text's Slower chip is,
 *    held for the sitting on the server. Here it lets the step arrive in
 *    pieces: the question, then the step's approved `parts` one at a time
 *    where it has them (8c4ccef), then the answer. Each next piece when the
 *    child taps "Tap to continue", never on a timer (Lydia, 2 Nov;
 *    `SLOWER_NEXT`). The frame's line goes above the question ONLY on a step
 *    with pieces behind it - see `SLOWER_LINE`.
 *  - MORE SUPPORT is the idea behind the step, in a teacher's words: the
 *    step's `explanation` (`conceptExplanation`, 8c67353), in the frame's
 *    "Let's look at this part together" card above the question - concept
 *    help, never the hint (Lydia, via the Hub, 4 Nov). Only on a step that
 *    has one: on any other there is no More support at all, since there is
 *    nothing to show (rule 5; Teslim: "absence is the normal state"). Held
 *    for the sitting on the server, as Slower is (`lessonPreferences`), so a
 *    child who turned it on finds it on every step that has one.
 *  - FEWER STEPS is the step's own mini-steps, one at a time, then the step
 *    whole - only on a step that has them (`miniSteps`; see `fewer`).
 *
 * THE ENGINE'S SUPPORT AFTER A MISS (`engineSupport`): the server's only
 * calculation route since 6b5d496 is "support inside the current answerable
 * step" (`requiresChoice: false`), at `scaffoldLevel` standard or strong. That
 * step goes to the level as sent, and a card says what changed (Lydia, 2 Nov:
 * "Yes, a card appears. The screen changing under a child with no
 * explanation makes them think they did something wrong"; her lines, 4 Nov).
 */
export function CalculationSolver({
  calculation,
  reading = false,
  onSolved,
  onStepCommitted,
  onStepAnswered,
  onStepGiven,
  onPiecePlaced,
  onHintOpened,
  onHintShown,
  onHintUsed,
  onAct,
  onReplay,
  onNarrationPlayed,
  onAudioBusy,
  onNarrationFailed,
  padDock,
  engineHint,
  onEngineHintClosed,
  onSystemScroll,
  level = null,
  slower = false,
  onSlower,
  moreSupport = false,
  onMoreSupport,
  engineSupport = null,
}: {
  calculation: CalculationSegment;
  /** The lesson's pace is Slower: the child's own, held for the sitting. */
  slower?: boolean;
  /** The child pressed Slower. Absent, the row has no Slower. */
  onSlower?: () => void;
  /** More support is on for the sitting: the child's own, held on the server. */
  moreSupport?: boolean;
  /** The child pressed More support. Absent, the row has no More support. */
  onMoreSupport?: () => void;
  /**
   * The server's support in one step after a miss (`calculation_scaffold`):
   * the step, by its `stepId`, and the level it names - standard draws the
   * picture, strong the picture and the step's hint. Never lower than
   * `level`; any other step is as `level`.
   */
  engineSupport?: { stepId: string; level: "standard" | "strong" } | null;
  /**
   * The support level the dots show (B116) - the engine config's
   * `initialScaffoldLevel` until something more specific is said. Null is
   * no level, and the calculation is drawn as the payload carries it.
   */
  level?: ScaffoldLevel | null;
  /**
   * The engine's unrequested hint (`offer_hint`), shown where 17a draws one -
   * "Step 2 · hint auto-shown": the pill above the response. It sat under the
   * whole solver before, below the pad and off the screen.
   */
  engineHint?: string;
  /** The child closed it (D29: "the child can close it"). */
  onEngineHintClosed?: () => void;
  /**
   * Where the host docks the number pad (D150): the foot of its screen,
   * below everything that scrolls. `null` while that place is not yet laid
   * out. Left out, the pad sits under the step - a solver hosted on its own.
   */
  padDock?: HTMLElement | null;
  /**
   * The reading accommodation's typographic half (D30), from the same plan
   * the text segment and the checks read - see `readingSupport`.
   */
  reading?: boolean;
  /**
   * Fired once the solution assembles - the player opens the forward chevron
   * - with how long the whole calculation took from its first step being put
   * to the child, by `performance.now()` (rule 4). Absent if nothing timed it.
   */
  onSolved: (solved: { responseTimeMs?: number }) => void;
  /**
   * Each committed step, the moment it is committed
   * (`calculation_step_response`) - before its mark, so the signal carries
   * when the child answered, not when the server did.
   */
  onStepCommitted?: (stepId: string) => void;
  /**
   * Each committed step's MARK, once it is known (test 9): the server's,
   * from the answer's reply, online; the package's offline. It feeds the
   * lesson's error streak and is never sent as a key of its own. `null` is a
   * step the server could not mark, which is never wrong.
   */
  onStepAnswered?: (stepId: string, mark: Verdict) => void;
  /**
   * What the child gave on each committed step - every try, wrong ones too -
   * for the answer the server marks (`calculationAttemptFor`): the option
   * picked, the text as typed, or a build's count where the step stores its
   * answer as one. `responseTimeMs` runs from the step being put to the
   * child (again after a miss) to the commit; `hinted` is a hint having been
   * on screen for the step. Not fired for a build the server cannot mark.
   *
   * GIVES BACK THE MARK the step moves on (test 9): the server's, online.
   * `packageMark` is this screen's match against the stored answers, for the
   * host to fall back on only where no reply comes - offline. Nothing given
   * back leaves it to `packageMark` too.
   */
  onStepGiven?: (
    given: StepGiven,
    packageMark: boolean,
  ) => VerdictReply | undefined;
  /** A piece tapped into the manipulative (`manipulative_piece_placed`). */
  onPiecePlaced?: (stepId: string) => void;
  /** The child opened this step's hint themselves. */
  onHintOpened?: (stepId: string) => void;
  /**
   * A hint the child did not ask for came on screen (B131): the step's own,
   * shown by a strong level, or the engine's. Only as it is actually drawn -
   * never while a confirmation stands in the step's place, or after the solve.
   */
  onHintShown?: (from: "step" | "engine", stepId: string) => void;
  /**
   * The child submitted the step with that hint still on screen (B130) -
   * once a step, and not for a hint they opened, which was used as they
   * opened it.
   */
  onHintUsed?: (from: "step" | "engine", stepId: string) => void;
  /**
   * The child did something in the step: a key, an option, a piece, or the
   * hint. The host's held-Next line (D211) has done its job by then.
   */
  onAct?: () => void;
  /** A finished narration played again from the start (`replay`). */
  onReplay?: () => void;
  /** Narration started for the first time on this calculation. */
  onNarrationPlayed?: () => void;
  /** `system_busy` while narration plays - the child is listening, not idle. */
  onAudioBusy?: (phase: "start" | "end") => void;
  /** A step's narration would not load (`media_load_failed`). */
  onNarrationFailed?: (reason: MediaFailReason) => void;
  /**
   * The solver moved the column itself, to bring the step into view - so the
   * host does not read that move as the child scrolling. See `revealStep`.
   */
  onSystemScroll?: () => void;
}) {
  const { steps } = calculation;
  const lastIndex = steps.length - 1;

  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"ask" | "confirmed" | "done">("ask");
  const [hintOpen, setHintOpen] = useState(false);
  /** The child closed the hint a strong level showed them, on this step. */
  const [levelHintClosed, setLevelHintClosed] = useState(false);
  // Choice steps: selecting is not answering (SCRUM-94.3). The child picks,
  // can change their mind, then commits - a changed selection before commit
  // is itself a hesitation signal worth having.
  const [chosen, setChosen] = useState<number | null>(null);
  const [typed, setTyped] = useState("");
  const [placed, setPlaced] = useState(0);
  /** A place-value build's pieces, column by column. */
  const [placedCols, setPlacedCols] = useState<number[]>([]);
  /**
   * Re-keys the ring pulse so it plays again on the next miss. It decides
   * nothing: no hint, no emphasis and no copy reads it.
   */
  const [nudge, setNudge] = useState(0);
  /**
   * A COMMITTED ANSWER WHOSE MARK IS ON ITS WAY (test 9). The child's answer
   * stays as it is - no new words, no spinner (rule 7) - and nothing more is
   * taken until the mark lands: no second commit, no new pick, no new key.
   */
  const [marking, setMarking] = useState(false);
  /** Which commit a mark answers, so one for a step since left lands nowhere. */
  const markAsk = useRef(0);
  /**
   * The reply on its way, and the holds started: held long enough to look
   * broken, the step offers "Try again" and nothing else (SCRUM-315).
   */
  const [pending, setPending] = useState<VerdictReply | null>(null);
  const [hold, setHold] = useState(0);
  const longHold = useLongHold(marking ? hold : null);
  const retry = marking ? retryOf(pending) : null;
  /**
   * Once the child has started the narration, each new step is read as it
   * arrives (17b §5, "re-reads whenever the step advances"). Never before:
   * sound nobody asked for is not this layer's to start.
   */
  const [listening, setListening] = useState(false);
  const narrationStarted = useRef(false);

  const step = steps[index];
  const done = phase === "done";
  /** A line of the child's reading that is not coloured to mean anything. */
  const readable = reading && [READING_BODY, READING_INK];
  const asking = phase === "ask";
  /*
   * Backend, 9 Oct: "Highlights apply while the step is being asked. Once
   * accepted, render assembles and move to the next step's highlights." So
   * a confirmed step has been accepted, and it is the next step's highlights
   * that show beside its confirmation - 17b's ring on "s1-correct".
   */
  const accepted = asking ? index - 1 : index;
  const line = lineAt(calculation, index, phase);
  const emphasis = emphasisAt(
    steps,
    accepted + 1,
    accepted,
    calculation.byId === true,
  );
  const manipulative = calculation.manipulative;
  /*
   * THE SERVER'S SUPPORT IN THIS STEP, AFTER A MISS, AND THE CARD THAT SAYS SO
   * (Lydia, 2 Nov: "It says what changed rather than offering a choice, in
   * the ways-in card's shape"; her lines, 4 Nov). The step it names goes to
   * its level - never below the dots' - and the card says what appeared:
   *  - the picture: "Here it is as a picture."
   *  - the picture and the step's hint: "Here it is as a picture, with a hint
   *    on the question."
   * "Plain, no praise, no judgment, and they say only what changed": so only
   * what newly appears is said. A picture this calculation has none of, or
   * one already on screen, is no change and gets no card; a hint with no
   * words, or one already showing, is not said either.
   */
  const engineLevel =
    engineSupport?.stepId === step.stepId
      ? engineSupport.level === "strong"
        ? SCAFFOLD_LEVELS.FULL
        : SCAFFOLD_LEVELS.MODERATE
      : null;
  const supportLevel =
    engineLevel &&
    (level === null || SCAFFOLD_FILLED[engineLevel] > SCAFFOLD_FILLED[level])
      ? engineLevel
      : level;
  const support = supportAt(supportLevel);
  const before = supportAt(level);
  const pictureAppeared =
    Boolean(calculation.scaffold) && support.scaffold && !before.scaffold;
  const hintAppeared =
    support.hint && !before.hint && step.hint.trim() !== "";
  const engineCard = pictureAppeared
    ? hintAppeared
      ? CALC_SUPPORT_LINES.strong
      : CALC_SUPPORT_LINES.standard
    : hintAppeared
      ? CALC_SUPPORT_LINES.hintOnly
      : null;

  /*
   * SLOWER'S PIECES, EACH WHEN THE CHILD TAPS. A step with approved `parts` is
   * the step's own words split for slower pacing (8c4ccef: "each part is
   * text, not a scored question"), so under Slower it is shown AS its parts -
   * the first at once, each next one on "Tap to continue", then the answer
   * (Lydia: "When he can send the parts, Slower uses those instead"; 2 Nov:
   * "the step in pieces, each revealed when the child taps", never timed). A
   * step without them is the question, then the answer on a tap. `shown`
   * counts what has arrived after the first piece. Without Slower everything
   * is there at once, the question whole, as it always was.
   *
   * A STEP IS PACED ONLY IF SLOWER WAS ON AS IT OPENED. Pressed halfway
   * through, it paces the next step, and never takes away an answer area the
   * child is already working in; pressed off, everything is there at once.
   * Taken as the step changes, during render, so no frame shows the old step's
   * count against the new one.
   */
  const parts = step.parts ?? [];
  const pieces = Math.max(parts.length, 1);
  const [arrived, setArrived] = useState(() => ({
    stepId: step.stepId,
    paced: slower,
    shown: 0,
  }));
  if (arrived.stepId !== step.stepId) {
    setArrived({ stepId: step.stepId, paced: slower, shown: 0 });
  }
  const pacing = arrived.paced && slower && phase === "ask";
  const shown = pacing ? Math.min(arrived.shown, pieces) : pieces;
  /** The answer area is there: Slower's last piece, or at once without it. */
  const answerShown = shown >= pieces;
  /*
   * THE ANSWER AREA TAKES THE FOCUS WHEN A TAP BRINGS IT: "Tap to continue"
   * goes as it arrives, and a keyboard would otherwise be left on nothing.
   * Its first control, as a child pressing on would reach it next.
   */
  const answerArea = useRef<HTMLDivElement>(null);
  const tappedIn = useRef(false);
  useEffect(() => {
    // Set only by the tap that brings the answer area, so it is here now.
    if (!tappedIn.current) return;
    tappedIn.current = false;
    answerArea.current
      ?.querySelector<HTMLElement>("button:not([disabled]), input, textarea")
      ?.focus();
  }, [answerShown]);
  const nextPiece = () => {
    if (shown + 1 >= pieces) tappedIn.current = true;
    setArrived((a) => ({ ...a, shown: a.shown + 1 }));
    onAct?.();
  };
  /** More support has something to show here: the step's explanation. */
  const moreSupportHere = Boolean(onMoreSupport && step.explanation);

  /*
   * FEWER STEPS: THE STEP'S MINI-STEPS, ONE AT A TIME, THEN THE STEP WHOLE
   * (8c67353; the Hub, 4 Nov, the reduced build). Offered only on a step a
   * teacher broke into answerable mini-steps (`miniSteps`); on any other there
   * is no Fewer steps at all. Pressed, the step's question gives way to its
   * first mini-step under the frame's "ONE PIECE AT A TIME"; each answered
   * right brings the next, and after the last the step itself is asked again,
   * whole. Each answer goes up as its own (`onStepGiven`, under the
   * mini-step's `questionId`) for the server to mark. The frame moves on to
   * the next step after the mini-steps instead - but the server needs the
   * step answered (a mini-step never moves the lesson on, and a later pass
   * counts as supported), so the step comes back. Lydia is asked whether she
   * wants the frame's skip (item 46). For this step only, as the frame's
   * controls are: the server holds no such choice.
   */
  const miniSteps = step.miniSteps ?? [];
  const [fewer, setFewer] = useState<{ stepId: string; at: number } | null>(
    null,
  );
  const fewerHere =
    asking && miniSteps.length > 0 && fewer?.stepId === step.stepId;
  const mini: CalcMiniStep | null = fewerHere
    ? miniSteps[Math.min(fewer.at, miniSteps.length - 1)]
    : null;
  /** When the mini-step on screen was put to the child (rule 4). */
  const miniAskedAt = useRef<number | null>(null);
  /** Fewer steps is there while a step with mini-steps is being asked. */
  const fewerOffered = asking && miniSteps.length > 0;
  const miniId = mini?.questionId ?? null;
  useEffect(() => {
    if (miniId) miniAskedAt.current = performance.now();
  }, [miniId]);
  /** Under Slower, the step as its parts, as many as have arrived. */
  const partsShown =
    pacing && parts.length > 0 ? parts.slice(0, shown + 1) : null;
  /*
   * THE ENGINE'S HINT IS OFTEN THIS STEP'S OWN. Since the gate (23 Oct) it
   * resends the step's authored hint on each miss from the second, and a
   * strong level already shows that hint, so the same words were drawn twice,
   * one pill above the other. Drawn once, as the engine's.
   */
  const engineSaysStepHint =
    Boolean(engineHint) && engineHint?.trim() === step.hint.trim();
  /** A strong level's hint: this step's own, shown without being asked for. */
  const levelHint =
    support.hint && !levelHintClosed && step.hint !== "" && !engineSaysStepHint;
  const pad = step.input === "number" && usesPad(step);
  /** The tap step's pieces are all placed: what "That's the total" waits on. */
  const built =
    step.input === "tap" &&
    (manipulative?.kind === "place_value"
      ? manipulative.columns.every((c, i) => (placedCols[i] ?? 0) >= c.count)
      : placed >= step.target);

  /*
   * THE STEP IN VIEW ABOVE THE DOCKED PAD (see `revealStep`). A number step
   * on the pad is brought into view as it opens, again when Check goes live
   * with the first key, when a hint arrives above the field, and whenever
   * the column changes size - the pad docking, the break offer taking its
   * row, the screen turning. The child's finger is on the docked pad, which
   * none of this moves. A choice step is never moved: the child's finger is
   * on the options, and moving them under it is what SCRUM-94 took out.
   *
   * A tap step is brought into view once, as it opens, and never again (see
   * `TAP_OPEN`): from then on the child's finger is on the tray, in the
   * column, and anything that moves the column moves what is under it.
   */
  const response = useRef<HTMLDivElement | null>(null);
  const systemScrolled = useRef(onSystemScroll);
  useEffect(() => {
    systemScrolled.current = onSystemScroll;
  }, [onSystemScroll]);
  // Once the answer area has arrived: under Slower it comes last.
  const padStep = asking && pad && answerShown;
  const live = typed.trim().length > 0;
  useEffect(() => {
    const block = response.current;
    if (!padStep || !block) return;
    const show = () => {
      if (revealIn(block, live ? CHECK_LIVE : STEP_OPEN))
        systemScrolled.current?.();
    };
    const scroller = scrollerOf(block);
    if (!scroller || typeof ResizeObserver === "undefined") {
      show();
      return;
    }
    // Observing calls `show` once, after layout, and again on each resize.
    const watch = new ResizeObserver(show);
    watch.observe(scroller);
    return () => watch.disconnect();
  }, [padStep, step.stepId, live, engineHint, hintOpen, levelHint]);
  /*
   * A BUILD IS BROUGHT INTO VIEW AS IT OPENS, WITH THE PLACE ITS "THAT'S THE
   * TOTAL" WILL TAKE (Lydia, 17 Oct). It was brought into view as that
   * button arrived, at the last tap: the column moved up by the button's
   * height and its gap, which put the button exactly where the tray had
   * been, under the finger that had just tapped it. Its place is held from
   * the step's start instead, so nothing moves when the build is done; on a
   * column too short for the tray and that place together, the place stays
   * below the fold and the child scrolls to it themselves.
   */
  const tapStep = asking && step.input === "tap" && answerShown;
  useEffect(() => {
    const block = response.current;
    if (!tapStep || !block) return;
    const show = () => {
      if (revealIn(block, TAP_OPEN)) systemScrolled.current?.();
    };
    const scroller = scrollerOf(block);
    if (!scroller || typeof ResizeObserver === "undefined") {
      show();
      return;
    }
    // Once, after layout - and not again on a resize while the child builds.
    const watch = new ResizeObserver(() => {
      watch.disconnect();
      show();
    });
    watch.observe(scroller);
    return () => watch.disconnect();
  }, [tapStep, step.stepId]);

  /*
   * A HINT IS OFFERED AS IT COMES ON SCREEN (B131), not as the engine's
   * answer arrives: one sent while a confirmation held the step's place was
   * reported before any pill showed. The pills are drawn only while a step is
   * asked, so that is when they are reported - once a step, by the step that
   * shows them, and the host keeps the engine's to once a hint.
   */
  const hintShown = useRef(onHintShown);
  useEffect(() => {
    hintShown.current = onHintShown;
  }, [onHintShown]);
  const reported = useRef<Set<string>>(new Set());
  const levelHintOnScreen = asking && levelHint;
  const engineHintOnScreen = asking && Boolean(engineHint);
  useEffect(() => {
    const key = `step:${step.stepId}`;
    if (!levelHintOnScreen || reported.current.has(key)) return;
    reported.current.add(key);
    hintShown.current?.("step", step.stepId);
  }, [levelHintOnScreen, step.stepId]);
  useEffect(() => {
    const key = `engine:${step.stepId}:${engineHint}`;
    if (!engineHintOnScreen || reported.current.has(key)) return;
    reported.current.add(key);
    hintShown.current?.("engine", step.stepId);
  }, [engineHintOnScreen, engineHint, step.stepId]);
  /** The step a hint was last used on: B130's "once per step". */
  const usedOn = useRef<string | null>(null);

  /*
   * WHEN THE STEP WAS PUT TO THE CHILD, and when the calculation was (rule 4:
   * `performance.now()`, never the wall clock). A step is put to them as it
   * is asked, and again after a miss - their next try is timed from there, as
   * a quick check's "Try again" is. Measured for the server, never shown.
   */
  const askedAt = useRef<number | null>(null);
  useEffect(() => {
    // Under Slower, as the answer area arrives: it cannot be answered before.
    if (asking && answerShown) askedAt.current = performance.now();
  }, [asking, index, answerShown]);
  const begunAt = useRef<number | null>(null);
  useEffect(() => {
    begunAt.current = performance.now();
  }, []);

  /** What the child gave on this step, or nothing the server could mark. */
  const given = (): string | number | undefined => {
    if (step.input === "choice") {
      return chosen === null ? undefined : step.options[chosen]?.value;
    }
    if (step.input === "number") return typed;
    return step.counted;
  };

  const advance = () => {
    if (index === lastIndex) {
      setPhase("done");
      const responseTimeMs = msSince(begunAt.current);
      onSolved(responseTimeMs === undefined ? {} : { responseTimeMs });
      return;
    }
    setIndex(index + 1);
    setPhase("ask");
    setHintOpen(false);
    setLevelHintClosed(false);
    setChosen(null);
    setTyped("");
    setPlaced(0);
    setPlacedCols([]);
    setNudge(0);
  };

  /**
   * The answer given, sent, and its mark waited for (test 9). A reply that
   * is on its way holds the step; one there already - the package's mark,
   * where no reply comes - moves it at once.
   */
  const send = (
    given: StepGiven | undefined,
    packageMark: boolean,
    settle: (mark: Verdict) => void,
  ) => {
    const sent =
      given === undefined
        ? undefined
        : (onStepGiven?.(given, packageMark) as VerdictReply | undefined);
    const reply: VerdictReply = sent === undefined ? packageMark : sent;
    const mine = ++markAsk.current;
    if (reply instanceof Promise) {
      setMarking(true);
      setPending(reply);
      setHold((h) => h + 1);
    }
    onVerdict(reply, (mark) => {
      if (markAsk.current !== mine) return;
      setMarking(false);
      settle(mark);
    });
  };

  /** A pick on a choice step or mini-step - never while a mark is on its way. */
  const pick = (i: number) => {
    if (marking) return;
    setChosen(i);
    onAct?.();
  };

  // SCRUM-94.3: every step ends on a tap the child chooses to make.
  // `packageMark` is the lesson's own key, used only where no reply comes.
  const answer = (packageMark: boolean) => {
    if (marking) return;
    /*
     * B130: "hint_used fires when the child submits a calculation step after
     * using the hint" - read in full, still on screen as they submit. A hint
     * they closed was not used; one they opened was used as they opened it.
     */
    const from = levelHint ? "step" : engineHint ? "engine" : null;
    if (from && usedOn.current !== step.stepId) {
      usedOn.current = step.stepId;
      onHintUsed?.(from, step.stepId);
    }
    const stepId = step.stepId;
    onStepCommitted?.(stepId);
    // The answer itself goes to the server, which marks it - and the step
    // moves on that mark: the tick, the nudge, the next step (test 9).
    const answered = given();
    const responseTimeMs = msSince(askedAt.current);
    send(
      answered === undefined
        ? undefined
        : {
            stepId,
            answer: answered,
            ...(responseTimeMs === undefined ? {} : { responseTimeMs }),
            hinted: usedOn.current === stepId,
          },
      packageMark,
      (mark) => {
        onStepAnswered?.(stepId, mark);
        if (mark === false) {
          // Put back to the child: the next try is its own, timed from here.
          askedAt.current = performance.now();
          setNudge((n) => n + 1);
          return;
        }
        // A confirmation waits for the child's "Next step" (17b step 1). On
        // the last step there is no next step to wait for: the solution
        // assembles. A step the server could not mark is never wrong.
        if (step.input === "choice" && step.confirm && index !== lastIndex) {
          setPhase("confirmed");
          return;
        }
        advance();
      },
    );
  };

  /** Fewer steps on or off, for this step. Either way the step starts afresh. */
  const toggleFewer = () => {
    if (marking) return;
    setFewer(fewerHere ? null : { stepId: step.stepId, at: 0 });
    setChosen(null);
    setTyped("");
    // Off: the step itself is put to the child again, timed from here.
    if (fewerHere) askedAt.current = performance.now();
    onAct?.();
  };

  /*
   * A MINI-STEP ANSWERED: up as its own answer, under its `questionId`, for
   * the server to mark - this screen's tick only moves it on. Right, the next
   * mini-step, or after the last the step itself, whole and timed afresh;
   * not, the same nudge as a step, and the same mini-step again.
   */
  const answerMini = (value: string) => {
    if (!mini || !fewer || marking) return;
    const responseTimeMs = msSince(miniAskedAt.current);
    const at = fewer.at;
    const stepId = step.stepId;
    // Moved on by its mark, as a step is (test 9).
    send(
      {
        stepId: mini.questionId,
        answer: value,
        ...(responseTimeMs === undefined ? {} : { responseTimeMs }),
        hinted: usedOn.current === stepId,
      },
      isStoredAnswer(value, mini.accepted),
      (mark) => {
        setChosen(null);
        setTyped("");
        if (mark === false) {
          miniAskedAt.current = performance.now();
          setNudge((n) => n + 1);
          return;
        }
        if (at + 1 >= miniSteps.length) {
          setFewer(null);
          askedAt.current = performance.now();
          return;
        }
        setFewer({ stepId, at: at + 1 });
      },
    );
  };

  const openHint = () => {
    setHintOpen(true);
    // Opened is used (the catalogue's "opened one they had to open").
    usedOn.current = step.stepId;
    onHintOpened?.(step.stepId);
    onAct?.();
  };

  /** What is typed, from the pad, a laptop's keys or delete. */
  const type = (next: string | ((was: string) => string)) => {
    if (marking) return;
    setTyped(next);
    onAct?.();
  };

  const place = () => {
    if (step.input !== "tap" || placed >= step.target) return;
    setPlaced(placed + 1);
    onPiecePlaced?.(step.stepId);
    onAct?.();
  };

  /** A piece into one place-value column, until it holds that column's count. */
  const placeIn = (column: number) => {
    if (step.input !== "tap" || manipulative?.kind !== "place_value") return;
    const have = placedCols[column] ?? 0;
    if (have >= (manipulative.columns[column]?.count ?? 0)) return;
    const next = [...placedCols];
    next[column] = have + 1;
    setPlacedCols(next);
    onPiecePlaced?.(step.stepId);
    onAct?.();
  };

  const startedNarration = () => {
    setListening(true);
    if (narrationStarted.current) return;
    narrationStarted.current = true;
    onNarrationPlayed?.();
  };

  return (
    // Frame: the calc column is narrower than the reading column (560/600 vs
    // the player's 620/680).
    <div className="mx-auto sm:max-w-[560px] lg:max-w-[600px]">
      {/*
        THE CHILD'S OWN ROW, as the frame's gate controls draw it: pills under
        the title, navy while on, gone once the solve is done. Slower; More
        support where the step has an explanation; Fewer steps where it has
        mini-steps - see the note at the top.
      */}
      {!done && (onSlower || moreSupportHere || fewerOffered) && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {onSlower && (
            <RowControl on={slower} onPress={onSlower}>
              Slower
            </RowControl>
          )}
          {moreSupportHere && (
            <RowControl
              on={moreSupport}
              onPress={() => {
                onMoreSupport?.();
                onAct?.();
              }}
            >
              More support
            </RowControl>
          )}
          {fewerOffered && (
            <RowControl on={fewerHere} onPress={toggleFewer}>
              Fewer steps
            </RowControl>
          )}
        </div>
      )}

      {/* What the server's support changed, while its step is asked. */}
      {asking && engineCard && (
        <div className="mb-[22px] rounded-[12px] bg-nevo-cream-elevated px-[18px] py-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
          <p
            role="status"
            className={cn(
              "text-base font-semibold tracking-[-0.01em] text-nevo-near-black sm:text-[18px]",
              reading && READING_BODY,
            )}
          >
            {engineCard}
          </p>
        </div>
      )}

      {/*
        THE BAR'S PLACE IS KEPT ONCE THE SOLVE IS DONE. There is no step left
        to read, so the recording goes - but taking its row with it lifted the
        drawing and the equation 80px at the very moment they assemble, and
        17b §13 holds that "the scaffold and equation never move".
      */}
      {step.narration &&
        (done ? (
          <div aria-hidden data-narration-place className="mb-4 h-16" />
        ) : (
          <StepNarration
            // One clip per step: a new step is a new recording, from the top.
            key={step.stepId}
            clip={step.narration}
            autoPlay={listening}
            onStarted={startedNarration}
            onReplay={onReplay}
            onBusy={onAudioBusy}
            onFailed={onNarrationFailed}
          />
        ))}

      {/* SCAFFOLD - persistent; the payload's drawing, with its values,
          where the level draws one (B116) */}
      {calculation.scaffold && support.scaffold && (
        <ScaffoldCard
          scaffold={calculation.scaffold}
          emphasis={emphasis}
          reading={reading}
        />
      )}

      {/*
        NOTATION - alongside the drawing, never replaced by it, and updated in
        place as the solution assembles. Announced, because the equation and
        each prompt must be (17b §11).
      */}
      <div
        aria-live="polite"
        className="mt-[18px] flex min-h-[52px] items-center justify-center sm:min-h-[60px]"
      >
        {line.key && (
          <div
            key={line.key}
            className={cn(
              // 17a's `eq`: 30, and 40 from the tablet up.
              "text-center text-[30px] font-medium tracking-[-0.01em] text-nevo-navy sm:text-[40px] motion-safe:animate-nevo-reveal",
              reading && READING_HEADING,
            )}
          >
            {line.tokens ? (
              <TokenNotation
                tokens={line.tokens}
                accepted={line.accepted}
                emphasis={emphasis}
              />
            ) : (
              <Notation line={line.key} emphasis={emphasis} />
            )}
          </div>
        )}
      </div>

      {/* RESPONSE - the one thing the child does, per step */}
      <div ref={response} className="mt-5">
        {phase === "confirmed" && step.input === "choice" && (
          <div className="flex flex-col gap-3.5 motion-safe:animate-nevo-reveal">
            <div className="flex items-center justify-between rounded-[12px] border-2 border-nevo-navy bg-nevo-cream-elevated px-[18px] py-4 text-base font-semibold text-nevo-near-black shadow-elevation-1 sm:text-[18px]">
              <span className={cn(readable)}>
                {chosen != null ? step.options[chosen]?.label : null}
              </span>
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-nevo-navy">
                <Check
                  className="size-[13px] text-nevo-cream"
                  strokeWidth={2.8}
                />
              </span>
            </div>
            <p
              className={cn(
                "text-center text-sm leading-[1.6] text-nevo-near-black/70 sm:text-[15px]",
                readable,
              )}
            >
              {step.confirm}
            </p>
            <Button className="w-full" onClick={advance}>
              Next step
            </Button>
          </div>
        )}

        {done && calculation.completion && (
          <p
            className={cn(
              "text-center text-sm leading-[1.6] text-nevo-near-black/70 motion-safe:animate-nevo-reveal sm:text-[15px]",
              readable,
            )}
          >
            {calculation.completion}
          </p>
        )}

        {asking && (
          <>
            {/*
              MORE SUPPORT'S CARD, above the question (`presentSupport`): the
              frame's label and the step's explanation, held inside this very
              step, never a new screen.
            */}
            {moreSupport && moreSupportHere && (
              <div className="mb-4 rounded-[12px] bg-nevo-violet/14 px-4 py-3.5">
                <p className="font-mono text-[10px] tracking-[0.06em] text-nevo-navy">
                  {MORE_SUPPORT_LABEL}
                </p>
                <p
                  className={cn(
                    "mt-2 text-sm leading-[1.55] text-nevo-near-black sm:text-[15px]",
                    readable,
                  )}
                >
                  {step.explanation}
                </p>
              </div>
            )}
            {/*
              The frame's Slower line, above the question (`presentSlower`),
              ONLY ON A STEP WITH PIECES BEHIND IT (Lydia, 7 Nov, copy pass,
              urgent): "That line is a claim about something that is not going
              to happen... in front of children." A step whose pieces are
              waiting for a teacher reaches a child with none - the server
              keeps them back - and so does a step that has none, so on either
              Slower still paces it (the question, then the answer on a tap)
              but says nothing it cannot keep.
            */}
            {slower && !mini && parts.length > 0 && (
              <p
                className={cn(
                  "mb-4 text-center text-sm text-nevo-violet-text sm:text-[15px]",
                  readable,
                )}
              >
                {SLOWER_LINE}
              </p>
            )}
            {mini ? (
              <div data-reveal="prompt" data-mini-step={mini.id}>
                <p className="text-center font-mono text-[10px] tracking-[0.06em] text-nevo-navy">
                  {FEWER_LABEL}
                </p>
                <p
                  className={cn(
                    "mt-2.5 text-center text-[19px] font-semibold leading-[1.35] text-nevo-near-black sm:text-[22px]",
                    reading && READING_HEADING,
                  )}
                >
                  {mini.prompt}
                </p>
              </div>
            ) : partsShown ? (
              <div
                data-reveal="prompt"
                aria-live="polite"
                className="flex flex-col gap-2"
              >
                {partsShown.map((part, i) => (
                  <p
                    key={i}
                    data-part={i}
                    className={cn(
                      "text-center text-[19px] font-semibold leading-[1.35] text-nevo-near-black sm:text-[22px]",
                      i > 0 && "motion-safe:animate-nevo-reveal",
                      reading && READING_HEADING,
                    )}
                  >
                    {part}
                  </p>
                ))}
              </div>
            ) : (
              <p
                data-reveal="prompt"
                className={cn(
                  "text-center text-[19px] font-semibold leading-[1.35] text-nevo-near-black sm:text-[22px]",
                  reading && READING_HEADING,
                )}
              >
                {step.prompt}
              </p>
            )}
            {/*
              THE HINT'S SLOT, UNDER THE QUESTION AND HELD FROM THE START
              (design 5bb9ee2, 28 Oct, S5: "hint + Check each hold their own
              reserved slot; opening the hint swaps link<->pill in place, so
              nothing below moves under the child"). "Need a hint?" sat at
              the foot of the step until then, under Check.
            */}
            <div
              data-reveal="slot"
              className="mt-4 flex min-h-16 flex-col items-center justify-center gap-2"
            >
              {engineHint && (
                <HintPill
                  text={engineHint}
                  reading={reading}
                  onClose={
                    onEngineHintClosed &&
                    (() => {
                      // Closed, the same words do not come back as the level's.
                      if (engineSaysStepHint) setLevelHintClosed(true);
                      onEngineHintClosed();
                    })
                  }
                />
              )}
              {hintOpen && step.hint && !engineSaysStepHint && (
                <HintPill text={step.hint} reading={reading} />
              )}
              {/*
                A STRONG LEVEL'S HINT CARRIES CLOSE, as the engine's does: it
                is support the child did not ask for, and "support a child
                cannot dismiss becomes an obstruction" (D29). Closed, their
                own "Need a hint?" is back.
              */}
              {!hintOpen && levelHint && (
                <HintPill
                  text={step.hint}
                  reading={reading}
                  onClose={() => setLevelHintClosed(true)}
                />
              )}
              {/* 17a: no "Need a hint?" while a hint is showing. */}
              {!hintOpen && !levelHint && !engineHint && step.hint && (
                <HintLink onClick={openHint} />
              )}
            </div>

            {/*
              SLOWER'S NEXT PIECE, ON THE CHILD'S TAP: chunked reading's own
              control, in its place and its words (`SLOWER_NEXT`), where the
              answer area will be.
            */}
            {!mini && !answerShown && (
              <button
                type="button"
                onClick={nextPiece}
                className="mt-5 flex h-11 w-full cursor-pointer items-center justify-center rounded-[10px] bg-nevo-navy/8 px-5 text-[14px] font-medium text-nevo-navy transition-colors hover:bg-nevo-navy/12 active:scale-[0.99]"
              >
                {SLOWER_NEXT}
              </button>
            )}

            {/*
              THE ANSWER AREA, which under Slower comes last, on the tap after
              the step's last piece - and with it the docked pad. Faded in
              where it arrives late; there at once, as always, without Slower.
            */}
            {mini ? (
              <MiniStepAnswer
                // Each mini-step's answer opens anew.
                key={mini.id}
                mini={mini}
                reading={reading}
                readable={readable}
                nudge={nudge}
                chosen={chosen}
                onChoose={pick}
                typed={typed}
                onType={type}
                padDock={padDock}
                onCheck={answerMini}
              />
            ) : answerShown && (
            <div
              ref={answerArea}
              className={cn(pacing && "motion-safe:animate-nevo-reveal")}
            >
            {step.input === "choice" && (
              <>
                <Nudged nudge={nudge} className="mt-4 flex flex-col gap-2.5">
                  {step.options.map((option, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => pick(i)}
                      aria-pressed={chosen === i}
                      className={cn(
                        "cursor-pointer rounded-[12px] border-2 bg-nevo-cream-elevated px-[18px] py-4 text-center text-base font-medium text-nevo-near-black shadow-elevation-1 transition-[transform,border-color] active:scale-[0.98] sm:text-[18px]",
                        // Frame: selection = 2px border plus a further 2px ring.
                        chosen === i
                          ? "border-nevo-navy ring-2 ring-nevo-navy"
                          : "border-transparent",
                        readable,
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </Nudged>
                {/* Check's own slot, held under the options (S5). */}
                <div className="mt-[18px] min-h-13">
                  {chosen != null && (
                    <Button
                      className="w-full"
                      onClick={() =>
                        answer(
                          isStoredAnswer(
                            step.options[chosen]?.value ?? "",
                            step.accepted,
                          ),
                        )
                      }
                    >
                      Check my answer
                    </Button>
                  )}
                </div>
              </>
            )}

            {step.input === "number" && (
              <NumberEntry
                // A new step's form opens anew.
                key={step.stepId}
                step={step}
                reading={reading}
                nudge={nudge}
                value={typed}
                onChange={type}
                onCommit={() => answer(isStoredAnswer(typed, step.accepted))}
              />
            )}

            {step.input === "tap" && (
              <>
                {(manipulative?.kind === "array" ||
                  manipulative?.kind === "counters") && (
                  <ArrayBuild
                    round={manipulative.kind === "counters"}
                    rows={manipulative.rows}
                    parts={manipulative.parts}
                    target={step.target}
                    placed={placed}
                    onPlace={place}
                    ringed={piecesRinged(manipulative, emphasis)}
                  />
                )}
                {manipulative?.kind === "number_line" && (
                  <LineBuild
                    parts={manipulative.parts}
                    start={manipulative.start}
                    target={step.target}
                    placed={placed}
                    onPlace={place}
                    ringed={piecesRinged(manipulative, emphasis)}
                  />
                )}
                {manipulative?.kind === "place_value" && (
                  <PlaceValueBuild
                    columns={manipulative.columns}
                    placed={placedCols}
                    onPlace={placeIn}
                    reading={reading}
                  />
                )}
                {manipulative?.kind === "fraction_bar" && (
                  <BuildTray
                    parts={manipulative.parts}
                    target={step.target}
                    placed={placed}
                    onPlace={place}
                    ringed={piecesRinged(manipulative, emphasis)}
                  />
                )}
                {/*
                  BELOW THE TRAY, IN A PLACE HELD FROM THE START, A BEAT
                  LATER (Lydia, 17 Oct; D162). The tray keeps its row once
                  the build is done, so this never takes the place of the
                  piece just tapped. Until then it is its own place, unseen,
                  inert and out of the accessibility tree - the same button,
                  so the place is exactly its size - and the step opened with
                  it in view where the column has room (`TAP_OPEN`), so
                  nothing moves when it arrives. It arrives about 450ms on,
                  unseen and untappable until then, so the child sees what
                  they built before they can confirm it; with reduced motion
                  it is there at once.
                */}
                <Button
                  data-reveal="total"
                  aria-hidden={built ? undefined : true}
                  inert={!built}
                  tabIndex={built ? undefined : -1}
                  className={cn(
                    "mt-[18px] w-full",
                    built ? "nevo-arrive-late" : "invisible",
                  )}
                  onClick={built ? () => answer(true) : undefined}
                >
                  That&apos;s the total
                </Button>
              </>
            )}

            {/* D150: the Nevo pad, docked at the foot of the screen, with
                the keys the step names (B108). */}
            {step.input === "number" && pad && (
              <DockedPad
                dock={padDock}
                keys={step.keys}
                onKey={(c) => type((t) => t + c)}
              />
            )}
            </div>
            )}
            {/* A mark long on its way: "Try again", and nothing else. */}
            {longHold && retry && (
              <HoldRetry
                onRetry={() => {
                  retry();
                  setHold((h) => h + 1);
                }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * What of a number step to show above the pad, most first: the first of
 * these that fits is brought into view (`revealIn`). The question, the hint's
 * slot under it, the field and Check's held place (all of the form); then
 * without Check's place; then the hint's slot and the field; then the field
 * alone. Once Check is live it is in every one.
 */
const STEP_OPEN: Stretch[] = [
  ["prompt", "form"],
  ["prompt", "field"],
  ["slot", "field"],
  ["field", "field"],
];
const CHECK_LIVE: Stretch[] = [
  ["prompt", "form"],
  ["slot", "form"],
  ["field", "form"],
  ["check", "check"],
];
/**
 * What of a tap step to show as it opens, most first: the question, the
 * hint's slot, the build, the tray and the place "That's the total" will
 * take; then without the question and its slot; then the tray and that
 * place alone. None fitting, nothing moves. Nothing waits below the held
 * place any more: the hint's slot is under the question (S5, 28 Oct).
 */
const TAP_OPEN: Stretch[] = [
  ["prompt", "total"],
  ["build", "total"],
  ["tray", "total"],
];

/**
 * THE PAD IS DOCKED, AS D150 DRAWS IT: the tray last in the screen's column,
 * on the bottom edge, with what scrolls above it - edge to edge on a phone,
 * 460 and 420 wide with rounded top corners from the tablet up.
 *
 * It sat under the step, inline, before. On a phone it opened mostly below
 * the fold, and the field takes no device keyboard (`inputMode="none"`), so
 * the pad is the only way to type; and anything above it that grew - the
 * "Check my answer" that arrives with the first key - pushed it down under
 * the child's finger. Docked, nothing the step does can move it.
 */
function DockedPad({
  dock,
  keys,
  onKey,
}: {
  dock: HTMLElement | null | undefined;
  keys?: string[];
  onKey: (c: string) => void;
}) {
  if (dock === undefined)
    return <NevoKeyboard layout="calc" keys={keys} onKey={onKey} className="mt-6" />;
  return (
    dock &&
    createPortal(<NevoKeyboard layout="calc" keys={keys} onKey={onKey} />, dock)
  );
}

/**
 * A MINI-STEP'S ANSWER, drawn as a step's own is: a choice is the step's
 * option cards and "Check my answer" once one is picked; a number is the
 * step's field on the Nevo pad, docked as a step's is (`DockedPad`).
 */
function MiniStepAnswer({
  mini,
  reading,
  readable,
  nudge,
  chosen,
  onChoose,
  typed,
  onType,
  padDock,
  onCheck,
}: {
  mini: CalcMiniStep;
  reading: boolean;
  readable: false | string[];
  nudge: number;
  chosen: number | null;
  onChoose: (i: number) => void;
  typed: string;
  onType: (next: string | ((was: string) => string)) => void;
  padDock?: HTMLElement | null;
  onCheck: (value: string) => void;
}) {
  if (mini.input === "choice") {
    return (
      <>
        <Nudged nudge={nudge} className="mt-4 flex flex-col gap-2.5">
          {mini.options.map((option, i) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onChoose(i)}
              aria-pressed={chosen === i}
              className={cn(
                "cursor-pointer rounded-[12px] border-2 bg-nevo-cream-elevated px-[18px] py-4 text-center text-base font-medium text-nevo-near-black shadow-elevation-1 transition-[transform,border-color] active:scale-[0.98] sm:text-[18px]",
                chosen === i
                  ? "border-nevo-navy ring-2 ring-nevo-navy"
                  : "border-transparent",
                readable,
              )}
            >
              {option.label}
            </button>
          ))}
        </Nudged>
        <div className="mt-[18px] min-h-13">
          {chosen != null && (
            <Button
              className="w-full"
              onClick={() => onCheck(mini.options[chosen]?.value ?? "")}
            >
              Check my answer
            </Button>
          )}
        </div>
      </>
    );
  }
  // A number: the step's own field, with nothing a mini-step does not carry.
  const asStep: CalcNumberStep = {
    stepId: mini.id,
    prompt: mini.prompt,
    hint: "",
    assembles: "",
    equationState: "",
    highlights: [],
    input: "number",
    entry: "numeric",
    accepted: mini.accepted,
  };
  return (
    <>
      <NumberEntry
        step={asStep}
        reading={reading}
        nudge={nudge}
        value={typed}
        onChange={onType}
        onCommit={() => onCheck(typed)}
      />
      <DockedPad dock={padDock} onKey={(c) => onType((t) => t + c)} />
    </>
  );
}

/**
 * Does a typed step take the Nevo pad? A number does, and so does any step
 * that names its keys (B108) - an expression's "x" or "+" added to the pad.
 * An expression stored before `requiredCharacters` names none, and keeps the
 * device's keyboard: see `NumberEntry`.
 */
const usesPad = (step: CalcNumberStep) =>
  step.entry === "numeric" || step.keys !== undefined;

/**
 * What the support level draws (B116), as the spec defines each:
 *  - strong (the dots' full): the scaffold, the prompt, and the step's hint
 *    shown without being asked for;
 *  - standard (moderate): the scaffold and the prompt;
 *  - light: "prompt and equation without the scaffold";
 *  - none: "the authored problem with no added support" - no scaffold and
 *    no hint shown. The scaffolds engine's `independent` (minimal), the
 *    least support it names, is drawn the same.
 * The child's own "Need a hint?" is theirs at every level (17a). No level is
 * no adaptation: the calculation as the payload carries it.
 */
function supportAt(level: ScaffoldLevel | null): {
  scaffold: boolean;
  hint: boolean;
} {
  const bare =
    level === SCAFFOLD_LEVELS.LIGHT ||
    level === SCAFFOLD_LEVELS.MINIMAL ||
    level === SCAFFOLD_LEVELS.NONE;
  return { scaffold: !bare, hint: level === SCAFFOLD_LEVELS.FULL };
}

/**
 * The equation line on screen, and the string that keys its reveal.
 *
 * A STEP WHOSE TOKENS CARRY ITS LINE DRAWS IT FROM THEM (B109): while it is
 * asked, with the tokens it keeps back drawn as the place its answer goes;
 * once accepted, whole - "once accepted, render assembles", the same line
 * with nothing held back. Any other step draws the flat string, as it did
 * before tokens (`equationAt`). Once every step is done it is `fullEquation`
 * where there is one.
 *
 * TOKENS THAT ARE ONLY THE STEP'S OWN ANSWER CARRY NO LINE. Backend sends
 * every step exactly one token: its answer, hidden until accepted. Drawn as
 * the line, that put a lone "?" where the problem's notation was for the
 * whole step, and then the bare answer where its `assembles` should be. So
 * tokens draw the line only where at least one of them is shown while the
 * step is asked; the answer stays back either way (B127), since the flat
 * line before acceptance is the problem or an earlier step's `assembles`.
 */
function lineAt(
  calculation: CalculationSegment,
  index: number,
  phase: "ask" | "confirmed" | "done",
): { key: string; tokens?: CalcToken[]; accepted: boolean } {
  const { steps } = calculation;
  const done = phase === "done";
  if (done && calculation.fullEquation) {
    return { key: calculation.fullEquation, accepted: true };
  }
  const accepted = phase !== "ask";
  const tokens = steps[index]?.tokens;
  if (tokens?.some((t) => !t.hidden)) {
    const key = tokens
      .map((t) => (!accepted && t.hidden ? `[${t.id}]` : t.text))
      .join(" ");
    return { key, tokens, accepted };
  }
  return {
    key: equationAt(calculation, accepted ? index : index - 1, done),
    accepted,
  };
}

/**
 * The solution as it stands: the problem's notation, then the `assembles` of
 * each step accepted so far - backend, 9 Oct: "Once accepted, render
 * assembles". `equationState` stands in only for a step whose `assembles` is
 * empty (B110: "use assembles; fall back to equationState for older
 * lessons"). `accepted` is the last step accepted, -1 before any.
 *
 * Once every step is done it is `fullEquation`, "the complete solved equation
 * revealed after all construction steps finish" (B101) - 17b's equation
 * assembling to its answer - and it is read at no other point.
 */
function equationAt(
  calculation: CalculationSegment,
  accepted: number,
  done: boolean,
): string {
  if (done && calculation.fullEquation) return calculation.fullEquation;
  let line = calculation.expression;
  for (let i = 0; i <= accepted; i++) {
    const step = calculation.steps[i];
    line = step.assembles || step.equationState || line;
  }
  return line;
}

/** What the screen shows of the highlights, by target. See `emphasisAt`. */
interface Emphasis {
  /** 17b's violet ring: the asked step's `active` targets. */
  ring: ReadonlySet<string>;
  /** 17b's navy: the asked step's `source` targets. */
  navy: ReadonlySet<string>;
  /** The asked step's `result` targets: where its answer goes. */
  result: ReadonlySet<string>;
  /** A `result` target an accepted step named: shown, as the result. */
  revealed: ReadonlySet<string>;
  /** A `result` target no accepted step has named yet: not drawn. */
  withheld: ReadonlySet<string>;
  /** Whether targets name ids (B109) - see `keysOf`. */
  byId: boolean;
}

/**
 * 17b's per-step choreography - denominators ringed, numerators to navy, the
 * result - as each step's `highlights` name it (B107), with nothing inferred.
 *
 * A STEP'S HIGHLIGHTS APPLY WHILE IT IS ASKED (backend, 9 Oct), and on its
 * acceptance the next step's take over. `asked` is that step - one past the
 * end once the last is done, when none apply.
 *
 * A TARGET IS "AN OPAQUE RENDERER TARGET ... MATCH IT ONLY TO AN ID CARRIED BY
 * THE SAME CALCULATION; AN UNKNOWN TARGET IS IGNORED RATHER THAN GUESSED".
 * The ids are the equation tokens', the marks', the labels' and the build
 * pieces' (B109), and a target is matched to them and nothing else - see
 * `keysOf`. A target that matches nothing changes nothing.
 *
 * A RESULT IS NEVER SHOWN EARLY (B127). A mark, a label or a token a
 * `result` highlight names is the answer, so it is kept back until a step
 * that names it is accepted, and stays once it has been - the same rule as
 * `fullEquation`. What is kept back is what the payload's `result`
 * highlights and `resultTargetId` say, never what this screen takes to be
 * the answer.
 */
function emphasisAt(
  steps: CalculationStep[],
  asked: number,
  accepted: number,
  byId: boolean,
): Emphasis {
  const named = (
    step: CalculationStep | undefined,
    role: CalcHighlight["role"],
  ) =>
    (step?.highlights ?? [])
      .filter((h) => h.role === role)
      .map((h) => h.target);
  const revealed = new Set(
    steps.slice(0, accepted + 1).flatMap((s) => named(s, "result")),
  );
  return {
    ring: new Set(named(steps[asked], "active")),
    navy: new Set(named(steps[asked], "source")),
    result: new Set(named(steps[asked], "result")),
    revealed,
    withheld: new Set(
      steps.flatMap((s) => named(s, "result")).filter((t) => !revealed.has(t)),
    ),
    byId,
  };
}

/**
 * The targets that name one thing on screen: its ids (B109) - or, ONLY ON A
 * LESSON STORED BEFORE THE IDS (`CalculationSegment.byId` unset), the words
 * that name it: a token of the equation as written, a mark's or a part's
 * label, a piece's label. That text match is the fallback for older lessons
 * and nothing else; a lesson with ids is never matched by its words, which
 * "0" or "3" could name by accident.
 */
const keysOf = (
  emphasis: Emphasis,
  ids: (string | undefined)[],
  words: (string | undefined)[],
): string[] =>
  (emphasis.byId ? ids : words).filter((k): k is string => Boolean(k));

/** What names a mark: its own id and its label's, or its label's words. */
const markKeys = (emphasis: Emphasis, q: ScaffoldQuantity | undefined) =>
  q ? keysOf(emphasis, [q.id, q.labelId], [q.label]) : [];

/** What names a part of a scaffold with no marks: its label's id, or words. */
const partKeys = (
  emphasis: Emphasis,
  labels: string[],
  ids: string[] | undefined,
  part: number,
) => keysOf(emphasis, [ids?.[part]], [labels[part]]);

/** Does the emphasis set name any of these keys? */
const names = (set: ReadonlySet<string>, keys: readonly string[]) =>
  keys.some((k) => set.has(k));

/** Is this quantity drawn yet - not a result still kept back? */
const drawnNow = (emphasis: Emphasis) => (q: ScaffoldQuantity) =>
  !names(emphasis.withheld, markKeys(emphasis, q));

/** The pieces of a build an `active` highlight names, by id or label. */
const piecesRinged = (
  build: { pieceLabels: string[]; pieceIds?: string[] },
  emphasis: Emphasis,
) => {
  const count = Math.max(build.pieceLabels.length, build.pieceIds?.length ?? 0);
  return new Set(
    Array.from({ length: count }).flatMap((_, i) =>
      names(
        emphasis.ring,
        keysOf(emphasis, [build.pieceIds?.[i]], [build.pieceLabels[i]]),
      )
        ? [i]
        : [],
    ),
  );
};

/**
 * The drawing of a named token: the ring (the solver frame's `eqTokenStyle`,
 * 3px out), the weight, the result's box.
 */
const tokenClass = (ring: boolean, bold: boolean, box: boolean) =>
  cn(
    ring && "rounded-md outline-2 outline-offset-3 outline-nevo-violet",
    bold && "font-bold",
    box &&
      "inline-block rounded-[10px] border-2 border-dashed border-nevo-navy/40 px-2",
  );

/**
 * The equation, token by token as written - split at its spaces, nothing
 * parsed - so a highlight can name one. A ring is the drawing's violet ring,
 * `source` the weight the frame gives the assembled answer, and `result` the
 * frame's dashed box around the "?" still to find. The text is unchanged,
 * but for its minus signs: see `minusSigns`.
 *
 * THE ANSWER, ONCE ACCEPTED, IS SET AT 700 (D204: "700 weight covers ... the
 * calculation answer"). Which token is the answer is the payload's to say: a
 * `result` an accepted step named (B127), and nothing this screen picks out.
 *
 * The flat string of a lesson stored before equation tokens: its words are
 * matched only there (see `keysOf`). So `fullEquation` on a lesson with ids,
 * a flat string carrying none, has no token a result can name, and its
 * answer keeps the line's weight.
 */
function Notation({ line, emphasis }: { line: string; emphasis: Emphasis }) {
  return (
    <>
      {line.split(/(\s+)/).map((token, i) => {
        // Named by the token as written; only its drawing changes.
        const keys = keysOf(emphasis, [], [token]);
        const ring = names(emphasis.ring, keys);
        const bold =
          names(emphasis.navy, keys) || names(emphasis.revealed, keys);
        const box = names(emphasis.result, keys);
        const shown = minusSigns(token);
        // A token nothing names stays plain text.
        if (!ring && !bold && !box) return shown;
        return (
          <span key={i} className={tokenClass(ring, bold, box)}>
            {shown}
          </span>
        );
      })}
    </>
  );
}

/**
 * The equation from its tokens (B109), each named by its id - "highlights
 * ring the equation tokens as well as the bars" (design, 13 Oct).
 *
 * A TOKEN KEPT BACK IS NEVER DRAWN (B127): while its step is asked, a token
 * the payload hides until acceptance is the frame's dashed box with its "?",
 * the place the answer goes - and so is any token a later step's `result`
 * still holds back. Its text is not on the page until the step is accepted.
 * Then, named by an accepted step's `result`, it is the answer, at 700.
 */
function TokenNotation({
  tokens,
  accepted,
  emphasis,
}: {
  tokens: CalcToken[];
  accepted: boolean;
  emphasis: Emphasis;
}) {
  return (
    <>
      {tokens.map((t, i) => {
        const keys = [t.id];
        const ring = names(emphasis.ring, keys);
        const held =
          (!accepted && t.hidden) || names(emphasis.withheld, keys);
        const bold =
          names(emphasis.navy, keys) ||
          (!held && names(emphasis.revealed, keys));
        const box = held || names(emphasis.result, keys);
        return (
          <span key={i}>
            {i > 0 && " "}
            <span
              data-token={t.id}
              className={cn(
                tokenClass(ring, bold, box),
                held && "text-nevo-navy/55",
              )}
            >
              {held ? "?" : minusSigns(t.text)}
            </span>
          </span>
        );
      })}
    </>
  );
}

/**
 * THE EQUATION'S MINUS SIGNS, DRAWN AS THE FIELD AND THE PAD DRAW THEM. The
 * payload writes a minus as a hyphen ("2 - 5 = -3"), so the equation showed a
 * hyphen beside a field and a key showing "−". Display only: the token is
 * still what a highlight names, and nothing here is read as a number.
 *
 * Only a hyphen that is a minus sign changes. One between two letters is a
 * word's hyphen and stays; any other - on its own, before a number, after
 * one - is the sign.
 */
const isLetter = (c: string | undefined) => c != null && /\p{L}/u.test(c);
const minusSigns = (token: string) =>
  token.replace(/-/g, (hyphen, at: number) =>
    isLetter(token[at - 1]) && isLetter(token[at + 1]) ? hyphen : MINUS,
  );

/**
 * The "not that one" ring pulse (SCRUM-94: the displacing shake is retired),
 * drawn on a layer of its own so that replaying it never remounts what the
 * child is touching - a remounted field loses focus and its keyboard.
 */
function Nudged({
  nudge,
  className,
  children,
}: {
  nudge: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("relative rounded-[12px]", className)}>
      {children}
      {nudge > 0 && (
        <span
          key={nudge}
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[12px] motion-safe:animate-nevo-nudge"
        />
      )}
    </div>
  );
}

/**
 * A typed step.
 *
 * A NUMBER TAKES THE NEVO PAD (D150), with its minus sign and point - "the
 * device's own keyboard cannot be relied on". The device's numeric keyboard
 * stood in here before; an iPhone's has no minus key, so a child doing
 * subtraction on one was simply stuck. The field suppresses the device's
 * keyboard (`inputMode="none"`), the solver docks the pad at the foot of the
 * screen, and a laptop's own keys still type straight into the field. Delete
 * sits at the field, as the keypad frame draws it.
 *
 * AN EXPRESSION ("3x - 4") TAKES THE NEVO PAD TOO, EXTENDED BY THE STEP.
 * Design ruled on 9 Oct: "The Nevo pad, extended by the step ... the step
 * says which characters it needs and the pad carries those." It does now:
 * `requiredCharacters` (B108), "the exact non-digit keys the Nevo pad must
 * add", and empty means the standard pad.
 *
 * THE DEVICE'S KEYBOARD IS KEPT FOR ONE CASE ONLY: an expression stored
 * before that field, which names no keys at all. The standard pad would leave
 * a child on a phone with no way to type its "x", and reading the keys off
 * the stored answer would be this screen deciding what the child may type.
 */
function NumberEntry({
  step,
  reading,
  nudge,
  value,
  onChange,
  onCommit,
}: {
  step: CalcNumberStep;
  reading: boolean;
  nudge: number;
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
}) {
  if (usesPad(step)) {
    return (
      <PadEntry
        step={step}
        reading={reading}
        nudge={nudge}
        value={value}
        onChange={onChange}
        onCommit={onCommit}
      />
    );
  }
  return (
    <EntryForm value={value} onCommit={onCommit}>
      <Nudged nudge={nudge} className="mt-[18px] flex justify-center">
        <input
          inputMode="text"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="-"
          aria-label={step.prompt}
          // `outline-none` would hide the console's focus ring, so the field
          // draws its own.
          className="h-[52px] w-[220px] rounded-[10px] border-2 border-nevo-near-black/18 bg-nevo-cream-elevated text-center text-[22px] font-semibold text-nevo-navy shadow-elevation-1 outline-none transition-colors focus:border-nevo-navy focus-visible:ring-2 focus-visible:ring-nevo-navy focus-visible:ring-offset-2 focus-visible:ring-offset-nevo-cream"
        />
        <Unit unit={step.unit} reading={reading} />
      </Nudged>
    </EntryForm>
  );
}

/**
 * The step's form: Enter or "Check my answer" commits what is typed.
 *
 * Check arrives with the first key, under the field, IN A PLACE HELD FOR IT
 * FROM THE START (design 5bb9ee2, 28 Oct, S5: "fixed slots so the hint pill
 * and the Check button never displace each other"). Held once before, it
 * pushed "Need a hint?" out of view under it on every pad step; the hint's
 * own slot is under the question now, so nothing waits below Check.
 */
function EntryForm({
  value,
  onCommit,
  children,
}: {
  value: string;
  onCommit: () => void;
  children: React.ReactNode;
}) {
  return (
    <form
      data-reveal="form"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onCommit();
      }}
    >
      {children}
      <div className="mt-[18px] min-h-13">
        {value.trim().length > 0 && (
          <Button type="submit" data-reveal="check" className="w-full">
            Check my answer
          </Button>
        )}
      </div>
    </form>
  );
}

/**
 * Beside the field, not inside it: a child types the number, not the noun.
 */
function Unit({ unit, reading }: { unit?: string; reading: boolean }) {
  if (!unit) return null;
  return (
    <span
      className={cn(
        "ml-2.5 shrink-0 self-center text-[15px] text-nevo-near-black/60",
        reading && [READING_BODY, READING_INK],
      )}
    >
      {unit}
    </span>
  );
}

/**
 * The minus sign as the keypad frame draws it in the field. What is kept, and
 * matched against the stored answers, is the hyphen they are written with.
 */
const MINUS = "\u2212";
const drawn = (value: string) => value.replace(/-/g, MINUS);
const kept = (shown: string) => shown.replace(/\u2212/g, "-");

/**
 * The number field, as D150's keypad frame draws it: "YOUR ANSWER", the field
 * with delete at its end once something is typed, and the line under it.
 * The pad itself is docked at the foot of the screen - see `DockedPad`.
 */
function PadEntry({
  step,
  reading,
  nudge,
  value,
  onChange,
  onCommit,
}: {
  step: CalcNumberStep;
  reading: boolean;
  nudge: number;
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
}) {
  const field = useRef<HTMLInputElement | null>(null);
  /*
   * THE NEWEST DIGIT STAYS IN VIEW. A number longer than the field ran on
   * under the delete key while the field kept showing its start, so the
   * digit just typed on the pad never appeared. A caret a laptop has put
   * mid-number is left where it is.
   */
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    const editingWithin =
      document.activeElement === el && el.selectionStart !== el.value.length;
    if (!editingWithin) el.scrollLeft = el.scrollWidth;
  }, [value]);

  return (
    <EntryForm value={value} onCommit={onCommit}>
      <div className="mt-[18px] flex flex-col items-center gap-4">
        <span className="font-mono text-[11px] font-bold tracking-[0.12em] text-nevo-near-black/50 uppercase sm:text-[11.5px]">
          Your answer
        </span>
        <Nudged
          nudge={nudge}
          className="flex w-full items-center sm:max-w-[440px]"
        >
          {/* The field is `outline-none`, so its box carries the focus ring. */}
          <div
            data-reveal="field"
            className="flex min-h-[72px] min-w-0 flex-1 items-center gap-1 rounded-[10px] border-[1.5px] border-nevo-navy/40 bg-nevo-cream-elevated px-[18px] py-2.5 transition-colors focus-within:border-nevo-navy has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-nevo-navy has-[input:focus-visible]:ring-offset-2 has-[input:focus-visible]:ring-offset-nevo-cream sm:min-h-[82px] lg:min-h-[80px]"
          >
            <input
              ref={field}
              // The pad below is this field's keyboard (D150).
              inputMode="none"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={drawn(value)}
              onChange={(e) => onChange(kept(e.target.value))}
              aria-label={step.prompt}
              className="min-w-0 flex-1 bg-transparent text-[38px] leading-[1.1] font-semibold text-nevo-navy caret-nevo-navy outline-none sm:text-[48px] lg:text-[46px]"
            />
            {value.length > 0 && (
              <button
                type="button"
                aria-label="Delete"
                onClick={() => onChange(value.slice(0, -1))}
                className="flex size-11 shrink-0 cursor-pointer items-center justify-center text-nevo-near-black"
              >
                <Delete className="size-[22px] sm:size-6" strokeWidth={1.9} />
              </button>
            )}
          </div>
          <Unit unit={step.unit} reading={reading} />
        </Nudged>
        {/* D150's line is about a number. An expression has none drawn, and
            none is written for it here. */}
        {step.entry === "numeric" && (
          <p
            className={cn(
              "max-w-[360px] text-center text-[13.5px] leading-[1.5] text-pretty text-nevo-near-black/60 sm:text-[15px]",
              reading && [READING_BODY, READING_INK],
            )}
          >
            Type the number you worked out. You can use a minus sign or a point.
          </p>
        )}
      </div>
    </EntryForm>
  );
}

/** The drawing, in 17b's "Picture it" card. Decorative-with-labels (17b §11). */
function ScaffoldCard({
  scaffold,
  emphasis,
  reading,
}: {
  scaffold: CalcScaffold;
  emphasis: Emphasis;
  reading: boolean;
}) {
  const shown = drawnNow(emphasis);
  return (
    <div className="rounded-[12px] bg-nevo-cream-elevated p-[18px] shadow-elevation-1 sm:p-6">
      <span className="font-mono text-[10px] tracking-[0.06em] text-nevo-near-black/50 uppercase">
        Picture it
      </span>
      <div className="mt-3.5">
        {(scaffold.kind === "bar" ||
          scaffold.kind === "array" ||
          scaffold.kind === "dots") && (
          <CellRows scaffold={scaffold} emphasis={emphasis} reading={reading} />
        )}
        {/*
          Only 17b draws navy on a mark, so only the bars take it; every
          kind takes the ring, and keeps a result back until its step is
          accepted.
        */}
        {scaffold.kind === "place_value" && (
          <PlaceValue
            places={scaffold.places}
            shown={shown}
            emphasis={emphasis}
            reading={reading}
          />
        )}
        {scaffold.kind === "number_line" && (
          <NumberLine
            parts={scaffold.parts}
            points={scaffold.points}
            shown={shown}
            partLabels={scaffold.partLabels}
            // A part's label a `result` still holds back is not drawn (B127).
            heldPart={(at) =>
              names(
                emphasis.withheld,
                partKeys(emphasis, scaffold.partLabels, scaffold.partLabelIds, at),
              )
            }
            emphasis={emphasis}
            reading={reading}
          />
        )}
      </div>
    </div>
  );
}

type CellScaffold = Extract<CalcScaffold, { kind: "bar" | "array" | "dots" }>;

/**
 * Which mark fills each cell, bar by bar or row by row. One mark to a bar
 * where there are as many marks as bars, each from the bar's start (17b);
 * otherwise the marks one after another in reading order - along a bar's
 * one row, or through an array's rows (D149). A layout, never a total: the
 * adapter has already refused marks that do not fit.
 */
function cellsOf({
  kind,
  parts,
  rows,
  quantities,
}: CellScaffold): (number | null)[][] {
  const grid = Array.from({ length: rows }, () =>
    Array<number | null>(parts).fill(null),
  );
  if (kind === "bar" && quantities.length === rows) {
    quantities.forEach((q, row) => {
      for (let cell = 0; cell < q.count; cell++) grid[row][cell] = row;
    });
    return grid;
  }
  let at = 0;
  quantities.forEach((q, mark) => {
    for (let n = 0; n < q.count; n++, at++) {
      grid[Math.floor(at / parts)][at % parts] = mark;
    }
  });
  return grid;
}

/** 17b's ring, on a cell, a group or a column. */
const RING = "outline-2 outline-offset-2 outline-nevo-violet";

/** 17b's bar cell, at the frame's 28 / 34 / 30 per variant. */
const BAR_CELL =
  "h-7 rounded-[5px] transition-colors duration-200 sm:h-[34px] lg:h-[30px]";
const BAR_EMPTY = "border border-nevo-near-black/12 bg-nevo-near-black/[0.08]";
/** D149's square place, at its 40px where the row has room. */
const ARRAY_CELL = "aspect-square rounded-lg transition-colors duration-200";
const ARRAY_INSET = "shadow-[inset_0_-3px_0_rgba(0,0,0,0.12)]";
/** D149's round place for dots; a filled one holds a 34px dot. */
const DOT_CELL =
  "flex aspect-square items-center justify-center rounded-full transition-colors duration-200";
const DOT_EMPTY =
  "border-2 border-dashed border-nevo-navy/30 bg-nevo-near-black/[0.05]";

/**
 * A mark's fill. 17b's bars are violet, and navy where a step names them;
 * D149's array and dots are navy. Where one bar, array or set of dots
 * carries several marks, they alternate - violet and a lighter violet on a
 * bar, 37c's navy and violet otherwise - so each can be told from the next.
 * No frame draws several marks on one; this is the least that keeps them
 * apart.
 */
function fillOf(kind: CellScaffold["kind"], mark: number, several: boolean) {
  if (kind !== "bar") {
    return cn(ARRAY_INSET, mark % 2 === 1 ? "bg-nevo-violet" : "bg-nevo-navy");
  }
  return several && mark % 2 === 1 ? "bg-nevo-violet/55" : "bg-nevo-violet";
}

/**
 * 17b's fraction bars and D149's array, from the payload's `rows`, `parts`,
 * marks and labels (see `scaffoldFor`). What the asked step names changes in
 * place: a ring in violet, a bar's cells to navy, and a result - kept back
 * until it is accepted - that arrives as a bar to itself below a rule, its
 * label in navy. Nothing turns navy because the solve finished.
 *
 * A RESULT ARRIVES IN SOFT VIOLET, NOT NAVY (D164: "the moment the child is
 * right the bars return to Soft Violet"; the solver frame's `mkBar` draws
 * its result row unemphasised). It stayed navy for good once accepted, which
 * held the step's emphasis after the step was over.
 *
 * A label sits where its mark is: at the start of a bar that is its mark's
 * own (17b), under its cells where one bar carries several marks, and a
 * part's label under its part.
 */
function CellRows({
  scaffold,
  emphasis,
  reading,
}: {
  scaffold: CellScaffold;
  emphasis: Emphasis;
  reading: boolean;
}) {
  const { kind, parts, rows, quantities, partLabels, partLabelIds } = scaffold;
  const bar = kind === "bar";
  const grid = cellsOf(scaffold);
  const oneToABar = bar && quantities.length > 0 && quantities.length === rows;
  const rowLabelled = oneToABar && quantities.some((q) => q.label);
  const several = !oneToABar && quantities.length > 1;
  /** What names a mark - see `markKeys`. */
  const keysOfMark = (mark: number | null) =>
    mark == null ? [] : markKeys(emphasis, quantities[mark]);
  const hidden = (mark: number | null) =>
    names(emphasis.withheld, keysOfMark(mark));
  const part = (col: number) =>
    partKeys(emphasis, partLabels, partLabelIds, col);
  const dots = kind === "dots";
  const columns = {
    gridTemplateColumns: bar
      ? `repeat(${parts}, minmax(0, 1fr))`
      : `repeat(${parts}, minmax(0, 40px))`,
  };
  /**
   * 6px between a bar's cells (the solver frame, 13 Oct; D167), 10 between
   * squares and 8 between dots (D149).
   */
  const gap = bar ? "gap-1.5" : dots ? "justify-center gap-2" : "justify-center gap-2.5";
  const labelClass = (strong: boolean) =>
    cn(
      "text-sm transition-colors sm:text-[15px]",
      strong ? "font-semibold text-nevo-navy" : "text-nevo-near-black/60",
      // Navy is what the step names, so it keeps its ink.
      reading && READING_BODY,
      reading && !strong && READING_INK,
    );

  /** Where each mark starts, for a label under its own cells. */
  const runs = quantities.reduce<{ mark: number; start: number; span: number }[]>(
    (laid, q, mark) => {
      const before = laid[laid.length - 1];
      const start = before ? before.start + quantities[before.mark].count : 0;
      return [...laid, { mark, start, span: Math.max(q.count, 1) }];
    },
    [],
  );

  return (
    <div className={cn("flex flex-col", bar ? "gap-3" : "gap-2.5")}>
      {grid.map((cells, row) => {
        const own = oneToABar ? quantities[row] : undefined;
        /*
         * A BAR THAT IS A RESULT STILL KEPT BACK IS NOT DRAWN AT ALL. Its row
         * stood empty from the first step - a third bar under the two being
         * added, saying an answer was coming and where. 17a draws the result
         * row only once the solve is done (`sc-if done`).
         */
        if (own && hidden(row)) return null;
        const ownKeys = markKeys(emphasis, own);
        const result = names(emphasis.revealed, ownKeys);
        /*
         * A RING ON A BAR'S OWN MARK RINGS THE WHOLE BAR. 17a's `mkBar` rings
         * every cell of the bar, filled or not: what the step points at is the
         * bar - its four quarters - not the one quarter it holds. Where one
         * bar carries several marks, a ring stays on its mark's own cells.
         */
        const wholeBar = names(emphasis.ring, ownKeys);
        return (
          <div
            key={row}
            className={cn(
              "flex items-center gap-3",
              result &&
                "border-t border-nevo-near-black/10 pt-3 motion-safe:animate-nevo-reveal",
            )}
          >
            {rowLabelled && (
              <span
                className={cn(
                  "min-w-[34px] shrink-0",
                  labelClass(result || names(emphasis.navy, ownKeys)),
                )}
              >
                {own?.label}
              </span>
            )}
            <div
              aria-hidden
              data-scaffold-row
              className={cn("grid min-w-0 flex-1", gap)}
              style={columns}
            >
              {cells.map((mark, col) => {
                const keys = keysOfMark(mark);
                const filled = mark != null && !hidden(mark);
                const ring =
                  wholeBar ||
                  (filled && names(emphasis.ring, keys)) ||
                  names(emphasis.ring, part(col));
                const navy =
                  bar &&
                  filled &&
                  (names(emphasis.navy, keys) || names(emphasis.navy, part(col)));
                const fill =
                  mark == null
                    ? ""
                    : navy
                      ? "bg-nevo-navy"
                      : fillOf(kind, mark, several);
                if (dots) {
                  return (
                    <span
                      key={col}
                      className={cn(DOT_CELL, !filled && DOT_EMPTY, ring && RING)}
                    >
                      {filled && (
                        <span
                          className={cn("size-[85%] rounded-full", ARRAY_INSET, fill)}
                        />
                      )}
                    </span>
                  );
                }
                return (
                  <span
                    key={col}
                    className={cn(
                      bar ? BAR_CELL : ARRAY_CELL,
                      !filled ? (bar ? BAR_EMPTY : SQUARE_EMPTY) : fill,
                      ring && RING,
                    )}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
      {!oneToABar && quantities.some((q) => q.label) && (
        <div className={cn("grid", gap)} style={columns}>
          {runs.map(({ mark, start: at, span }) =>
            quantities[mark].label && !hidden(mark) ? (
              <span
                key={mark}
                className={cn(
                  "text-center",
                  labelClass(
                    names(emphasis.navy, keysOfMark(mark)) ||
                      names(emphasis.revealed, keysOfMark(mark)),
                  ),
                )}
                style={{ gridColumn: `${at + 1} / span ${span}` }}
              >
                {quantities[mark].label}
              </span>
            ) : null,
          )}
        </div>
      )}
      {partLabels.length > 0 && (
        <div className={cn("grid", gap)} style={columns}>
          {/* A part's label a `result` still holds back is not drawn (B127). */}
          {partLabels.map((label, col) => (
            <span
              key={col}
              className={cn(
                "text-center",
                labelClass(names(emphasis.navy, part(col))),
              )}
            >
              {names(emphasis.withheld, part(col)) ? null : label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * D149's square place, at its 40px where the column has room and narrower
 * where it does not. Filled is navy with the frame's inset; empty is the
 * frame's dashed place.
 */
const SQUARE =
  "aspect-square min-w-0 flex-[0_1_40px] rounded-lg transition-colors duration-200";
const SQUARE_FILLED = cn("bg-nevo-navy", ARRAY_INSET);
const SQUARE_EMPTY =
  "border-2 border-dashed border-nevo-navy/30 bg-nevo-near-black/[0.05]";

/** D149's three place-value pieces, largest first, in its own sizes. */
const PIECES = [
  {
    piece: "flat",
    className: "size-[58px] rounded-md shadow-[inset_0_-3px_0_rgba(0,0,0,0.14)]",
    zone: "size-[58px] rounded-md",
    tile: "size-[34px] rounded-[7px]",
    grid: "repeating-linear-gradient(0deg,rgba(247,241,230,0.22) 0 1px,transparent 1px 11.6px),repeating-linear-gradient(90deg,rgba(247,241,230,0.22) 0 1px,transparent 1px 11.6px)",
  },
  {
    piece: "rod",
    className: "h-[58px] w-3.5 rounded shadow-[inset_0_-3px_0_rgba(0,0,0,0.14)]",
    zone: "h-[58px] w-3.5 rounded",
    tile: "h-[34px] w-3 rounded-[5px]",
    grid: "repeating-linear-gradient(0deg,rgba(247,241,230,0.22) 0 1px,transparent 1px 6.8px)",
  },
  {
    piece: "unit",
    className: "size-4 rounded-[3px] shadow-[inset_0_-2px_0_rgba(0,0,0,0.14)]",
    zone: "size-4 rounded-[3px]",
    tile: "size-4 rounded",
    grid: undefined,
  },
] as const;

/** One place-value piece, placed (navy, the frame's grid) or still empty. */
function Piece({
  shape,
  placed,
}: {
  shape: (typeof PIECES)[number];
  placed: boolean;
}) {
  return placed ? (
    <span
      data-piece={shape.piece}
      className={cn("bg-nevo-navy", shape.className)}
      style={shape.grid ? { backgroundImage: shape.grid } : undefined}
    />
  ) : (
    <span
      data-zone={shape.piece}
      className={cn(
        "box-border border-2 border-dashed border-nevo-navy/30 bg-nevo-near-black/[0.05]",
        shape.zone,
      )}
    />
  );
}

/** A column's pieces: the units two to a row, as D149 stacks them. */
function PieceStack({
  shape,
  children,
  ringed = false,
}: {
  shape: (typeof PIECES)[number];
  children: React.ReactNode;
  ringed?: boolean;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "gap-1.5 rounded-md",
        shape.piece === "unit"
          ? "grid grid-cols-[repeat(2,auto)]"
          : "flex flex-wrap items-end justify-center",
        ringed && RING,
      )}
    >
      {children}
    </div>
  );
}

/** A column's name, as the payload's label gives it. */
function ColumnLabel({ label, reading }: { label?: string; reading: boolean }) {
  if (!label) return null;
  return (
    <span
      className={cn(
        "text-xs font-medium text-nevo-near-black/60",
        reading && [READING_BODY, READING_INK],
      )}
    >
      {label}
    </span>
  );
}

/**
 * D149's place value: three columns, flats then rods then units, each holding
 * its mark's count of pieces - "marks are the piece counts for the columns
 * named by labels". The shapes say ten to one at each step, true of any
 * three neighbouring places; which places is the labels' to say, under each
 * column. D149's "Hundreds", "Tens" and "Ones" are not drawn for a payload
 * that names none - for a lesson on tenths they would be wrong.
 *
 * A column whose quantity is a result still kept back is not drawn; the
 * others keep their own shapes.
 */
function PlaceValue({
  places,
  shown,
  emphasis,
  reading,
}: {
  places: ScaffoldQuantity[];
  shown: (q: ScaffoldQuantity) => boolean;
  emphasis: Emphasis;
  reading: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end justify-center gap-5">
      {places.map((place, i) => {
        const shape = PIECES[i];
        if (!shape || !shown(place)) return null;
        return (
          <div key={i} className="flex flex-col items-center gap-2.5">
            <PieceStack
              shape={shape}
              ringed={names(emphasis.ring, markKeys(emphasis, place))}
            >
              {Array.from({ length: place.count }).map((_, n) => (
                <Piece key={n} shape={shape} placed />
              ))}
            </PieceStack>
            <ColumnLabel label={place.label} reading={reading} />
          </div>
        );
      })}
    </div>
  );
}

/** D149's line: where position `i` of `parts` sits along it. */
const along = (position: number, parts: number) =>
  `${parts > 1 ? (position / (parts - 1)) * 100 : 0}%`;

/** A tick on a line: its position, and whether it is the lighter violet. */
interface Tick {
  at: number;
  light: boolean;
}

/**
 * D149's track, with a tick only where the data puts a mark or a label -
 * D159: "labels belong to marks, only where there are marks - not one per
 * tick". A tick stood at every one of the line's positions before, as the
 * sheet drew it until 13 Oct.
 *
 * Each is 3 by 20 and they alternate soft violet and light violet, as
 * several marks on one bar do (D160). The light one is the sheet's own
 * `#c7c9e5`, solid: the bar's violet/55 would let the track show through
 * where the tick crosses it.
 */
function LineTrack({ parts, ticks = [] }: { parts: number; ticks?: Tick[] }) {
  return (
    <>
      <div
        aria-hidden
        className="absolute inset-x-0 top-[30px] h-1 rounded-full bg-nevo-near-black/20"
      />
      {ticks.map(({ at, light }, i) => (
        <span
          key={i}
          aria-hidden
          data-tick={light ? "light" : "violet"}
          className={cn(
            "absolute top-[22px] h-5 w-[3px] -translate-x-1/2 rounded-full",
            light ? "bg-[#c7c9e5]" : "bg-nevo-violet",
          )}
          style={{ left: along(at, parts) }}
        />
      ))}
    </>
  );
}

/** D149's marker: the navy bead on the line. */
const BEAD =
  "absolute top-[18px] size-[30px] -translate-x-1/2 rounded-full bg-nevo-navy shadow-[0_3px_8px_rgba(0,0,0,0.2)] transition-[left] duration-200";

/** A label 6px under its tick, in D149's mark-label type. */
function LineLabel({
  at,
  parts,
  reading,
  children,
}: {
  at: number;
  parts: number;
  reading: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "absolute top-12 -translate-x-1/2 text-xs whitespace-nowrap text-nevo-near-black/60",
        reading && [READING_BODY, READING_INK],
      )}
      style={{ left: along(at, parts) }}
    >
      {children}
    </span>
  );
}

/**
 * D149's number line: a track of `parts` positions - "cells or positions in
 * one row" - with a tick and a navy marker at each mark's position, its
 * label beneath it. With no marks, a part's label sits under a tick at its
 * position, as D149 numbers 0, 5 and 10; a part with no label has no tick.
 * No other number is drawn: on a line of quarters the obvious ones would be
 * wrong.
 *
 * The ticks alternate in the payload's order, counted over all it sent, so a
 * result shown on acceptance does not recolour the ticks after it. One still
 * held back (B127) has no tick at all: on a line, where it sits is the answer.
 */
function NumberLine({
  parts,
  points,
  shown,
  partLabels,
  heldPart,
  emphasis,
  reading,
}: {
  parts: number;
  points: ScaffoldQuantity[];
  shown: (q: ScaffoldQuantity) => boolean;
  partLabels: string[];
  heldPart: (at: number) => boolean;
  emphasis: Emphasis;
  reading: boolean;
}) {
  const marks = points.flatMap((p, mark) => (shown(p) ? [{ p, mark }] : []));
  const labelled = partLabels
    .flatMap((label, at) => (label ? [{ label, at }] : []))
    .map((part, nth) => ({ ...part, nth }))
    .filter(({ at }) => !heldPart(at));
  const ticks: Tick[] = [
    ...marks.map(({ p, mark }) => ({ at: p.count, light: mark % 2 === 1 })),
    ...labelled.map(({ at, nth }) => ({ at, light: nth % 2 === 1 })),
  ];
  return (
    <div className="mx-[15px] mb-3">
      <div className="relative h-16">
        <LineTrack parts={parts} ticks={ticks} />
        {marks.map(({ p, mark }) => (
          <span
            key={mark}
            aria-hidden
            data-bead
            className={cn(BEAD, names(emphasis.ring, markKeys(emphasis, p)) && RING)}
            style={{ left: along(p.count, parts) }}
          />
        ))}
        {marks.map(({ p, mark }) =>
          p.label ? (
            <LineLabel key={mark} at={p.count} parts={parts} reading={reading}>
              {p.label}
            </LineLabel>
          ) : null,
        )}
        {labelled.map(({ label, at }) => (
          <LineLabel key={at} at={at} parts={parts} reading={reading}>
            {label}
          </LineLabel>
        ))}
      </div>
    </div>
  );
}

/**
 * A hint - a calm pill above the response. The one the child opened has no
 * dismiss (17a): it stays until the step moves on. The engine's carries the
 * hint card's "Close" (D29, D85), because "support a child cannot dismiss
 * becomes an obstruction" - the one thing 17a's pill does not draw.
 */
function HintPill({
  text,
  reading,
  onClose,
}: {
  text: string;
  reading: boolean;
  onClose?: () => void;
}) {
  return (
    <div className="mx-auto flex w-max max-w-full items-center gap-2.5 rounded-full bg-nevo-cream-elevated px-[18px] py-2.5 shadow-elevation-1 motion-safe:animate-nevo-reveal">
      <span className="size-[7px] shrink-0 rounded-full bg-nevo-violet" />
      <span
        className={cn(
          "text-sm leading-[1.4] text-nevo-near-black",
          reading && [READING_BODY, READING_INK],
        )}
      >
        {text}
      </span>
      {onClose && (
        <button
          type="button"
          aria-label="Close hint"
          onClick={onClose}
          // A 44px target that does not make the pill any taller.
          className="-my-3 -mr-2.5 flex h-11 shrink-0 cursor-pointer items-center rounded-full px-3 text-[13px] font-medium text-nevo-navy transition-colors hover:bg-nevo-navy/8"
        >
          Close
        </button>
      )}
    </div>
  );
}

/**
 * One of the child's own controls in the row (the frame's `ctlOn`/`ctlOff`):
 * a 40px pill, 15px in, 13px medium - navy with cream while on, the raised
 * cream with navy while off. Pressed is said to a screen reader too.
 */
function RowControl({
  on,
  onPress,
  children,
}: {
  on: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onPress}
      className={cn(
        "inline-flex h-10 shrink-0 cursor-pointer items-center justify-center rounded-full px-[15px] text-[13px] font-medium transition-[background-color,color] duration-150 ease-out",
        on
          ? "bg-nevo-navy text-nevo-cream"
          : "bg-nevo-cream-elevated text-nevo-navy shadow-[0_2px_8px_rgba(0,0,0,0.06)]",
      )}
    >
      {children}
    </button>
  );
}

/**
 * "Need a hint?" - the same weight however the step has gone. 17b drew it
 * heavier after a miss; a control that grows when a child gets something
 * wrong is this screen reacting to their difficulty, which is the engine's
 * call to make (B18) and nobody's to show.
 *
 * IN THE DARKER VIOLET (D210, 13 Oct). Soft violet is 2.34:1 on cream, which
 * fails as text; #5b5e8f is the same hue made readable, as text only.
 */
function HintLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-11 cursor-pointer px-2 text-[13px] whitespace-nowrap text-nevo-violet-text"
    >
      Need a hint?
    </button>
  );
}

/**
 * A tap step (17b §6): tap pieces into the empty bar until it holds the
 * stored count. The tray offers ONE piece, as D149 draws it for every kind -
 * design, 9 Oct: "the fraction bar's tray becomes D149's single piece. One
 * scaffold, one interaction, everywhere." 17b drew a tile per piece still to
 * place, which also told the child how many were left. A piece the asked
 * step names by its label is ringed.
 */
function BuildTray({
  parts,
  target,
  placed,
  onPlace,
  ringed,
}: {
  parts: number;
  target: number;
  placed: number;
  onPlace: () => void;
  ringed: ReadonlySet<number>;
}) {
  return (
    <>
      <div
        data-reveal="build"
        className="mt-[18px] rounded-[12px] bg-nevo-cream-elevated p-[18px] shadow-elevation-1 sm:p-6"
      >
        <span className="font-mono text-[10px] tracking-[0.06em] text-nevo-near-black/50 uppercase">
          The total
        </span>
        {/* D149's piece, as design landed it on 13 Oct: 46px places with
            6px between, at every width. They were 17b's bar height plus 6
            (34 / 40 / 36), 5px apart. */}
        <div aria-hidden className="mt-3 flex gap-1.5">
          {Array.from({ length: parts }).map((_, i) => (
            <span
              key={i}
              data-build-place
              className={cn(
                "h-[46px] flex-1 rounded-md transition-colors duration-200",
                i < placed
                  ? "bg-nevo-navy"
                  : "border-2 border-dashed border-nevo-navy/30 bg-nevo-near-black/[0.05]",
                ringed.has(i) && RING,
              )}
            />
          ))}
        </div>
      </div>
      <TapToAdd done={placed >= target}>
        {/* D149's fraction tile: 44px tall, at least 72 wide. */}
        <button
          type="button"
          {...pieceProps(placed < target ? onPlace : undefined)}
          className={cn(
            "flex h-11 min-w-[72px] items-center justify-center rounded-[12px] border-2 border-nevo-violet bg-nevo-violet/14 px-3.5 text-base font-semibold text-nevo-navy shadow-elevation-1",
            placed < target ? "cursor-pointer" : SPENT,
          )}
        >
          + 1/{parts}
        </button>
      </TapToAdd>
    </>
  );
}

/**
 * D149's tray: "Tap to add", then the piece to tap.
 *
 * IT STAYS ONCE THE BUILD IS DONE (Lydia, 17 Oct; design's D162). It went
 * with the last piece, and "That's the total" arrived in its place - under
 * the finger that had just placed that piece, so a double tap, or one tap
 * too many, built the answer and submitted it too. Now the tray keeps its
 * row, and "That's the total" arrives below it: the child sees what they
 * built, and confirms it with a tap of its own.
 *
 * THE SPENT ROW READS COMPLETE (design 5bb9ee2, S1: "never an empty gap, and
 * never implies anything is missing"). Once every piece is in, a dot and
 * `TRAY_DONE_LINE` take the row - Lydia's general words, 31 Oct, for the
 * frame's "That's all three quarters in". True wherever it shows: every tray
 * is done only once the build holds every piece it asks for. The spent row
 * stays under the line, unseen and inert, so the row keeps its exact height
 * and nothing below it moves; and a keyboard's focus on the last piece goes
 * to the line in its place, never on to "That's the total", where a held key
 * would commit.
 */
function TapToAdd({
  done = false,
  children,
}: {
  /** Every piece is placed: the row is spent, and holds its place. */
  done?: boolean;
  children: React.ReactNode;
}) {
  const row = useRef<HTMLDivElement>(null);
  const line = useRef<HTMLParagraphElement>(null);
  // Before the row goes inert and the browser drops the focus inside it.
  useLayoutEffect(() => {
    if (done && row.current?.contains(document.activeElement)) {
      line.current?.focus();
    }
  }, [done]);
  return (
    <div
      data-reveal="tray"
      data-tray-done={done || undefined}
      className="mt-4 grid place-items-center"
    >
      <div
        ref={row}
        aria-hidden={done || undefined}
        inert={done}
        className={cn(
          "col-start-1 row-start-1 flex items-center justify-center gap-2.5",
          done && "invisible",
        )}
      >
        <span aria-hidden className="text-xs text-nevo-near-black/55">
          Tap to add
        </span>
        {children}
      </div>
      <p
        ref={line}
        role="status"
        tabIndex={done ? -1 : undefined}
        className="col-start-1 row-start-1 outline-none"
      >
        {done && (
          <span className="flex items-center gap-2.5 motion-safe:animate-nevo-rise">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full bg-nevo-violet"
            />
            <span className="text-sm leading-[1.45] text-pretty text-nevo-violet-text sm:text-[15px]">
              {TRAY_DONE_LINE}
            </span>
          </span>
        )}
      </p>
    </div>
  );
}

/** The spent tray's line (Lydia, 31 Oct; design 5bb9ee2, S1). */
export const TRAY_DONE_LINE = "That's everything in, so the total is complete.";

/**
 * A SPENT PIECE: one with nothing left to add, dimmed where it was. It is
 * still the same button, so a child working the tray by keyboard or switch
 * keeps their place on it - focus is never moved onto "That's the total",
 * where a held key would commit - but it is marked disabled and does
 * nothing, however often it is pressed. Once the whole build is in, the row
 * goes under the finished line, and the focus with it (`TapToAdd`).
 */
const SPENT = "cursor-default opacity-50";

/** A tray piece's press: `onPlace` while it has a piece to give, else none. */
function pieceProps(onPlace: (() => void) | undefined) {
  return onPlace ? { onClick: onPlace } : { "aria-disabled": true as const };
}

/**
 * D149's tray piece, at its own size, in a 44px target - and its caption 5px
 * under it, where the payload names its column (D149's `trayTileCap`).
 *
 * THE CAPTION IS THE PAYLOAD'S LABEL, AS GIVEN, OR NOTHING. D149 captions
 * "Hundred", "Ten" and "One"; those are this screen's words for a payload
 * that names its columns "Hundreds", "Tens" and "Ones", or names none, and
 * for a lesson on tenths they would be wrong. The caption sits inside the
 * button, so the target only grows, and the button's name already says it.
 *
 * Without `onPlace` it is spent (see `SPENT`): a full column's piece, or the
 * last piece of a build, kept where it was so nothing beside it or below it
 * moves, dimmed, and pressing it does nothing. It was drawn invisible
 * before, and the whole tray went with the build's last piece.
 */
function TrayPiece({
  shape,
  label,
  caption,
  reading = false,
  onPlace,
}: {
  shape: string;
  label: string;
  caption?: string;
  reading?: boolean;
  onPlace?: () => void;
}) {
  const box =
    "flex min-h-11 min-w-11 shrink-0 flex-col items-center justify-center gap-[5px]";
  const inside = (
    <>
      <span
        className={cn(
          "box-border border-2 border-nevo-violet bg-nevo-violet/18 shadow-elevation-1",
          shape,
        )}
      />
      {caption && (
        <span
          data-tray-caption
          className={cn(
            "text-[10px] font-medium text-nevo-near-black/60",
            reading && [READING_BODY, READING_INK],
          )}
        >
          {caption}
        </span>
      )}
    </>
  );
  return (
    <button
      type="button"
      aria-label={label}
      data-tray-place={onPlace ? undefined : ""}
      {...pieceProps(onPlace)}
      className={cn(box, onPlace ? "cursor-pointer" : SPENT)}
    >
      {inside}
    </button>
  );
}

/**
 * An array build (D149): `rows` rows of `parts` empty places, filled in
 * reading order as the child taps the one piece the tray offers. "Nothing
 * marks right or wrong while building", and the tray's piece is spent once
 * the stored count is placed, as the bar's is (see `TapToAdd`).
 *
 * `round` is the counters build (B112), D149's dots: "Fill the frame with
 * counters: tap to drop a dot into the next empty space" - the same rows and
 * the same reading order, its places dashed circles 8px apart, a 34px dot to
 * a filled one, and the tray's piece a dot.
 */
function ArrayBuild({
  round = false,
  rows,
  parts,
  target,
  placed,
  onPlace,
  ringed,
}: {
  round?: boolean;
  rows: number;
  parts: number;
  target: number;
  placed: number;
  onPlace: () => void;
  ringed: ReadonlySet<number>;
}) {
  return (
    <>
      <div
        data-reveal="build"
        className="mt-[18px] rounded-[12px] bg-nevo-cream-elevated p-[18px] shadow-elevation-1 sm:p-6"
      >
        <span className="font-mono text-[10px] tracking-[0.06em] text-nevo-near-black/50 uppercase">
          The total
        </span>
        <div
          aria-hidden
          className={cn("mt-3 flex flex-col", round ? "gap-2" : "gap-2.5")}
        >
          {Array.from({ length: rows }).map((_, row) => (
            <div
              key={row}
              data-build-row
              className={cn("flex justify-center", round ? "gap-2" : "gap-2.5")}
            >
              {Array.from({ length: parts }).map((_, cell) => {
                // Reading order: a row fills before the next one starts.
                const at = row * parts + cell;
                if (round) {
                  return (
                    <span
                      key={cell}
                      data-build-dot={at < placed ? "filled" : "empty"}
                      className={cn(
                        COUNTER,
                        at >= placed && DOT_EMPTY,
                        ringed.has(at) && RING,
                      )}
                    >
                      {at < placed && (
                        <span
                          className={cn(
                            "size-[85%] rounded-full bg-nevo-navy",
                            ARRAY_INSET,
                          )}
                        />
                      )}
                    </span>
                  );
                }
                return (
                  <span
                    key={cell}
                    className={cn(
                      SQUARE,
                      at < placed ? SQUARE_FILLED : SQUARE_EMPTY,
                      ringed.has(at) && RING,
                    )}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <TapToAdd done={placed >= target}>
        <TrayPiece
          shape={round ? "size-[34px] rounded-full" : "size-[34px] rounded-lg"}
          label="Tap to add"
          onPlace={placed < target ? onPlace : undefined}
        />
      </TapToAdd>
    </>
  );
}

/** D149's round place for a counter, at its 40px where the row has room. */
const COUNTER =
  "flex aspect-square min-w-0 flex-[0_1_40px] items-center justify-center rounded-full transition-colors duration-200";

/**
 * A place-value build (D149): each column's places, as many as the
 * scaffold's mark for it, filled as the child taps that column's piece - a
 * flat, a rod or a unit. A column's piece is spent in the tray once it is
 * full, and the build is done when every column is: nothing counts them
 * together.
 * Each tray piece is named and captioned by its column's label where the
 * payload gives one, and by nothing where it does not (see `TrayPiece`).
 */
function PlaceValueBuild({
  columns,
  placed,
  onPlace,
  reading,
}: {
  columns: ScaffoldQuantity[];
  placed: number[];
  onPlace: (column: number) => void;
  reading: boolean;
}) {
  /** The columns the build asks pieces for, each with a slot in the tray. */
  const needed = columns.flatMap((c, i) => (PIECES[i] && c.count > 0 ? [i] : []));
  const isOpen = (i: number) => (placed[i] ?? 0) < columns[i].count;
  return (
    <>
      <div
        data-reveal="build"
        className="mt-[18px] rounded-[12px] bg-nevo-cream-elevated p-[18px] shadow-elevation-1 sm:p-6"
      >
        <span className="font-mono text-[10px] tracking-[0.06em] text-nevo-near-black/50 uppercase">
          The total
        </span>
        <div className="mt-3 flex flex-wrap items-end justify-center gap-5">
          {columns.map((column, i) => {
            const shape = PIECES[i];
            if (!shape) return null;
            return (
              <div
                key={i}
                data-build-column
                className="flex flex-col items-center gap-2.5"
              >
                <PieceStack shape={shape}>
                  {Array.from({ length: column.count }).map((_, n) => (
                    <Piece key={n} shape={shape} placed={n < (placed[i] ?? 0)} />
                  ))}
                </PieceStack>
                <ColumnLabel label={column.label} reading={reading} />
              </div>
            );
          })}
        </div>
      </div>
      {/*
        A FULL COLUMN'S PIECE IS SPENT WHERE IT IS. The tray re-centred when
        a column filled, so the piece the child was about to tap again moved
        out from under their finger; and it went whole with the last column,
        so "That's the total" arrived under it (Lydia, 17 Oct).
      */}
      {needed.length > 0 && (
        <TapToAdd done={!needed.some(isOpen)}>
          {needed.map((i) => (
            <TrayPiece
              key={i}
              shape={PIECES[i].tile}
              label={
                columns[i].label
                  ? `Tap to add, ${columns[i].label}`
                  : "Tap to add"
              }
              caption={columns[i].label}
              reading={reading}
              onPlace={isOpen(i) ? () => onPlace(i) : undefined}
            />
          ))}
        </TapToAdd>
      )}
    </>
  );
}

/**
 * A number-line build (D149): "count along the line in steps: tap to add a
 * hop and move the marker on". The marker starts on the scaffold's `start`
 * (B111) - its first position on a lesson that names none - and moves one
 * position a tap, until the stored count of hops is made. A position the
 * asked step names is ringed.
 *
 * NO TICKS: a tick goes only where the data puts a mark or a label (D159),
 * and the build carries neither - its pieces' labels name them for a
 * highlight and are never drawn.
 */
function LineBuild({
  parts,
  start,
  target,
  placed,
  onPlace,
  ringed,
}: {
  parts: number;
  start: number;
  target: number;
  placed: number;
  onPlace: () => void;
  ringed: ReadonlySet<number>;
}) {
  return (
    <>
      <div
        data-reveal="build"
        className="mt-[18px] rounded-[12px] bg-nevo-cream-elevated p-[18px] shadow-elevation-1 sm:p-6"
      >
        <span className="font-mono text-[10px] tracking-[0.06em] text-nevo-near-black/50 uppercase">
          The total
        </span>
        <div className="relative mx-[15px] mt-3 h-16">
          <LineTrack parts={parts} />
          {[...ringed].map((at) => (
            <span
              key={at}
              aria-hidden
              className={cn(
                "absolute top-[18px] size-[30px] -translate-x-1/2 rounded-full",
                RING,
              )}
              style={{ left: along(at, parts) }}
            />
          ))}
          <span
            aria-hidden
            data-bead
            className={BEAD}
            style={{ left: along(start + placed, parts) }}
          />
        </div>
      </div>
      <TapToAdd done={placed >= target}>
        {/* D149's hop tile, 44px tall. */}
        <button
          type="button"
          {...pieceProps(placed < target ? onPlace : undefined)}
          className={cn(
            "flex h-11 min-w-12 items-center justify-center rounded-[12px] border-2 border-nevo-violet bg-nevo-violet/14 px-3.5 text-[15px] font-semibold text-nevo-navy shadow-elevation-1",
            placed < target ? "cursor-pointer" : SPENT,
          )}
        >
          +1
        </button>
      </TapToAdd>
    </>
  );
}

/** 17a's narration-bar silhouette - 20 bars, explicit px heights. */
const BAR_HEIGHTS = [
  6, 10, 13, 8, 14, 10, 12, 7, 13, 9, 11, 14, 8, 12, 10, 7, 13, 9, 11, 8,
];

/**
 * The audio layer (17b §5): this step's own narration, read aloud while
 * every word stays on screen.
 *
 * IT PLAYS THE CLIP NOW. It ran a timer before - a progress line filling over
 * silence, and a `replay` sent for audio that never played - because the
 * per-step asset did not exist. `narrationAudio` carries it, so a step with a
 * clip gets a real player, and a step without one gets no bar at all.
 */
function StepNarration({
  clip,
  autoPlay,
  onStarted,
  onReplay,
  onBusy,
  onFailed,
}: {
  clip: CalcNarration;
  autoPlay: boolean;
  onStarted: () => void;
  onReplay?: () => void;
  onBusy?: (phase: "start" | "end") => void;
  onFailed?: (reason: MediaFailReason) => void;
}) {
  const media = useMediaSource(clip.src, clip.storagePath, onFailed);
  /*
   * PRESSABLE, NOT GREYED (D211). Play on a step whose recording did not load
   * says so in place, in Lydia's line, for this load of it; a load retried
   * when the connection returns, and failing again, is said again when
   * pressed. The step itself is all on screen either way.
   */
  const [toldFor, setToldFor] = useState<string | null>(null);
  const told = media.failed && toldFor === media.key;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pct, setPct] = useState(0);
  const playingRef = useRef(false);
  const onBusyRef = useRef(onBusy);

  useEffect(() => {
    onBusyRef.current = onBusy;
  }, [onBusy]);

  // Moving on mid-sentence must still close the busy window.
  useEffect(
    () => () => {
      if (playingRef.current) onBusyRef.current?.("end");
    },
    [],
  );

  const setPlayState = (on: boolean) => {
    if (playingRef.current === on) return;
    playingRef.current = on;
    setPlaying(on);
    onBusyRef.current?.(on ? "start" : "end");
    if (on) onStarted();
  };

  const toggle = () => {
    if (media.failed) {
      setToldFor(media.key);
      return;
    }
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
      return;
    }
    // Pressing play on a finished step reads it again from the top.
    if (pct >= 100) {
      onReplay?.();
      el.currentTime = 0;
    }
    // Only a source the browser cannot play is a failure. A refusal to start
    // without a tap, or a pause while buffering, is not.
    void el.play()?.catch((err: unknown) => {
      setPlayState(false);
      if ((err as { name?: string } | null)?.name === "NotSupportedError") {
        void media.onError();
      }
    });
  };

  return (
    <div className="mb-4 flex items-center gap-3 rounded-[12px] bg-nevo-cream-elevated px-3 py-2.5 shadow-elevation-1">
      {!media.failed && (
        <audio
          // Keyed so a re-issued link actually reloads.
          key={media.key}
          ref={audioRef}
          src={media.src}
          preload="auto"
          autoPlay={autoPlay && media.key === "0"}
          onTimeUpdate={(e) => {
            const el = e.currentTarget;
            if (!Number.isFinite(el.duration) || el.duration <= 0) return;
            setPct(Math.min(100, (el.currentTime / el.duration) * 100));
          }}
          onPlay={() => setPlayState(true)}
          onPause={() => setPlayState(false)}
          onEnded={() => {
            setPct(100);
            setPlayState(false);
          }}
          onError={() => {
            setPlayState(false);
            void media.onError();
          }}
        />
      )}
      <button
        type="button"
        aria-label={playing ? "Pause narration" : "Play narration"}
        onClick={toggle}
        className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-nevo-navy text-nevo-cream transition-transform active:scale-[0.98]"
      >
        {playing ? (
          <Pause className="size-[18px]" fill="currentColor" strokeWidth={0} />
        ) : (
          <Play
            className="ml-0.5 size-[18px]"
            fill="currentColor"
            strokeWidth={0}
          />
        )}
      </button>
      {/*
        D211's line takes the failure line's place while it shows, beside
        the control, so the card grows as little as it can and what is
        under it barely moves. Its type is the row's own 13px.
      */}
      {told ? (
        <PressedLine className="min-w-0 flex-1 text-[13px] leading-[1.4]">
          {NO_SOUND}
        </PressedLine>
      ) : media.failed ? (
        <span role="status" className="text-[13px] text-nevo-near-black/70">
          {"Couldn't load this recording"}
        </span>
      ) : (
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-nevo-near-black">
              Read this step aloud
            </span>
            <span className="font-mono text-[10px] tracking-[0.04em] text-nevo-near-black/50 uppercase">
              · Text stays
            </span>
          </div>
          <div aria-hidden className="flex h-3.5 items-end gap-0.5">
            {BAR_HEIGHTS.map((h, i) => (
              <span
                key={i}
                className="w-[3px] shrink-0 rounded-full bg-nevo-navy transition-opacity duration-[160ms]"
                style={{
                  height: `${h}px`,
                  opacity: (i + 1) / BAR_HEIGHTS.length <= pct / 100 ? 0.95 : 0.28,
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
