"use client";

import Link from "next/link";
import { useState } from "react";
import { studentName, useClassRoster } from "@/hooks/useClassRoster";
import { useTeacherClasses } from "@/hooks/useTeacherClasses";
import { studentsApi } from "@/lib/api/students";
import { accountStatus } from "@/lib/constants/accountStatus";

/**
 * C19 B3 / B3b, "Clear PIN - one thumb" (design, 12 Oct): "Clear PIN is the
 * one that has to work with one thumb, in front of a waiting child." The page
 * a teacher's "forgot PIN" notification opens on a phone - the roster it would
 * otherwise open needs a bigger screen.
 *
 * READ FROM THE CLASS ROSTER, which is the teacher's own read and carries
 * everything the screen says: the name, the ID, whether the child asked, and
 * whether the account is switched off. The student-detail route is the
 * admin's. So the link carries its class (\`?class=\`), as the profile's does.
 *
 * Laid out for a phone, and it reads the same at any width: one column, the
 * action at the bottom of it.
 */

const BACK =
  "flex shrink-0 items-center gap-3 pb-3 text-nevo-near-black transition-transform active:scale-[0.99]";

function BackBar({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className={BACK}>
      <span className="flex size-[34px] items-center justify-center rounded-[10px] text-nevo-navy">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </span>
      <span className="truncate text-[17px] font-semibold tracking-[-0.01em]">{label}</span>
    </Link>
  );
}

const PRIMARY =
  "flex h-[54px] w-full cursor-pointer items-center justify-center rounded-[10px] bg-nevo-navy text-base font-semibold text-nevo-cream transition-[filter] hover:brightness-108 disabled:cursor-wait disabled:opacity-70";
const SECONDARY =
  "flex h-[52px] w-full cursor-pointer items-center justify-center rounded-[10px] border-[1.5px] border-nevo-navy/30 text-[15px] font-semibold text-nevo-navy transition-colors hover:bg-nevo-navy/6";

export function ClearPinScreen({
  studentId,
  classId,
}: {
  studentId: string;
  classId?: string;
}) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-[480px] flex-col px-4 pt-3 pb-6 md:pt-8">
      {classId ? (
        <WithRoster studentId={studentId} classId={classId} />
      ) : (
        // A link without its class cannot say which child this is.
        <Unavailable />
      )}
    </div>
  );
}

function Unavailable() {
  return (
    <>
      <BackBar href="/teacher/dashboard" label="Home" />
      <div className="flex flex-1 flex-col justify-center px-1.5">
        <p className="text-[15px] leading-[1.55] text-nevo-near-black/66">
          We couldn&rsquo;t load this child&rsquo;s details just now. Their
          class roster has Clear PIN too.
        </p>
        <Link href="/teacher/classes" className={`mt-6 ${SECONDARY}`}>
          Go to My Classes
        </Link>
      </div>
    </>
  );
}

