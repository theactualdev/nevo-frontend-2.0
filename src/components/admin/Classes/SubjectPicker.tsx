"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  subjectNamed,
  subjectsApi,
  type CanonicalSubject,
  type SchoolSubject,
} from "@/lib/api/subjects";
import { cn } from "@/lib/utils";

/**
 * The subject picker (design's "Nevo Admin Subject Picker", f0d22db, 28 Sep;
 * D05, SCRUM-194). A class's subjects use it, and so do a teacher's.
 *
 * A search field with the chosen subjects as pills inside it. Opening it lists
 * Nevo's subjects and the school's own together, each with a tick; typing
 * narrows the list, and a name nothing matches can be added as written.
 *
 * THIS USED TO BE A SELECT OF THE SCHOOL'S OWN LIST ONLY, so a subject the
 * school's files never mentioned - Further Mathematics, say - could not go on a
 * class at all, and since SCRUM-194 nobody could be assigned to teach it. Its
 * comment said D05 draws only a pick from the list; this frame, drawn for
 * exactly this, was missed.
 *
 * VALUES ARE NAMES, and nothing is written from here. A class and a teacher
 * both save their subjects as names, and the server settles each name on Save:
 * one of Nevo's becomes that subject, a second spelling of one the school
 * already has folds into it (and is asked about on Classes), and anything else
 * becomes the school's own, pending review. So adding is part of the draft the
 * admin saves on purpose, not a write of its own - and the "Maths and
 * Mathematics" worry the old comment had is the server's fold, not a reason to
 * stop a school entering its own subject.
 *
 * Nevo's list is read when the picker appears. Unread or unreadable, the
 * school's own list is offered alone - nothing is made up in its place.
 */

/** Nevo's list. Unreadable, it is no list at all - never a made-up one. */
function readCatalogue(): Promise<CanonicalSubject[]> {
  return Promise.resolve()
    .then(() => subjectsApi.canonical())
    .then((rows) => (Array.isArray(rows) ? rows : []))
    .catch(() => []);
}

interface Option {
  key: string;
  /** What the row reads. */
  label: string;
  /** The name the value carries when it is picked. */
  name: string;
  /** Every spelling it answers to, for search and for "already chosen". */
  spellings: string[];
}

