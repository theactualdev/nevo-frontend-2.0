"use client";

import Link from "next/link";
import type { Escalation } from "@/lib/api/escalations";
import { cn } from "@/lib/utils";
import { CARD, PRIMARY_BTN, SectionHeading } from "../Roster/primitives";
import { withBack } from "../back";

/**
 * D8's "Escalated by a teacher" - above Nevo's own flags, because "a teacher's
 * escalation carries a human concern".
 *
 * Each card is the child, their class, who raised it and when, and the
 * teacher's own words in quotes. The two actions D8 draws, plus "Mark as seen":
 * acknowledging is what tells the teacher learning support saw it (SCRUM-247),
 * so the loop needs a way to close. Only a Learning Support holder can, and
 * without the role the controls stay, switched off, beside the screen's one
 * line saying why.
 *
 * A failed read says so rather than drawing an empty section: "no teacher has
 * raised a concern" is the most damaging thing this screen could get wrong.
 */

const BACK = { href: "/admin/senco", label: "Learning Support" };

export function TeacherConcerns({
  open,
  complete,
  failed,
  studentName,
  describeClass,
  teacherName,
  when,
  lacksRole,
  acking,
  onAcknowledge,
  onRetry,
}: {
  /** The concerns nobody has marked as seen yet, newest first. */
  open: Escalation[];
  /** Whether the read reached every concern, so a count is a total. */
  complete: boolean;
  failed: boolean;
  studentName: (e: Escalation) => string;
  describeClass: (studentId: string) => string | null;
  /** The teacher who raised it, or null when the staff list can't name them. */
  teacherName: (teacherId: string) => string | null;
  when: (iso: string) => string;
  lacksRole: boolean;
  /** The concern or flag being marked as seen, if any. */
  acking: string | null;
  onAcknowledge: (id: string) => void;
  onRetry: () => void;
}) {
  if (failed) {
    return (
      <div className={cn(CARD, "mt-6 px-[26px] py-7")}>
        <h3 className="m-0 text-[17px] font-semibold text-nevo-near-black">
          We couldn&rsquo;t read teachers&rsquo; concerns just now
        </h3>
        <p className="mt-2 max-w-[56ch] text-sm leading-[1.55] text-nevo-near-black/62">
          So we can&rsquo;t tell you none are waiting. Try again in a moment.
        </p>
        <button type="button" onClick={onRetry} className={cn(PRIMARY_BTN, "mt-5")}>
          Try again
        </button>
      </div>
    );
  }
  if (open.length === 0) return null;

  return (
    <section aria-label="Escalated by a teacher">
      <div className="mt-7 flex items-center gap-2.5">
        <SectionHeading>Escalated by a teacher</SectionHeading>
        {/* A floor is never shown as a total. */}
        {complete ? (
          <span className="rounded-full bg-nevo-violet/24 px-[9px] py-0.5 text-[12.5px] font-semibold text-nevo-navy">
            {open.length}
          </span>
        ) : null}
      </div>
      <div className="mt-3.5 flex flex-col gap-3.5">
        {open.map((e) => {
          const name = studentName(e);
          const cls = describeClass(e.studentId);
          const by = teacherName(e.teacherId);
          const meta = [by ? `escalated by ${by}` : "escalated by a teacher", when(e.generatedAt)]
            .filter(Boolean)
            .join(" · ");
          return (
            <article
              key={e.id}
              className={cn(CARD, "relative flex gap-[18px] py-5 pl-7 pr-6")}
            >
              <span
                aria-hidden
                className="absolute bottom-4 left-0 top-4 w-[3px] rounded-full bg-nevo-violet"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <span className="text-[16.5px] font-semibold tracking-[-0.01em] text-nevo-near-black">
                    {name}
                  </span>
                  {cls ? <span className="text-[13px] text-nevo-near-black/50">{cls}</span> : null}
                  <span className="text-[12.5px] text-nevo-near-black/55">· {meta}</span>
                </div>
                <p className="m-0 mt-[9px] max-w-[600px] text-[15px] leading-[1.6] text-nevo-near-black/82">
                  &ldquo;{e.note}&rdquo;
                </p>
                <div className="mt-[15px] flex flex-wrap items-center gap-[18px]">
                  {lacksRole ? (
                    <button
                      type="button"
                      disabled
                      aria-describedby="ack-needs-learning-support"
                      className="cursor-not-allowed text-sm font-semibold text-nevo-near-black/45"
                    >
                      Start a progress report
                    </button>
                  ) : (
                    <Link
                      href={withBack(`/admin/senco/export?student=${encodeURIComponent(e.studentId)}`, BACK)}
                      className="inline-flex items-center gap-[7px] text-sm font-semibold text-nevo-navy hover:opacity-75"
                    >
                      Start a progress report
                      <span aria-hidden>&rarr;</span>
                    </Link>
                  )}
                  <Link
                    href={withBack(`/admin/senco/${e.studentId}`, BACK)}
                    className="text-sm text-nevo-near-black/55 hover:text-nevo-near-black/80"
                  >
                    Open profile
                  </Link>
                  <button
                    type="button"
                    onClick={() => onAcknowledge(e.id)}
                    disabled={acking !== null || lacksRole}
                    aria-describedby={lacksRole ? "ack-needs-learning-support" : undefined}
                    className="cursor-pointer text-sm font-semibold text-nevo-near-black/55 transition-opacity hover:text-nevo-near-black/80 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {acking === e.id ? "Marking…" : "Mark as seen"}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
