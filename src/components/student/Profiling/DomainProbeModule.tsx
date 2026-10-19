"use client";

import { useEffect, useRef, useState } from "react";
import type { TrackEvent } from "@/hooks";
import {
  DOMAIN_PROBE,
  probeApi,
  probeStepKind,
  type OnboardingSubject,
  type ProbeQuestion,
  type ProbeStep,
} from "@/lib/api/probe";
import {
  readProbePlan,
  type ProbeOpenings,
  type ProbePlan,
} from "@/lib/api/probePlan";
import { useHydrated } from "@/hooks/useHydrated";
import { useRosterBand } from "@/hooks/useRosterBand";
import { getSession } from "@/lib/auth/session";
import { ONBOARDING_SIGNAL_TYPES } from "@/lib/constants";
import { AGE_BANDS, type AgeBand } from "@/lib/profiling/bands";
import { cn } from "@/lib/utils";
import { ProfilingShell } from "./ProfilingShell";
import { QuestSegments } from "./QuestMap";
import { StretchInterstitial } from "./StretchInterstitial";

/**
 * How Module 4 ended, for the run around it.
 *
 * `sat` - the child was asked at least one question here, or the server
 * already holds the module as done. `absent` - there was nothing to ask: no
 * session, no subject with items, or every subject answered with none
 * (`probePlan`). `failed` - a read failed before anything could be asked, so
 * whether there was anything is not known. None of the three is a claim that
 * the server recorded the module; only the server's gate says that
 * (`onboardingGate`).
 */
export type DomainProbeOutcome = "sat" | "absent" | "failed";

/** What a plan with nothing to ask ends Module 4 as, without presenting it. */
const ENDS_AS: Record<Exclude<ProbePlan["kind"], "ask">, DomainProbeOutcome> = {
  held: "sat",
  unavailable: "absent",
  failed: "failed",
};

/** Which stop of the quest map Module 4 is: three done, the fourth active. */
const DONE_BEFORE = 3;

/** The two bands the frame has choose a subject first (09d, BP-JSS/SS-M4). */
const CHOOSE_FIRST: readonly AgeBand[] = [AGE_BANDS.JSS, AGE_BANDS.SS];

/**
 * Module 4 for the child signed in on this device, at their roster band.
 *
 * Every caller is past account creation - the PIN step, or a child sent back
 * to finish - so the session is the child's own, and the band is read from
 * the roster as `ProfilingFlow` reads an SSO child's: the server's, Primary
 * 4-6 when it gives none, never asked.
 *
 * FIRST, WHETHER IT WILL RUN AT ALL (Olayinka, 19 Oct: "an unavailable probe
 * moves the child on, never to a dead end"). Readiness and each subject's
 * first item are read before anything of the module is drawn - the stretch
 * included - unless the caller has already read them (`openings`). With
 * nothing to ask the module ends there, unpresented, and the caller moves on.
 * With something, the first item read is the one shown: it is not fetched
 * twice.
 */
export function DomainProbeStep({
  openings: known,
  stretchFirst,
  track,
  onDone,
}: {
  /** What to ask, when the caller has already planned it (`planProbe`). */
  openings?: ProbeOpenings;
  stretchFirst: boolean;
  track?: TrackEvent;
  onDone: (outcome: DomainProbeOutcome) => void;
}) {
  const hydrated = useHydrated();
  const roster = useRosterBand(
    hydrated ? (getSession()?.userId ?? null) : null,
  );
  const [read, setRead] = useState<ProbeOpenings | null>(null);
  const openings = known ?? read;
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (known) return;
    let cancelled = false;
    void readProbePlan().then((plan) => {
      if (cancelled) return;
      if (plan.kind === "ask") setRead(plan.openings);
      else onDoneRef.current(ENDS_AS[plan.kind]);
    });
    return () => {
      cancelled = true;
    };
    // Once per mount: one plan per Module 4.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!openings || !roster.settled) return <FindingOut />;
  return (
    <DomainProbeModule
      band={roster.band ?? AGE_BANDS.P46}
      openings={openings}
      stretchFirst={stretchFirst}
      track={track}
      onDone={onDone}
    />
  );
}

/**
 * While it is not yet known whether Module 4 will run: the profiling shell
 * with NO quest map. Four stops with the fourth active would announce a module
 * that may not happen - and then lose the stop when it did not - and three
 * would be wrong the other way. Nothing is drawn until the server has said.
 */
function FindingOut() {
  return (
    <QuestSegments.Provider value={null}>
      <ProfilingShell filled={DONE_BEFORE} active={-1}>
        {null}
      </ProfilingShell>
    </QuestSegments.Provider>
  );
}