function WithRoster({ studentId, classId }: { studentId: string; classId: string }) {
  const { students, loading, failed } = useClassRoster(classId);
  const { liveClasses } = useTeacherClasses();
  const className = liveClasses.find((c) => c.classId === classId)?.className;
  const back = `/teacher/classes/${classId}`;
  const backLabel = className ? `${className} · Roster` : "Roster";
  const [phase, setPhase] = useState<"ask" | "clearing" | "cleared">("ask");
  const [clearFailed, setClearFailed] = useState(false);

  const student = students.find((s) => s.studentId === studentId);

  if (loading) {
    return (
      <>
        <BackBar href={back} label={backLabel} />
        <div className="mt-4 h-[50px] w-[60%] animate-pulse rounded-[12px] bg-nevo-cream-elevated" />
      </>
    );
  }
  if (failed || !student) return <Unavailable />;

  const name = studentName(student);
  const first = student.firstName?.trim() || name.split(" ")[0] || name;
  const ids = [student.loginIdentifier, student.admissionNumber].filter(Boolean);
  const deactivated = accountStatus(student.status) === "deactivated";
  const alreadyCleared = student.pinCleared === true;

  const clear = async () => {
    if (phase === "clearing") return;
    setPhase("clearing");
    setClearFailed(false);
    try {
      await studentsApi.clearPin(studentId);
      setPhase("cleared");
    } catch {
      setClearFailed(true);
      setPhase("ask");
    }
  };

  // B3b, or a PIN somebody already cleared.
  if (phase === "cleared" || alreadyCleared) {
    return (
      <>
        <BackBar href={back} label={backLabel} />
        <div className="flex flex-1 flex-col items-center justify-center px-1.5 text-center">
          <span className="flex size-[60px] items-center justify-center rounded-full bg-nevo-navy motion-safe:animate-nevo-pop">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M5 12.5l4.2 4.2L19 7" stroke="#f7f1e6" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <h1 className="mt-6 text-[22px] font-semibold tracking-[-0.015em] text-nevo-near-black">
            {`${first}’s PIN is cleared`}
          </h1>
          <p className="mt-[11px] text-[15px] leading-[1.55] text-nevo-near-black/66">
            {`${first} chooses a new PIN at the next sign-in.`}
          </p>
        </div>
        <Link href={back} className={PRIMARY}>
          Done
        </Link>
      </>
    );
  }

  return (
    <>
      <BackBar href={back} label={backLabel} />
      <div className="flex flex-1 flex-col justify-center px-1.5">
        <div className="flex items-center gap-[13px]">
          <span className="flex size-[50px] shrink-0 items-center justify-center rounded-full bg-nevo-navy text-[17px] font-semibold text-nevo-cream">
            {name
              .split(/\s+/)
              .map((w) => w[0])
              .slice(0, 2)
              .join("")
              .toUpperCase()}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-[21px] font-semibold tracking-[-0.015em] text-nevo-near-black">
              {name}
            </h1>
            {/* Design's reference: always "Student ID / Admission Number". */}
            {ids.length > 0 && (
              <span className="mt-0.5 block text-[13px] text-nevo-near-black/60 tabular-nums">
                <span className="text-nevo-near-black/45">Student ID / Admission Number</span>{" "}
                {ids.join(" · ")}
              </span>
            )}
          </div>
        </div>

        {deactivated ? (
          /* No PIN to clear on a switched-off account: the roster's own line. */
          <p className="mt-6 rounded-[10px] bg-nevo-violet/14 px-[15px] py-[13px] text-[15px] leading-[1.55] text-nevo-near-black">
            {`${first} can’t sign in while the account is deactivated, so there’s no PIN to clear yet. Your admin manages access.`}
          </p>
        ) : (
          <>
            <p className="mt-6 text-[16px] leading-[1.55] text-nevo-near-black/82">
              {student.pinResetRequested
                ? `${first} asked for a new PIN. Clear it now and ${first} chooses one at the next sign-in.`
                : `Clear ${first}’s PIN and ${first} chooses a new one at the next sign-in.`}
            </p>
            <div className="mt-4 flex items-start gap-[11px] rounded-[10px] bg-nevo-violet/14 px-[15px] py-[13px]">
              <span className="mt-px inline-flex shrink-0 text-nevo-navy">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M3 3l18 18" />
                  <path d="M10.6 5.1A9.8 9.8 0 0 1 12 5c5 0 8.5 4.2 9.5 7-.4 1.1-1.2 2.5-2.4 3.8" />
                  <path d="M6.3 6.4C4.4 7.7 3.1 9.6 2.5 12c1 2.8 4.5 7 9.5 7 1.7 0 3.2-.5 4.5-1.2" />
                  <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
                </svg>
              </span>
              <span className="text-[14.5px] leading-[1.55] text-nevo-near-black">
                {`You won’t be able to see the new PIN. Only ${first} will know it.`}
              </span>
            </div>
            {clearFailed && (
              <p role="alert" className="mt-4 text-[14px] leading-[1.5] text-nevo-near-black/72">
                {/* The roster menu's own line for the same failure. */}
                {`We couldn’t clear ${first}’s PIN just now. Nothing has changed. Try again in a moment.`}
              </p>
            )}
          </>
        )}
      </div>

      {/* The action at the foot, where a thumb is. */}
      <div className="flex flex-col gap-2.5">
        {!deactivated && (
          <button type="button" onClick={clear} disabled={phase === "clearing"} className={PRIMARY}>
            {phase === "clearing" ? "Clearing…" : `Clear ${first}’s PIN`}
          </button>
        )}
        <Link href={back} className={SECONDARY}>
          Not now
        </Link>
      </div>
    </>
  );
}
