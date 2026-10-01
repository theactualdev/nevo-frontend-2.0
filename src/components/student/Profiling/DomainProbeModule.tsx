"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { AgeBand } from "@/lib/profiling/bands";
import { tapPoint, type BaselineCapture } from "@/lib/profiling/capture";
import { AvatarBubble, ProfilingShell } from "./ProfilingShell";
import { SettleBadge } from "./GridSpanModule";
import { useTrialRunner } from "./useTrialRunner";

/**
 * Module 4 - Domain Probe (BP-M4: prior knowledge). A short adaptive knowledge
 * probe seeding the Knowledge Graph entry node per subject. Curriculum-mapped,
 * West-African localized questions; a selected option fills navy with no
 * correct/incorrect feedback, then the next loads. P1-3 gets three
 * picture-aided options; JSS and SS pick a subject first. The frames author one
 * exemplar per band - the extra items here follow their tone verbatim-adjacent
 * and are mock content until the item bank lands.
 * TODO(api): questions come from the adaptive IRT service, not this list.
 */

/**
 * The answer key, which this used to argue it could not have.
 *
 * The note here said Module 4 "has no correct option" and that
 * `accuracy: null` followed from the nature of a prior-knowledge probe. That
 * was a statement about the SHAPE, not about the questions: every item below
 * is an ordinary multiple-choice question with one unambiguous answer. Abuja
 * is the capital, 15% of 200 is 30, 3x + 2x - x is 4x.
 *
 * And a knowledge probe is precisely the thing that needs the answer. Module 4
 * exists to seed the Knowledge Graph's entry node per subject (BP-M4), and you
 * cannot seed an entry node from "they tapped the third option in 4.2
 * seconds". The comment is why this survived a read: it made a gap look like a
 * property.
 *
 * Answer positions are deliberately spread. They sat at index 0 for all three
 * P1-3 items and index 1 for three of four at P4-6, so a child who always
 * pressed the first or second option would have been scored a knowledgeable
 * one.
 *
 * Still a stand-in for the adaptive IRT service, which would arrive scored.
 * TODO(api): questions come from the adaptive IRT service, not this list.
 */
interface ProbeQuestion {
  context?: string;
  picture?: string;
  question: string;
  options: { text: string; icon?: string }[];
  /** Index into `options`. */
  answer: number;
}

const ICONS = {
  fish: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M2 12c4-6 12-6 16 0-4 6-12 6-16 0z"/><path d="M18 12l4-3v6z"/><circle cx="7" cy="11" r="1.2" fill="#f7f1e6"/></svg>',
  cat: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 8l2-4 3 3h6l3-3 2 4v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><circle cx="9.5" cy="12" r="1" fill="#f7f1e6"/><circle cx="14.5" cy="12" r="1" fill="#f7f1e6"/></svg>',
  bird: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 7c3 0 4 3 7 3 4 0 5-4 8-4-1 5-4 9-8 9-3 0-6-3-7-8z"/></svg>',
  water:
    '<svg viewBox="0 0 24 24" fill="none" stroke="#3b3f6e" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="#3b3f6e" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.5 4.5l2 2M17.5 17.5l2 2M19.5 4.5l-2 2M6.5 17.5l-2 2"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17.8 5.9 21.4l1.5-6.8L2.2 9l6.9-.7z"/></svg>',
  leaf: '<svg viewBox="0 0 24 24" fill="none" stroke="#3b3f6e" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20C4 9 11 4 20 4c0 9-5 16-16 16z"/><path d="M4 20c4-5 8-8 12-10"/></svg>',
};

export const PROBE_QUESTIONS: Record<AgeBand, ProbeQuestion[]> = {
  p13: [
    {
      picture: ICONS.water,
      question: "Which animal lives in water?",
      options: [
        { text: "Cat", icon: ICONS.cat },
        { text: "Fish", icon: ICONS.fish },
        { text: "Bird", icon: ICONS.bird },
      ],
      answer: 1,
    },
    {
      picture: ICONS.sun,
      question: "Which one do you see in the sky at night?",
      options: [
        { text: "The sun", icon: ICONS.sun },
        { text: "A fish", icon: ICONS.fish },
        { text: "The moon", icon: ICONS.moon },
      ],
      answer: 2,
    },
    {
      picture: ICONS.leaf,
      question: "What colour are most leaves?",
      options: [
        { text: "Green", icon: ICONS.leaf },
        { text: "Blue", icon: ICONS.water },
        { text: "Yellow", icon: ICONS.star },
      ],
      answer: 0,
    },
  ],
  p46: [
    {
      question: "What is three-quarters of 12?",
      options: [{ text: "8" }, { text: "9" }, { text: "12" }, { text: "16" }],
      answer: 1,
    },
    {
      question: "Which gas do plants take in to make food?",
      options: [
        { text: "Carbon dioxide" },
        { text: "Oxygen" },
        { text: "Nitrogen" },
        { text: "Hydrogen" },
      ],
      answer: 0,
    },
    // Was "The capital of Nigeria is:", which Module 3 already asks this band
    // as a true/false sentence. Testing one fact twice in a run makes two
    // modules agree about a child for no reason but the overlap.
    {
      question: "Which of these rivers flows through Nigeria?",
      options: [
        { text: "The Nile" },
        { text: "The Congo" },
        { text: "The Benue" },
        { text: "The Zambezi" },
      ],
      answer: 2,
    },
    {
      question: "What is 15% of 200?",
      options: [{ text: "20" }, { text: "25" }, { text: "30" }, { text: "35" }],
      answer: 2,
    },
  ],
  jss: [
    {
      context:
        "A trader buys a bag of rice for ₦18,000. Later that week she sells it for ₦22,500.",
      question: "What is her percentage profit?",
      options: [
        { text: "20%" },
        { text: "25%" },
        { text: "22.5%" },
        { text: "45%" },
      ],
      answer: 1,
    },
    {
      question: "Which of these is a renewable source of energy?",
      options: [
        { text: "Coal" },
        { text: "Diesel" },
        { text: "Solar" },
        { text: "Natural gas" },
      ],
      answer: 2,
    },
    {
      question: "Simplify: 3x + 2x - x",
      options: [{ text: "4x" }, { text: "5x" }, { text: "6x" }, { text: "x" }],
      answer: 0,
    },
    {
      question: "The River Niger and River Benue meet at:",
      options: [
        { text: "Onitsha" },
        { text: "Makurdi" },
        { text: "Lokoja" },
        { text: "Yenagoa" },
      ],
      answer: 2,
    },
  ],
  ss: [
    {
      question: "Which cell structure is the main site of photosynthesis?",
      options: [
        { text: "Chloroplast" },
        { text: "Mitochondrion" },
        { text: "Ribosome" },
        { text: "Nucleus" },
      ],
      answer: 0,
    },
    {
      question: "If f(x) = 2x² - 3, what is f(2)?",
      options: [{ text: "1" }, { text: "5" }, { text: "8" }, { text: "13" }],
      answer: 1,
    },
    {
      question: "The economic term for a general rise in prices is:",
      options: [
        { text: "Deflation" },
        { text: "Recession" },
        { text: "Inflation" },
        { text: "Subsidy" },
      ],
      answer: 2,
    },
    {
      question:
        "Which literary device gives human qualities to non-human things?",
      options: [
        { text: "Simile" },
        { text: "Hyperbole" },
        { text: "Personification" },
        { text: "Irony" },
      ],
      answer: 2,
    },
  ],
};