type Stage =
  | { at: "stretch" }
  | { at: "choose" }
  | { at: "asking"; subjectId: string; item: ProbeQuestion | null; picked: string | null };

/**
 * MODULE 4, THE DOMAIN PROBE (09d, `Nevo Domain Probe Frame`; SCRUM-244).
 *
 * Lydia, 17 Oct: "Onboarding is four modules. Module 4 IS the domain probe
 * ... All four run before any lesson." The frame: "Curriculum-mapped
 * questions; a selected option fills navy, no correct/incorrect feedback, next
 * question loads." JSS and SS choose a subject first.
 *
 * THE SERVER ASKS AND THE SERVER MARKS. The first item comes planned
 * (`openings`, from `GET /api/v1/probe/{subject}/next`); each pick goes to
 * `.../answer`, which hands back the next item or the finish and never says
 * whether it was right. There is no answer key here, no count, no question
 * number and no result: the response's `asked`, `maxQuestions` and
 * `entryPoint` are not even typed (`lib/api/probe`), so none of them can reach
 * the screen (rules 2, 3 and 9).
 *
 * WHICH SUBJECT. Finishing ONE subject is what records `domain_probe`
 * (`probe.submit_answer`), so one is run. The subjects are those the plan
 * found an item in. A JSS or SS child with more than one chooses, in the
 * frame's grid; anyone else - and a JSS or SS child with only one, where a
 * grid of one is not a choice - gets the first the server lists. The frame
 * draws no choice for Primary.
 *
 * Only ever presented with something to ask: absence is the caller's to act
 * on (rule 5), before this is drawn (`DomainProbeStep`).
 */
export function DomainProbeModule({
  band,
  openings,
  stretchFirst,
  track,
  onDone,
}: {
  /** The server's band for this child: JSS and SS choose a subject first. */
  band: AgeBand;
  /** The subjects with an item to ask, each with the first item, as read. */
  openings: ProbeOpenings;
  /**
   * The mandatory stretch comes before the first question (BP-INT: a reset
   * after every module on first run), when a module has just ended. Not for a
   * child sent straight here to finish, who has just come from somewhere else.
   */
  stretchFirst: boolean;
  /** The `profiling` stream's markers, as the other three modules send. */
  track?: TrackEvent;
  onDone: (outcome: DomainProbeOutcome) => void;
}) {
  /** After the stretch, or instead of it: the choice, or the first item as read. */
  const opening = (): Stage =>
    CHOOSE_FIRST.includes(band) && openings.length > 1
      ? { at: "choose" }
      : {
          at: "asking",
          subjectId: openings[0].subject.subjectId,
          item: openings[0].item,
          picked: null,
        };
  const [stage, setStage] = useState<Stage>(() =>
    stretchFirst ? { at: "stretch" } : opening(),
  );
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);
  /** A question has been on screen in this run. */
  const shown = useRef(false);
  const ended = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // The first question on screen starts the module, on the profiling stream.
  useEffect(() => {
    if (shown.current || stage.at !== "asking" || !stage.item) return;
    shown.current = true;
    track?.(ONBOARDING_SIGNAL_TYPES.BASELINE_MODULE_START, {
      moduleId: DOMAIN_PROBE,
    });
  }, [stage, track]);

  const end = (outcome: DomainProbeOutcome) => {
    if (ended.current || !alive.current) return;
    ended.current = true;
    onDoneRef.current(outcome);
  };

  /** What `next` or `answer` said, put on screen or ended on. */
  const take = (subjectId: string, step: ProbeStep) => {
    if (!alive.current || ended.current) return;
    if (probeStepKind(step) === "question") {
      setStage({
        at: "asking",
        subjectId,
        item: step as ProbeQuestion,
        picked: null,
      });
      return;
    }
    /*
     * Finished, or no items. Before any question this is the nothing-state:
     * a `next` that says "finished" for a probe this child has not been
     * recorded as finishing cannot record it either (backend, raised), so
     * nothing here pretends it did.
     */
    if (!shown.current) {
      end("absent");
      return;
    }
    track?.(ONBOARDING_SIGNAL_TYPES.BASELINE_MODULE_COMPLETE, {
      moduleId: DOMAIN_PROBE,
    });
    end("sat");
  };

  /** Read the item the server is on for this subject, after an answer did not land. */
  const ask = (subjectId: string) => {
    setStage({ at: "asking", subjectId, item: null, picked: null });
    probeApi.next(subjectId).then(
      (step) => take(subjectId, step),
      // Nothing to put on screen. A child part-way through is placed on what
      // they answered, and the server resumes the run from it next time.
      () => end(shown.current ? "sat" : "absent"),
    );
  };

  /** The chosen subject's first item, as it was read: not fetched again. */
  const choose = (subjectId: string) => {
    const chosen = openings.find((o) => o.subject.subjectId === subjectId);
    if (!chosen) return;
    setStage({ at: "asking", subjectId, item: chosen.item, picked: null });
  };

  /** An answer is on its way: one per item, however fast the taps. */
  const answering = useRef(false);
  const pick = (item: ProbeQuestion, subjectId: string, value: string) => {
    if (answering.current) return;
    answering.current = true;
    setStage({ at: "asking", subjectId, item, picked: value });
    probeApi
      .answer(subjectId, { itemId: item.itemId, chosenOption: value })
      .then(
        (step) => {
          answering.current = false;
          take(subjectId, step);
        },
        // A stale item (409 `probe_item_stale`), or the answer not reaching
        // the server: ask again what the current item is. It is the same
        // item when the pick was lost, the next one when it landed.
        () => {
          answering.current = false;
          ask(subjectId);
        },
      );
  };

  if (stage.at === "stretch") {
    return (
      <StretchInterstitial
        filled={DONE_BEFORE}
        active={DONE_BEFORE}
        onDone={() => setStage(opening())}
      />
    );
  }

  const asking = stage.at === "asking" && stage.item ? stage : null;
  const item = asking?.item ?? null;
  return (
    <ProfilingShell filled={DONE_BEFORE} active={DONE_BEFORE}>
      <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center">
        {stage.at === "choose" && (
          <SubjectChoice
            subjects={openings.map((o) => o.subject)}
            onChoose={choose}
          />
        )}
        {asking && item && (
          <ProbeItem
            key={item.itemId}
            item={item}
            picked={asking.picked}
            roomy={band === AGE_BANDS.P13}
            onPick={(value) => pick(item, asking.subjectId, value)}
          />
        )}
      </div>
    </ProfilingShell>
  );
}

