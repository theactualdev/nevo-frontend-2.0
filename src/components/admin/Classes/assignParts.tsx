"use client";

import type { AssignedTeacher, TeacherAssignmentRole } from "@/lib/api/classes";
import { cn } from "@/lib/utils";
import { CheckIcon } from "../Roster/primitives";

/**
 * The parts of D05's assign sheet - the role cards, the primary notice and the
 * shared styles - kept in one place since SCRUM-40 asked that both doors (class
 * detail and teacher detail) word the same write identically. Both doors open
 * the one sheet now (`AssignTeachingSheet`); these stay separate because the
 * class form uses the styles too.
 */

export const ASSIGN_LABEL =
  "mb-[7px] block text-[12.5px] font-semibold text-nevo-near-black/60";

export const ASSIGN_SELECT =
  "h-[50px] w-full cursor-pointer rounded-[10px] border-[1.5px] border-nevo-near-black/16 bg-nevo-cream px-[15px] text-[15px] text-nevo-near-black outline-none transition-colors focus:border-nevo-navy";

export const ASSIGN_HINT = "mt-2 text-[12.5px] leading-[1.5] text-nevo-near-black/55";

const ROLES: {
  value: TeacherAssignmentRole;
  title: string;
  detail: string;
}[] = [
  {
    value: "co_teacher",
    title: "Co-teacher",
    detail: "Sees the class and supports; the primary teacher leads.",
  },
  {
    value: "primary",
    title: "Primary teacher",
    detail: "Leads the class. Only one primary per class.",
  },
];

/** How an assigned teacher is named in the notice and the failure line. */
export function assignedName(a: AssignedTeacher): string {
  return (
    [a.firstName, a.lastName].filter(Boolean).join(" ").trim() ||
    a.email ||
    "the current primary teacher"
  );
}

export function RoleField({
  role,
  onChange,
  legend = "Role in this class",
}: {
  role: TeacherAssignmentRole | null;
  onChange: (role: TeacherAssignmentRole) => void;
  /** D05: "Role in JSS 2A". */
  legend?: string;
}) {
  return (
    <fieldset className="border-none p-0">
      <legend className={ASSIGN_LABEL}>{legend}</legend>
      <div className="flex flex-col gap-2.5">
        {ROLES.map((r) => {
          const selected = role === r.value;
          return (
            <button
              key={r.value}
              type="button"
              onClick={() => onChange(r.value)}
              aria-pressed={selected}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-xl bg-nevo-cream-elevated px-4 py-[15px] text-left transition-colors",
                selected
                  ? "border-2 border-nevo-navy bg-nevo-navy/[0.06]"
                  : "border-[1.5px] border-nevo-near-black/14",
              )}
            >
              <span className="flex-1">
                <span className="block text-[15px] font-semibold text-nevo-near-black">
                  {r.title}
                </span>
                <span className="block text-[13px] leading-[1.45] text-nevo-near-black/62">
                  {r.detail}
                </span>
              </span>
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-6 flex-none items-center justify-center rounded-full",
                  selected
                    ? "bg-nevo-navy text-nevo-cream"
                    : "border-2 border-nevo-near-black/22",
                )}
              >
                {selected ? <CheckIcon /> : null}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/*
 * SCRUM-40's line, whole: "Ms. Adeyemi is Primary for JSS 2A right now. Making
 * Mr. Bello Primary moves her to Co-teacher; SHE KEEPS THE CLASS AND HER
 * NOTES." The last clause is the half an admin hesitates over - whether they
 * are about to take something off a colleague.
 */
export function PrimaryConflictNotice({
  primaryName,
  className,
  teacherName,
}: {
  primaryName: string;
  className: string;
  teacherName: string | undefined;
}) {
  return (
    <p className="m-0 rounded-[10px] bg-nevo-violet/24 px-4 py-3 text-[13.5px] leading-[1.5] text-nevo-navy">
      {primaryName} is the primary teacher for {className}. Making{" "}
      {teacherName ?? "this teacher"} primary moves {primaryName} to
      co-teacher; they keep the class and their notes.
    </p>
  );
}
