"use client";

import { useEffect } from "react";
import type { SessionRow } from "@/lib/mocks/teacherStudents";
import type { StudentSessionDetail } from "@/lib/api/students";
import { useStudentSession } from "@/hooks/useStudentSessions";
import { SessionPanel } from "./SessionPanel";

/**
 * C08d on a real session.
 *
 * THE SCREEN WAS NEVER THE PROBLEM. `SessionPanel` has been frame-complete
 * since it was built and mounted only for signed-out visitors, because nothing
 * gave a teacher a session id to read with. Backend added the sessions list on
 * 17 Sep; this is the wiring that was waiting on it.
 *
 * So this renders the DESIGNED panel rather than a second one. The detail
 * response maps onto `SessionRow` almost field for field, and a live-only copy
 * of the same markup would drift from the frame the first time either changed.
 */

/** The engine's words, shaped for the panel. Nothing here is derived. */
function toRow(d: StudentSessionDetail): SessionRow {
  const when = new Date(d.occurredAt);
  return {
    id: d.sessionId,
    date: when.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
    dateLong: when.toLocaleDateString("en-GB", { day: "numeric", month: "long" }),
    lesson: d.lessonTitle,
    // The narrative IS the note. `summary` is the fixture's desktop/tablet
    // rewrite pair, and there is no second phrasing on the wire to put in it -
    // inventing a shorter one would be writing prose about a child.
    note: d.narrative,
    // Only when it means something. The frame's tail reads "finished in two
    // sittings"; on a single sitting there is nothing to say and the frame
    // omits it rather than saying "in one sitting".
    sitting: d.sittings > 1 ? `finished in ${d.sittings} sittings` : undefined,
    steps: d.sections.map((s) => ({
      title: s.title,
      note: s.note,
      // The engine's own flag, renamed to the panel's prop. NOT derived from a
      // duration here - that would be the console deciding what "took time"
      // means.
      took: s.tookTime,
    })),
  };
}

type PanelProps = {
  studentId: string;
  /** Null when nothing is open. No request is made while it is. */
  sessionId: string | null;
  studentName: string;
  onClose: () => void;
  onRecommend: () => void;
  onMessage: () => void;
};

export function LiveSessionPanel({ sessionId, ...rest }: PanelProps) {
  if (!sessionId) return null;
  /*
   * ONE SESSION, ONE READ (T131). Opening a second row kept the first one's
   * answer on screen - the read keeps its data until the next lands - so the
   * narrative of one sitting showed under another's title, and a failure
   * stayed up over a session that had not been asked yet. Keyed by session,
   * each opening starts from nothing.
   */
  return <SessionDetail key={sessionId} sessionId={sessionId} {...rest} />;
}

function SessionDetail({
  studentId,
  sessionId,
  studentName,
  onClose,
  onRecommend,
  onMessage,
}: PanelProps & { sessionId: string }) {
  const { detail, loading, failed } = useStudentSession(studentId, sessionId);

  /*
   * A WAY OUT WHILE IT WAITS (T132). The loading overlay covered the screen
   * with no close, no Escape and no backdrop - a read that never answered
   * held the teacher there until a reload. The same ways out the panel
   * itself has, nothing more: this screen is frozen pending counsel (T143).
   */
  useEffect(() => {
    if (detail) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detail, onClose]);

  if (loading || failed || !detail) {
    return (
      <div
        onClick={onClose}
        className="fixed inset-0 z-50 flex items-center justify-center bg-nevo-near-black/28 backdrop-blur-[1.5px] p-6"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-[560px] rounded-[16px] bg-nevo-cream p-8 shadow-[0_8px_32px_rgba(0,0,0,0.16)]"
        >
          {failed ? (
            <>
              <h2 className="text-[19px] font-semibold text-nevo-near-black">
                We couldn&rsquo;t load that session
              </h2>
              <p className="mt-3 text-[14.5px] leading-[1.6] text-nevo-near-black/72">
                {`This isn${"’"}t about ${studentName} - we just couldn${"’"}t reach Nevo. Try again in a moment.`}
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-6 h-12 w-full cursor-pointer rounded-[10px] bg-nevo-navy text-[14.5px] font-semibold text-nevo-cream transition-[filter] hover:brightness-93"
              >
                Close
              </button>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-3">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-[64px] animate-pulse rounded-[10px] bg-nevo-cream-elevated"
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="mt-6 h-12 w-full cursor-pointer rounded-[10px] border-[1.5px] border-nevo-navy/30 text-[14.5px] font-medium text-nevo-navy transition-colors hover:bg-nevo-navy/6"
              >
                Close
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <SessionPanel
      session={toRow(detail)}
      studentName={studentName}
      onClose={onClose}
      onRecommend={onRecommend}
      onMessage={onMessage}
    />
  );
}