function fold(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

export function SubjectPicker({
  id,
  listLabel = "Subjects this class takes",
  value,
  onChange,
  subjects,
  disabled,
}: {
  id: string;
  /** What the pills are, for a screen reader. */
  listLabel?: string;
  value: string[];
  onChange: (next: string[]) => void;
  /** The school's list. Null while it is unread: nothing is offered to add. */
  subjects: SchoolSubject[] | null;
  disabled?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [catalogue, setCatalogue] = useState<CanonicalSubject[]>([]);

  useEffect(() => {
    let alive = true;
    readCatalogue().then((rows) => {
      if (alive) setCatalogue(rows);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Closes on a press anywhere outside, as a menu does.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) {
        setOpen(false);
        setQ("");
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  /** The school's own first, then Nevo's the school does not hold yet. */
  const options = useMemo<Option[]>(() => {
    const own: Option[] = (subjects ?? []).map((s) => ({
      key: `s-${s.id}`,
      label: s.displayName,
      name: s.name,
      spellings: [s.name, s.displayName],
    }));
    const held = new Set(own.flatMap((o) => o.spellings.map(fold)));
    const nevo: Option[] = catalogue
      .filter((c) => !held.has(fold(c.displayName)))
      .map((c) => ({
        key: `c-${c.id}`,
        label: c.displayName,
        name: c.displayName,
        spellings: [c.displayName],
      }));
    return [...own, ...nevo].sort((a, b) => a.label.localeCompare(b.label, "en-GB"));
  }, [subjects, catalogue]);

  const label = (n: string) => (subjects && subjectNamed(subjects, n)?.displayName) || n;
  const chosen = (o: Option) => value.some((v) => o.spellings.some((s) => fold(s) === fold(v)));

  const qTrim = q.trim().replace(/\s+/g, " ");
  const ql = fold(q);
  const rows = ql ? options.filter((o) => o.spellings.some((s) => fold(s).includes(ql))) : options;
  // Nothing to add when the name is one the list or the pills already hold.
  const exact =
    options.some((o) => o.spellings.some((s) => fold(s) === ql)) || value.some((v) => fold(v) === ql);
  const canAdd = Boolean(qTrim) && !exact;

  function close() {
    setOpen(false);
    setQ("");
  }

  const toggle = (o: Option) => {
    if (chosen(o)) {
      const names = new Set(o.spellings.map(fold));
      onChange(value.filter((v) => !names.has(fold(v))));
    } else {
      onChange([...value, o.name]);
    }
  };

  const add = () => {
    if (!canAdd) return;
    onChange([...value, qTrim]);
    setQ("");
    input.current?.focus();
  };

  const listHead = ql
    ? rows.length
      ? "Matching subjects"
      : `Subjects matching “${qTrim}”`
    : "All subjects";

  return (
    <div ref={root} className="relative">
      <div
        onClick={() => {
          if (disabled || !subjects) return;
          setOpen(true);
          input.current?.focus();
        }}
        className={cn(
          "flex min-h-[50px] cursor-text flex-wrap items-center gap-1.5 rounded-[10px] bg-nevo-cream px-[9px] py-[7px] transition-colors",
          open ? "border-2 border-nevo-navy" : "border-[1.5px] border-nevo-near-black/16",
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        {value.length > 0 ? (
          <ul aria-label={listLabel} className="m-0 contents list-none p-0">
            {value.map((n) => (
              <li
                key={n}
                className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-nevo-navy/12 py-[5px] pr-[5px] pl-3 text-[13.5px] font-semibold text-nevo-navy"
              >
                {label(n)}
                <button
                  type="button"
                  aria-label={`Remove ${label(n)}`}
                  disabled={disabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(value.filter((v) => v !== n));
                  }}
                  className="flex size-5 cursor-pointer items-center justify-center rounded-full hover:bg-nevo-navy/16 disabled:cursor-not-allowed"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {subjects ? (
          <input
            ref={input}
            id={id}
            type="text"
            role="combobox"
            aria-label="Add a subject"
            aria-expanded={open}
            aria-controls={panelId}
            autoComplete="off"
            value={q}
            disabled={disabled}
            placeholder={value.length ? "Add another subject" : "Search subjects"}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                close();
              } else if (e.key === "Enter") {
                // Never submits the form round it. One match is picked; a
                // name nothing matches is added as written.
                e.preventDefault();
                if (rows.length === 1 && !chosen(rows[0])) {
                  toggle(rows[0]);
                  setQ("");
                } else if (canAdd && rows.length === 0) {
                  add();
                }
              }
            }}
            className="h-[34px] min-w-[90px] flex-[1_1_110px] border-none bg-transparent px-1 text-[15px] text-nevo-near-black outline-none placeholder:text-nevo-near-black/50 disabled:cursor-not-allowed"
          />
        ) : null}
      </div>

      {open && subjects ? (
        <div
          id={panelId}
          className="absolute top-full right-0 left-0 z-20 mt-1.5 min-w-[260px] overflow-hidden rounded-xl bg-nevo-cream-elevated shadow-[0_8px_32px_rgba(0,0,0,0.16)]"
        >
          <div className="px-3.5 pt-2.5 pb-1 text-[11.5px] font-semibold tracking-[0.05em] text-nevo-near-black/50 uppercase">
            {listHead}
          </div>
          <div className="max-h-[248px] overflow-y-auto pb-1.5">
            {rows.map((o) => {
              const on = chosen(o);
              return (
                <button
                  key={o.key}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => toggle(o)}
                  className="flex w-full cursor-pointer items-center gap-[11px] px-3.5 py-2.5 text-left text-[14.5px] text-nevo-near-black hover:bg-nevo-navy/6"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-5 flex-none items-center justify-center rounded-[6px]",
                      on ? "bg-nevo-navy text-nevo-cream" : "border-[1.5px] border-nevo-near-black/28",
                    )}
                  >
                    {on ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12.5l4.5 4.5L19 7.5" />
                      </svg>
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-auto">{o.label}</span>
                </button>
              );
            })}
            {canAdd ? (
              <button
                type="button"
                onClick={add}
                className="flex w-full cursor-pointer items-center gap-[11px] px-3.5 py-2.5 text-left text-[14.5px] text-nevo-near-black hover:bg-nevo-navy/6"
              >
                <span aria-hidden className="flex size-5 flex-none items-center justify-center rounded-[6px] bg-nevo-navy/12 text-nevo-navy">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </span>
                <span className="min-w-0 flex-auto">
                  Add <strong className="font-semibold">{qTrim}</strong>
                </span>
              </button>
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-nevo-near-black/8 py-2.5 pr-3 pl-3.5">
            <span className="text-[13px] text-nevo-near-black/60">
              {value.length === 0 ? "None selected yet" : `${value.length} selected`}
            </span>
            <button
              type="button"
              onClick={close}
              className="inline-flex cursor-pointer items-center rounded-[10px] bg-nevo-navy px-3.5 py-[7px] text-[13.5px] font-semibold text-nevo-cream transition-[filter] hover:brightness-110"
            >
              Done
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