const SUBJECTS: Record<string, string[]> = {
  jss: ["Mathematics", "English", "Basic Science", "Social Studies"],
  ss: [
    "Sciences",
    "Mathematics",
    "English Language",
    "Social Studies",
    "Other",
  ],
};

export function DomainProbeModule({
  band,
  capture,
  onComplete,
}: {
  band: AgeBand;
  capture?: BaselineCapture;
  onComplete: () => void;
}) {
  const questions = PROBE_QUESTIONS[band] ?? PROBE_QUESTIONS.p46;
  const needsSubject = band === "jss" || band === "ss";
  const [subject, setSubject] = useState<string | null>(null);

  const { trial, picked, settling, pick } = useTrialRunner({
    module: "domain_probe",
    counts: [["probe", questions.length]],
    capture,
    onComplete,
  });

  if (needsSubject && subject === null) {
    return (
      <ProfilingShell filled={3} active={3}>
        <div className="flex min-h-0 w-full max-w-[520px] flex-1 flex-col items-center justify-center gap-6">
          {/* The frame's words (`Nevo Domain Probe Frame` :29). */}
          <h2 className="text-center text-xl font-semibold text-balance text-nevo-navy">
            Which subject would you like to start with?
          </h2>
          <div className="grid w-full grid-cols-2 gap-3">
            {(SUBJECTS[band] ?? SUBJECTS.ss).map((s) => (
              <button
                key={s}
                type="button"
                onClick={(e) => {
                  capture?.record("probe_subject", {
                    subject: s,
                    ...tapPoint(e),
                  });
                  setSubject(s);
                }}
                className="cursor-pointer rounded-[10px] border-2 border-nevo-navy bg-nevo-cream px-4 py-[18px] text-center text-base font-medium text-nevo-near-black transition-transform active:scale-[0.97]"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </ProfilingShell>
    );
  }

  const q = questions[Math.min(trial, questions.length - 1)];

  return (
    <ProfilingShell filled={settling ? 4 : 3} active={settling ? -1 : 3}>
      {!settling && <AvatarBubble text="Choose your answer" />}
      <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center">
        {settling ? (
          <SettleBadge />
        ) : (
          <div className="flex w-full max-w-[520px] flex-col gap-6">
            <div className="flex flex-col items-center gap-3.5 rounded-[12px] border-2 border-nevo-navy bg-nevo-cream p-5">
              {q.picture && (
                <div
                  className="size-[110px] text-nevo-navy"
                  dangerouslySetInnerHTML={{ __html: q.picture }}
                />
              )}
              {q.context && (
                <p className="self-stretch text-[15px] leading-[1.55] text-pretty text-nevo-near-black">
                  {q.context}
                </p>
              )}
              <p className="text-center text-lg leading-[1.4] font-medium text-pretty text-nevo-near-black">
                {q.question}
              </p>
            </div>
            <div className="flex flex-col gap-2.5">
              {q.options.map((o, i) => {
                const selected = picked === i;
                return (
                  <button
                    key={o.text}
                    type="button"
                    onClick={(e) =>
                      pick(
                        i,
                        {
                          subject: subject ?? undefined,
                          correct: i === q.answer,
                        },
                        e,
                      )
                    }
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-3 rounded-[10px] border-2 px-4 text-left text-base leading-[1.4]",
                      band === "p13" ? "min-h-16" : "min-h-[52px] py-3",
                      selected
                        ? "border-nevo-navy bg-nevo-navy text-nevo-cream"
                        : "border-nevo-navy bg-nevo-cream text-nevo-near-black",
                    )}
                  >
                    {o.icon && (
                      <span
                        className={cn(
                          "size-8 shrink-0",
                          selected ? "text-nevo-cream" : "text-nevo-navy",
                        )}
                        dangerouslySetInnerHTML={{ __html: o.icon }}
                      />
                    )}
                    {o.text}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </ProfilingShell>
  );
}
