"use client";

import { useEffect, useState } from "react";
import { ApiError, apiErrorCode } from "@/lib/api/client";
import { subjectsApi, type SpellingQuestion } from "@/lib/api/subjects";
import { cn } from "@/lib/utils";
import { CARD } from "../Roster/primitives";

/**
 * D05 "Subject spellings · same or different, asked once each, listed
 * together" (9 Oct handoff: `subjectSpellingQuestions`).
 *
 * Asked here and not during onboarding, the backend's own reason: a class
 * merge changes the headcount and so the invoice; a subject spelling does
 * not, so it waits. Until a pair is answered the two are already one subject.
 *
 * One card, every open pair on it, Same or Different on each. An answered pair
 * stays on the card saying what it settled.
 *
 * The outcome names the mechanism the server really uses: it keeps the FULLER
 * spelling ("the fuller spelling surviving"). D05 once said "the spelling most
 * of your file uses"; design and Lydia corrected it on 14 Oct to "We kept the
 * fuller spelling."
 *
 * Absent when nothing is waiting, and when the read fails: the card is a
 * question, not a status, and the subjects are safely one until it's asked.
 */

type Answer = { same: boolean } | "saving" | "failed" | "gone";

export function SubjectSpellings({ paused }: { paused: boolean }) {
  const [questions, setQuestions] = useState<SpellingQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});

  useEffect(() => {
    let alive = true;
    subjectsApi
      .spellingQuestions()
      .then((q) => {
        if (alive) setQuestions(q);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (questions.length === 0) return null;

  const answer = (q: SpellingQuestion, same: boolean) => {
    setAnswers((a) => ({ ...a, [q.id]: "saving" }));
    subjectsApi
      .answerSpelling(q.id, same)
      .then(() => setAnswers((a) => ({ ...a, [q.id]: { same } })))
      .catch((err: unknown) =>
        setAnswers((a) => ({
          ...a,
          // Someone else answered it first: nothing left to ask.
          [q.id]:
            err instanceof ApiError && apiErrorCode(err.detail) === "question_already_answered"
              ? "gone"
              : "failed",
        })),
      );
  };

  const n = questions.length;
  return (
    <section aria-label="Subject spellings" className={cn(CARD, "mt-[22px]")}>
      <div className="flex items-start gap-3 bg-nevo-violet/14 px-5 py-[18px] max-lg:px-[18px] max-lg:py-4">
        <span aria-hidden className="mt-1.5 size-[9px] flex-none rounded-full bg-nevo-violet" />
        <div>
          <h3 className="m-0 text-[15.5px] font-semibold text-nevo-near-black">
            {`Your teacher file spells ${n} ${n === 1 ? "subject" : "subjects"} two ways`}
          </h3>
          <p className="m-0 mt-1 text-[13.5px] leading-[1.55] text-nevo-near-black/70">
            Answer each once. Nothing about billing changes either way, and
            classes keep working while you decide.
          </p>
        </div>
      </div>
      <ul className="m-0 list-none p-0">
        {questions.map((q) => {
          const a = answers[q.id];
          return (
            <li
              key={q.id}
              className="flex items-center gap-[18px] border-b border-nevo-near-black/7 px-5 py-4 last:border-b-0 max-lg:flex-col max-lg:items-start max-lg:gap-2.5 max-lg:px-[18px] max-lg:py-[15px]"
            >
              <div className="min-w-0 flex-1 text-[15px] leading-[1.5] text-nevo-near-black max-lg:text-[14.5px]">
                <span className="font-semibold text-nevo-navy">{q.otherName}</span> and{" "}
                <span className="font-semibold text-nevo-navy">{q.keptName}</span>: same subject or
                different?
              </div>
              {a && typeof a === "object" ? (
                <Settled same={a.same} q={q} />
              ) : a === "gone" ? (
                <span className="text-[13.5px] text-nevo-near-black/62">Already answered.</span>
              ) : (
                <div className="flex flex-none flex-col items-end gap-1.5 max-lg:items-start">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => answer(q, true)}
                      disabled={paused || a === "saving"}
                      className="inline-flex h-9 cursor-pointer items-center rounded-[10px] bg-nevo-navy px-4 text-[13.5px] font-semibold text-nevo-cream transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Same
                    </button>
                    <button
                      type="button"
                      onClick={() => answer(q, false)}
                      disabled={paused || a === "saving"}
                      className="inline-flex h-9 cursor-pointer items-center rounded-[10px] border-[1.5px] border-nevo-near-black/18 px-4 text-[13.5px] font-semibold text-nevo-near-black transition-colors hover:bg-nevo-cream disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Different
                    </button>
                  </div>
                  {a === "failed" ? (
                    <span role="status" className="text-[12.5px] text-nevo-near-black/62">
                      That didn&rsquo;t save, and nothing changed. Try again.
                    </span>
                  ) : null}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Settled({ same, q }: { same: boolean; q: SpellingQuestion }) {
  return (
    <div className="flex max-w-[340px] flex-none items-start gap-2.5 max-lg:max-w-full">
      <span className="flex size-6 flex-none items-center justify-center rounded-full bg-nevo-navy text-nevo-cream">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </span>
      <span className="text-[13.5px] leading-[1.5] text-nevo-near-black/78">
        {same ? (
          <>
            One subject: <strong className="font-semibold text-nevo-near-black">{q.keptName}</strong>.
            {" "}We kept the fuller spelling.
          </>
        ) : (
          <>
            Two subjects, kept exactly as your school wrote them:{" "}
            <strong className="font-semibold text-nevo-near-black">{q.otherName}</strong> and{" "}
            <strong className="font-semibold text-nevo-near-black">{q.keptName}</strong>.
          </>
        )}
      </span>
    </div>
  );
}
