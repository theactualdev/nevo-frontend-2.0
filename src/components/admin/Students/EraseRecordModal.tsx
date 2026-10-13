"use client";

import { useState } from "react";
import { studentsApi } from "@/lib/api/students";
import { cn } from "@/lib/utils";
import {
  FailureLine,
  GHOST_BTN,
  Modal,
  PRIMARY_BTN,
  Spinner,
} from "../Roster/primitives";

/**
 * D7c step two of two - erase a record permanently.
 *
 * This is the ONLY permanent deletion anywhere in the admin set, and the spec
 * fences it in three ways: it is reachable only once a student is already
 * deactivated, it is a second step in a second sitting, and it is gated on
 * their name typed exactly. SEVERITY COMES FROM FRICTION, NOT FROM COLOUR -
 * there is no red here, the same as everywhere else.
 *
 * The copy is careful about two things a school will be asked later: that a
 * small amount is retained for a statutory period, and that teachers' notes
 * survive with the name removed. Both are stated before the commit.
 *
 * TODO(api): the frame quotes the retention deadline as a real date ("until
 * 24 October 2026"). Nothing returns one. `DELETE /api/v1/students/{id}` is a
 * 204 with no body, and no route carries a per-student erasure deadline.
 *
 * THE LAST SENTENCE HERE WAS AN INVITATION TO WIRE THE WRONG FIELD. It read:
 * "`GET /api/v1/school` does carry `retentionDays`, which is the field this
 * should read once someone confirms it means this." It carries `retentionDays`
 * AND `retentionPolicy`, both required - but that is a DIFFERENT CLOCK.
 * `retentionPolicy` is `contract | contract_plus_3_years |
 * contract_plus_7_years`, anchored to the school's contract, and Settings
 * already renders that pair as the deactivation-to-deletion window. This modal
 * is about the statutory residue that survives an erasure of one child. Same
 * word, different span. Reading the school's number here would put a confident
 * date on a legal claim it does not describe, which on this screen is the
 * expensive mistake - so the copy still states the fact and invents no date.
 */

type Phase = "idle" | "erasing" | "failed";

export function EraseRecordModal({
  studentId,
  studentName,
  onClose,
  onErased,
}: {
  studentId: string;
  studentName: string;
  onClose: () => void;
  onErased: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [touched, setTouched] = useState(false);

  const firstName = studentName.split(" ").filter(Boolean)[0] ?? studentName;
  const matches = typed.trim() === studentName.trim();
  const mismatch = touched && typed.trim().length > 0 && !matches;

  const erase = () => {
    if (!matches) return;
    setPhase("erasing");
    studentsApi
      .erase(studentId)
      .then(onErased)
      .catch(() => setPhase("failed"));
  };

  return (
    <Modal
      busy={phase === "erasing"}
      title={`Erase ${firstName}'s record`}
      subtitle={studentName}
      onClose={onClose}
      footer={
        phase === "erasing" ? (
          <div className="flex flex-1 items-center justify-center gap-2.5 py-3">
            <Spinner />
            <span className="text-sm text-nevo-near-black/60">Erasing…</span>
          </div>
        ) : phase === "failed" ? (
          <>
            <FailureLine>
              That didn&rsquo;t complete, and the record is untouched.
              We&rsquo;re on it.
            </FailureLine>
            <button type="button" onClick={erase} className={PRIMARY_BTN}>
              Try again
            </button>
            {/* SCRUM-40: "Primary 'Try again', secondary 'Close'." A failure with
                one way out holds the sheet open until it succeeds. */}
            <button type="button" onClick={onClose} className={GHOST_BTN}>
              Close
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={erase}
              disabled={!matches}
              className={cn(PRIMARY_BTN, "flex-1 justify-center")}
            >
              Erase this record
            </button>
            <button type="button" onClick={onClose} className={GHOST_BTN}>
              Keep the record
            </button>
          </>
        )
      }
    >
      <p className="m-0 text-[14.5px] leading-[1.6] text-nevo-near-black/72">
        This erases {firstName}&rsquo;s record and everything identifying them.
        We&rsquo;re required to keep a small amount of it for a statutory
        period, then that goes too. This cannot be undone.
      </p>

      <div className="mt-4 rounded-[10px] bg-nevo-cream-elevated px-4 py-3.5">
        <h4 className="m-0 text-[13.5px] font-semibold text-nevo-near-black">
          What happens to what their teachers wrote
        </h4>
        <p className="m-0 mt-1.5 text-[13px] leading-[1.55] text-nevo-near-black/65">
          Their notes stay with the class, with {firstName}&rsquo;s name
          removed. Where they were mentioned, it will read{" "}
          <span className="font-mono text-[12.5px]">[erased student]</span>.
        </p>
      </div>

      <label htmlFor="erase-confirm" className="mt-5 block">
        <span className="block text-[12.5px] font-semibold text-nevo-near-black/60">
          Type <span className="text-nevo-near-black">{studentName}</span> to
          confirm.
        </span>
        <input
          id="erase-confirm"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onBlur={() => setTouched(true)}
          autoComplete="off"
          aria-invalid={mismatch}
          className={cn(
            "mt-2 h-[50px] w-full rounded-[10px] border-[1.5px] bg-nevo-cream px-[15px] text-[15px] text-nevo-near-black outline-none transition-colors",
            mismatch
              ? "border-nevo-violet"
              : "border-nevo-near-black/16 focus:border-nevo-navy",
          )}
        />
        {mismatch ? (
          <span className="mt-1.5 block text-[12.5px] text-nevo-navy">
            That doesn&rsquo;t match the name on the record.
          </span>
        ) : null}
      </label>
    </Modal>
  );
}
