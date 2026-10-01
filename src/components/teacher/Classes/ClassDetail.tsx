"use client";

import Link from "next/link";
import { useState } from "react";
import {
  type StudentStatus,
  type TeacherClass,
} from "@/lib/mocks/teacherClasses";
import {
  CLASS_OBSERVATIONS,
  OBSERVATIONS_LABEL,
  OBSERVATIONS_SUBTITLE,
} from "@/lib/mocks/teacherIntelligence";
import { cn } from "@/lib/utils";
import { ClassQrDialog, ClassQrScreen } from "./ClassQr";

/**
 * Class detail (C05 / `Nevo Teacher Classes` frame): back link, class header
 * with the glance/flag legend, and the Roster / Lessons / Activity pill tabs.
 * The Roster tab renders the C16b Student Observations rows in place of the
 * old plain list: name + seat, plain-language observation chips, and a
 * profile link. Worth a glance = violet dot + violet rail; a sudden change =
 * the navy triangle glyph + navy rail (C16b draws the triangle, not the C05
 * drop - flagged to design).
 */

/**
 * TWO TABS, matching what the product actually ships.
 *
 * This drew three while the live screen drew none, so a stakeholder shown the
 * signed-out walkthrough was promised an Activity feed that does not exist and
 * is not coming. Design, 16 Sep: "a sample screen is a promise, so either it
 * matches what we ship or it changes", and separately that a per-class activity
 * feed "is a surveillance surface by default and we have nothing that needs
 * it." So Activity is removed here rather than built there.
 */
const TABS = ["Roster", "Lessons"] as const;
type Tab = (typeof TABS)[number];

function statusDotClass(status: StudentStatus, small = false): string {
  return cn(
    "shrink-0 rounded-full",
    small ? "size-[9px]" : "size-[11px]",
    status === "glance" && "bg-nevo-violet",
    status === "flag" &&
      (small
        ? "border-2 border-nevo-navy bg-transparent"
        : "border-[2.5px] border-nevo-navy bg-transparent"),
    status === "ok" && "bg-nevo-navy/28",
  );
}

/** C16b sudden-change mark - the frame's triangle, paths verbatim. */
const SUDDEN_GLYPH = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 3v6M12 15h.01" />
    <path d="M4.5 20h15L12 5z" />
  </svg>
);

/** Student profile route id, e.g. "Tunde Adeyemi" -> "tunde-adeyemi". */
function studentHref(name: string): string {
  return `/teacher/students/${name.toLowerCase().replace(/\s+/g, "-")}`;
}