/**
 * "Which subject would you like to start with?" - the frame's subject select
 * for JSS and SS, a two-column grid of the subjects that have items.
 */
function SubjectChoice({
  subjects,
  onChoose,
}: {
  subjects: OnboardingSubject[];
  onChoose: (subjectId: string) => void;
}) {
  return (
    <div className="flex w-full max-w-[520px] flex-col items-center gap-6">
      <h1 className="text-center text-xl font-semibold text-balance text-nevo-navy">
        Which subject would you like to start with?
      </h1>
      <div className="grid w-full grid-cols-2 gap-3">
        {subjects.map((s) => (
          <button
            key={s.subjectId}
            type="button"
            onClick={() => onChoose(s.subjectId)}
            className="cursor-pointer rounded-[10px] border-2 border-nevo-navy bg-nevo-cream px-4 py-[18px] text-center text-base font-medium text-nevo-near-black transition-transform duration-[120ms] ease-out active:scale-[0.99]"
          >
            {s.name}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * One item: the question in its card, the options below (`qCard`,
 * `optionsCol`). A pick fills navy and stays so until the next item arrives;
 * nothing says whether it was right.
 *
 * The frame's Primary 1-3 picture and per-option icons, and JSS's context
 * paragraph, are not drawn: the item carries a question and labelled options
 * and nothing else, so there is nothing to draw them from (raised).
 */
function ProbeItem({
  item,
  picked,
  roomy,
  onPick,
}: {
  item: ProbeQuestion;
  picked: string | null;
  /** Primary 1-3's taller options (64px against 52px). */
  roomy: boolean;
  onPick: (value: string) => void;
}) {
  return (
    <div className="flex w-full max-w-[520px] flex-col gap-6">
      <div className="flex flex-col items-center gap-3.5 rounded-[12px] border-2 border-nevo-navy bg-nevo-cream p-5">
        <p
          id={`probe-q-${item.itemId}`}
          aria-live="polite"
          className="text-center text-lg leading-[1.4] font-medium text-pretty text-nevo-near-black"
        >
          {item.question}
        </p>
      </div>
      <div
        role="group"
        aria-labelledby={`probe-q-${item.itemId}`}
        className="flex flex-col gap-2.5"
      >
        {item.options.map((o) => {
          const chosen = picked === o.value;
          return (
            <button
              key={o.value}
              type="button"
              disabled={picked !== null}
              aria-pressed={chosen}
              onClick={() => onPick(o.value)}
              className={cn(
                "flex w-full items-center gap-3 rounded-[10px] border-2 border-nevo-navy px-4 text-left text-base leading-[1.4] transition-[background-color,transform] duration-[120ms] ease-out enabled:cursor-pointer enabled:active:scale-[0.99]",
                roomy ? "min-h-16" : "min-h-[52px]",
                chosen
                  ? "bg-nevo-navy text-nevo-cream"
                  : "bg-nevo-cream text-nevo-near-black",
              )}
            >
              <span>{o.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
