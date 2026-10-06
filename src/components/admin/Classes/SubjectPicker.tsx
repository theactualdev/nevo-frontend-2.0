"use client";

import { classTakes, subjectNamed, type SchoolSubject } from "@/lib/api/subjects";
import { cn } from "@/lib/utils";
import { ASSIGN_SELECT } from "./assignParts";

/**
 * The subjects a class takes (D05, SCRUM-194): chips to remove, a select to
 * add from the school's own list.
 *
 * Values are NAMES, because that is what a class stores and reads back; the
 * school list supplies the spelling to show. A name the list does not hold is
 * still shown as written - it is the class's, whatever the list says.
 *
 * No new subjects are typed here. `POST /api/v1/subjects` exists, but D05
 * draws only a pick from the list, and a free-text box is how one school ends
 * up with "Maths" and "Mathematics" as two subjects.
 */
export function SubjectPicker({
  id,
  value,
  onChange,
  subjects,
  disabled,
}: {
  id: string;
  value: string[];
  onChange: (next: string[]) => void;
  /** The school's list. Null while it is unread: nothing is offered to add. */
  subjects: SchoolSubject[] | null;
  disabled?: boolean;
}) {
  const label = (n: string) => (subjects && subjectNamed(subjects, n)?.displayName) || n;
  const addable = (subjects ?? []).filter((s) => !classTakes(value, s));

  return (
    <div>
      {value.length > 0 ? (
        <ul
          aria-label="Subjects this class takes"
          className="m-0 flex list-none flex-wrap gap-1.5 p-0"
        >
          {value.map((n) => (
            <li
              key={n}
              className="inline-flex items-center gap-1 rounded-full bg-nevo-navy/[0.09] py-1 pr-1 pl-3 text-[13px] text-nevo-navy"
            >
              {label(n)}
              <button
                type="button"
                aria-label={`Remove ${label(n)}`}
                disabled={disabled}
                onClick={() => onChange(value.filter((v) => v !== n))}
                className="flex size-6 cursor-pointer items-center justify-center rounded-full text-[15px] leading-none hover:bg-nevo-navy/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                &times;
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {subjects ? (
        <select
          id={id}
          aria-label="Add a subject"
          value=""
          disabled={disabled || addable.length === 0}
          onChange={(e) => {
            const s = subjects.find((x) => x.id === e.target.value);
            if (s) onChange([...value, s.name]);
          }}
          className={cn(ASSIGN_SELECT, value.length > 0 && "mt-2.5")}
        >
          <option value="">Add a subject</option>
          {addable.map((s) => (
            <option key={s.id} value={s.id}>
              {s.displayName}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}
