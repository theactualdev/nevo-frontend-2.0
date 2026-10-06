"use client";

import { useEffect, useState } from "react";
import { classesApi, type AdminClass } from "@/lib/api/classes";
import { ApiError, apiErrorMessage } from "@/lib/api/client";
import { subjectsApi, type SchoolSubject } from "@/lib/api/subjects";
import { ReadFailed } from "../ReadFailed";
import { FailureLine, GHOST_BTN, PRIMARY_BTN } from "../Roster/primitives";
import { SubjectPicker } from "./SubjectPicker";

/**
 * D05's "Subjects this class takes", on class detail.
 *
 * WHY IT IS ON THE PAGE AND NOT IN A SHEET. Since SCRUM-194 a teacher can only
 * be assigned a subject the class takes - so a class with no subjects is a
 * class nobody can be assigned to, and the place to fix it is where the admin
 * finds that out.
 *
 * A draft, saved on purpose. The PATCH replaces the whole list, so each
 * add or remove is not its own write; Save sends the list as it stands.
 */
export function ClassSubjects({
  klass,
  editable,
  onSaved,
}: {
  klass: AdminClass;
  /** Archived classes, and setup-paused schools, read only. */
  editable: boolean;
  onSaved: () => void;
}) {
  const [subjects, setSubjects] = useState<SchoolSubject[] | null>(null);
  const [read, setRead] = useState<"loading" | "ready" | "failed">("loading");
  const [draft, setDraft] = useState<string[]>(klass.subjects);
  const [phase, setPhase] = useState<"idle" | "saving" | "failed">("idle");
  const [note, setNote] = useState<string | null>(null);

  const fetchSubjects = () =>
    subjectsApi
      .list()
      .then((s) => {
        setSubjects(s);
        setRead("ready");
      })
      .catch(() => setRead("failed"));
  const load = () => {
    setRead("loading");
    fetchSubjects();
  };
  useEffect(() => {
    fetchSubjects();
  }, []);

  const dirty = draft.join("\u0000") !== klass.subjects.join("\u0000");

  const save = () => {
    setPhase("saving");
    setNote(null);
    classesApi
      // Name and year group ride along: the PATCH writes the year group from
      // the body every time, so leaving it out would clear it.
      .update(klass.id, { name: klass.name, yearGroup: klass.yearGroup, subjects: draft })
      .then(() => {
        setPhase("idle");
        onSaved();
      })
      .catch((err: unknown) => {
        setNote(err instanceof ApiError ? apiErrorMessage(err.detail) : null);
        setPhase("failed");
      });
  };

  return (
    <div>
      <p className="m-0 max-w-[62ch] text-[13.5px] leading-[1.55] text-nevo-near-black/62">
        Add one the class was missing, or remove one it doesn&rsquo;t take.
        Removing a subject keeps its lessons; it only stops new ones being set
        here.
      </p>
      <div className="mt-3.5">
        <SubjectPicker
          id={`class-subjects-${klass.id}`}
          value={draft}
          onChange={setDraft}
          subjects={read === "ready" ? subjects : null}
          disabled={!editable || phase === "saving"}
        />
        {read === "failed" ? (
          <ReadFailed className="mt-2" what="your school's subject list" onRetry={load} />
        ) : null}
      </div>
      {dirty || phase === "failed" ? (
        <div className="mt-3.5 flex flex-wrap items-center gap-3">
          {phase === "failed" ? (
            <FailureLine>
              {note ?? "That didn’t save. The class’s subjects are as they were."}
            </FailureLine>
          ) : null}
          <button
            type="button"
            onClick={save}
            disabled={!editable || phase === "saving" || !dirty}
            className={PRIMARY_BTN}
          >
            {phase === "saving" ? "Saving…" : "Save subjects"}
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(klass.subjects);
              setPhase("idle");
              setNote(null);
            }}
            disabled={phase === "saving"}
            className={GHOST_BTN}
          >
            Cancel
          </button>
        </div>
      ) : null}
    </div>
  );
}