export function ClassDetail({
  klass,
  withCode = true,
}: {
  klass: TeacherClass;
  /**
   * Whether the Class code control is offered. Off for a signed-in teacher
   * looking at a SAMPLE class: a projected join code is the one thing on this
   * console a room of children physically acts on, and `ClassCodeRoute`
   * already refuses a fixture code for exactly that reason. A sample mark
   * does not stop anyone scanning it.
   */
  withCode?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("Roster");
  // C12: the dialog is the entry point; projection is the same code, room-sized.
  const [qr, setQr] = useState<"none" | "dialog" | "screen">("none");
  // This screen renders only while there is no live class list - a real class
  // goes to `LiveClassDetail` instead - so everything here, the join code
  // included, is the fixture's own. Nothing live is merged in.
  const joinCode = klass.joinCode;

  const glanceCount = klass.roster.filter((r) => r.status === "glance").length;
  const flagCount = klass.roster.filter((r) => r.status === "flag").length;

  return (
    <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
      <div className="mx-auto max-w-[880px]">
        <Link
          href="/teacher/classes"
          className="inline-flex cursor-pointer items-center gap-[7px] text-sm text-nevo-near-black/60 transition-transform active:scale-[0.99]"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 6l-6 6 6 6" />
          </svg>
          My Classes
        </Link>

        <div className="mt-4 flex flex-wrap items-end justify-between gap-5">
          <div>
            <h2 className="text-[23px] font-semibold tracking-[-0.015em] text-nevo-near-black xl:text-[26px]">
              {klass.name}
            </h2>
            <span className="mt-[5px] block text-[14.5px] text-nevo-near-black/60">
              {`${klass.subjects} · ${klass.count} students`}
            </span>
          </div>
          {withCode && (
          <button
            type="button"
            onClick={() => setQr("dialog")}
            className="inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-[10px] border-[1.5px] border-nevo-navy/35 px-4 text-sm font-medium text-nevo-navy transition-colors hover:bg-nevo-navy/6"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="3" width="7" height="7" rx="1.5" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" />
              <path d="M14 14h3v3h-3zM20 14h1M14 20h3M20 20h1" />
            </svg>
            Class code
          </button>
          )}
          {(glanceCount > 0 || flagCount > 0) && (
            <div className="flex gap-4">
              {glanceCount > 0 && (
                <div className="flex items-center gap-[7px]">
                  <span className={statusDotClass("glance", true)} />
                  <span className="text-[13.5px] text-nevo-near-black/65">
                    {glanceCount} worth a glance
                  </span>
                </div>
              )}
              {flagCount > 0 && (
                <div className="flex items-center gap-[7px]">
                  <span className={statusDotClass("flag", true)} />
                  <span className="text-[13.5px] text-nevo-near-black/65">
                    {flagCount} flagged
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-[22px] flex gap-2.5">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "cursor-pointer rounded-full px-[15px] py-2 text-[13.5px] font-medium transition-[transform,background-color] active:scale-[0.99]",
                tab === t
                  ? "bg-nevo-navy text-nevo-cream"
                  : "border border-nevo-near-black/8 bg-nevo-cream-elevated text-nevo-near-black/70",
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "Roster" && (
          <>
            <h3 className="mt-[22px] block text-[11px] font-bold tracking-[0.14em] text-nevo-violet uppercase xl:mt-[26px]">
              {OBSERVATIONS_LABEL}
            </h3>
            <p className="mt-2 text-[13px] text-nevo-near-black/60">
              {OBSERVATIONS_SUBTITLE}
            </p>
            <div className="mt-3.5 flex flex-col gap-2 xl:mt-4">
              {klass.roster.map((student) => {
                const obs = CLASS_OBSERVATIONS[klass.id]?.[student.name];
                return (
                  <Link
                    key={student.name}
                    href={studentHref(student.name)}
                    className={cn(
                      "flex cursor-pointer flex-col rounded-[12px] bg-nevo-cream-elevated px-[18px] py-4 shadow-elevation-1 transition-[filter] hover:brightness-[0.985] xl:flex-row xl:items-center xl:gap-4 xl:p-5",
                      student.status === "glance" &&
                        "border-l-[3px] border-nevo-violet",
                      student.status === "flag" &&
                        "border-l-[3px] border-nevo-navy",
                    )}
                  >
                    <div className="flex items-center gap-2 xl:w-[26%] xl:shrink-0">
                      {student.status === "glance" && (
                        <span className="size-2 shrink-0 rounded-full bg-nevo-violet" />
                      )}
                      {student.status === "flag" && (
                        <span className="shrink-0 text-nevo-navy">
                          {SUDDEN_GLYPH}
                        </span>
                      )}
                      <div className="flex min-w-0 flex-1 items-baseline gap-1.5 xl:flex-col xl:gap-0">
                        <span className="truncate text-[15px] font-semibold text-nevo-navy">
                          {student.name}
                        </span>
                        {obs && (
                          <span className="shrink-0 text-[12px] text-nevo-near-black/55 xl:mt-0.5">
                            <span className="xl:hidden">{"· "}</span>
                            {`Seat ${obs.seat}`}
                          </span>
                        )}
                      </div>
                      <span className="shrink-0 text-[13px] whitespace-nowrap text-nevo-violet xl:hidden">
                        View profile
                      </span>
                    </div>
                    {obs && obs.chips.length > 0 && (
                      <div className="mt-2.5 flex min-w-0 flex-wrap gap-2 xl:mt-0 xl:flex-1">
                        {obs.chips.map((chip) => (
                          <span
                            key={chip}
                            className="inline-flex min-h-7 items-center rounded-[20px] bg-nevo-cream-inset px-3 py-[5px] text-[12px] text-nevo-near-black"
                          >
                            {chip}
                          </span>
                        ))}
                      </div>
                    )}
                    <span className="hidden shrink-0 text-[13px] whitespace-nowrap text-nevo-violet xl:inline">
                      View profile
                    </span>
                  </Link>
                );
              })}
            </div>
            <div className="mt-4 flex gap-5 text-[12px] text-nevo-near-black/55">
              <span className="flex items-center gap-[7px]">
                <span className="size-2 shrink-0 rounded-full bg-nevo-violet" />
                Worth a glance
              </span>
              <span className="flex items-center gap-[7px]">
                <span className="shrink-0 text-nevo-navy">{SUDDEN_GLYPH}</span>
                <span>
                  Sudden change
                  <span className="hidden xl:inline">
                    {" - read the profile"}
                  </span>
                </span>
              </span>
            </div>
          </>
        )}

        {tab === "Lessons" && (
          <div className="mt-4 overflow-hidden rounded-[12px] bg-nevo-cream-elevated shadow-elevation-1">
            {klass.lessons.map((lesson, i) => (
              <Link
                key={lesson.title}
                href={lesson.href}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-4 px-[22px] py-4 transition-[filter] hover:brightness-[0.985]",
                  i < klass.lessons.length - 1 &&
                    "border-b border-nevo-near-black/7",
                )}
              >
                <div className="flex min-w-0 flex-col">
                  <span className="text-[15.5px] font-semibold text-nevo-near-black">
                    {lesson.title}
                  </span>
                  <span className="mt-[3px] text-[13px] text-nevo-near-black/55">
                    {lesson.meta}
                  </span>
                </div>
                <span className="shrink-0 text-[13.5px] text-nevo-near-black/60">
                  {lesson.status}
                </span>
              </Link>
            ))}
          </div>
        )}

      </div>

      {withCode && qr === "dialog" && (
        <ClassQrDialog
          className={klass.name}
          code={joinCode}
          onClose={() => setQr("none")}
          onProject={() => setQr("screen")}
        />
      )}
      {withCode && qr === "screen" && (
        <ClassQrScreen
          className={klass.name}
          code={joinCode}
          onClose={() => setQr("none")}
        />
      )}
    </div>
  );
}
