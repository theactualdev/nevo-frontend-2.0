"use client";

import { useEffect, useState } from "react";
import { ApiError, apiErrorMessage } from "@/lib/api/client";
import { subjectsApi, type SchoolSubject } from "@/lib/api/subjects";
import { teachersApi, type TeacherDetail } from "@/lib/api/teachers";
import { ReadFailed } from "../ReadFailed";
import { SubjectPicker } from "../Classes/SubjectPicker";
import { FailureLine, GHOST_BTN, PRIMARY_BTN } from "../Roster/primitives";

/**
 * What a teacher teaches, on their own page (`PUT /teachers/{id}/subjects`,
 * 9 Oct).
 *
 * NO FRAME DRAWS THIS, and it is built from the one that is closest: D05's
 * "Subjects this class takes" on class detail - the same picker, a draft, an
 * explicit Save. Raised with design. The reason it cannot wait: since
 * SCRUM-194 D05's assign sheet offers only the subjects a teacher holds, and
 * until now nothing let an admin give a teacher a subject - so a teacher with
 * none, or without the one a class needs, could not be assigned at all.
 *
 * THE PUT REPLACES THE LIST, as the class one does, so each add or remove is
 * not its own write. Removing a subject the teacher is still assigned to is
 * refused by the server ("that would leave an assignment naming a subject its
 * teacher does not hold"); the refusal is shown in its own words and the
 * draft is kept.
 *
 * Names, not ids: the PUT takes names, and `TeacherDetail.subjects` reads them
 * back as names. The school list supplies the spelling shown.
 */
export function TeacherSubjects({
  teacher,
  editable,
  onSaved,
}: {
  teacher: TeacherDetail;
  /** Removed teachers, and setup-paused schools, read only. */
  editable: boolean;
  onSaved: () => void;
}) {
  const held = teacher.subjects ?? [];
  const [subjects, setSubjects] = useState<SchoolSubject[] | null>(null);
  const [read, setRead] = useState<"loading" | "ready" | "failed">("loading");
  const [draft, setDraft] = useState<string[]>(held);
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

  const dirty = draft.join("\u0000") !== held.join("\u0000");

  const save = () => {
    setPhase("saving");
    setNote(null);
    teachersApi
      .setSubjects(teacher.id, draft)
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
        Assigning {teacher.name} to a class offers these subjects. A subject
        they still teach in a class stays until that class has someone else
        for it.
      </p>
      <div className="mt-3.5">
        <SubjectPicker
          id={`teacher-subjects-${teacher.id}`}
          listLabel={`Subjects ${teacher.name} teaches`}
          value={draft}
          onChange={setDraft}
          subjects={read === "ready" ? subjects : null}
          disabled={!editable || phase === "saving"}
        />
        {read === "failed" ? (
          <ReadFailed className="mt-2" what="your school's subject list" onRetry={load} />
        ) : null}
        {held.length === 0 && draft.length === 0 ? (
          <p className="m-0 mt-2.5 text-[13px] leading-[1.5] text-nevo-near-black/55">
            None on record yet.
          </p>
        ) : null}
      </div>
      {dirty || phase === "failed" ? (
        <div className="mt-3.5 flex flex-wrap items-center gap-3">
          {phase === "failed" ? (
            <FailureLine>
              {note ?? `That didn’t save. ${teacher.name}’s subjects are as they were.`}
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
              setDraft(held);
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
