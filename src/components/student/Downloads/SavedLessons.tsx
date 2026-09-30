"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, CloudDownload } from "lucide-react";
import { LessonProvider } from "@/context/LessonContext";
import { useStudentLessons } from "@/hooks/useStudentLessons";
import { lessonsApi } from "@/lib/api/lessons";
import { getSession } from "@/lib/auth/session";
import {
  MAX_SAVED_LESSONS,
  removeSavedLesson,
  saveLesson,
  savedLessons,
  type SavedLesson,
} from "@/lib/offline/savedLessons";
import { LessonExitProvider } from "@/components/student/Lesson/LessonExit";
import { LessonRoute } from "@/components/student/Lesson/LessonRoute";

/**
 * Downloads for a signed-in child - THE SMALLER VERSION of offline.
 *
 * A child saves a lesson while they have a connection; the lesson read the
 * player already makes is kept on this device (`savedLessons`), and a saved
 * lesson opens from here without one. What it is not - no sizes, no pictures
 * or audio, no backend offline package - is recorded in `savedLessons.ts`:
 * the real version waits on backend typing that package.
 *
 * OPENED IN PLACE, NOT NAVIGATED TO. There is no service worker, so loading
 * another page with no connection fails outright. The lesson opens over this
 * page instead, and every way out of it closes it again (`LessonExitProvider`).
 * This page itself is exempt from the shell's offline takeover.
 *
 * NOT DRAWN: the frame shows the demo list with sizes and no way to open a
 * lesson from here. The Open control and the copy are ours and are flagged to
 * design; sizes are absent because the contract carries none.
 */

type RowState = "saving" | "idle";

export function SavedLessons() {
  const owner = getSession()?.userId ?? null;
  const { lessons, failed } = useStudentLessons();
  const [shelf, setShelf] = useState<SavedLesson[]>([]);
  const [busy, setBusy] = useState<Record<string, RowState>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const reload = useCallback(() => {
    setShelf(owner ? savedLessons(owner) : []);
  }, [owner]);
  useEffect(() => {
    // Post-mount read of device storage, which the server cannot see.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
  }, [reload]);

  const saved = new Set(shelf.map((s) => s.lessonId));

  /*
   * THE CHILD'S LESSONS, THEN WHAT THEY SAVED THAT THE LIST CANNOT SHOW. With
   * no connection the lesson list fails and only the shelf remains - which is
   * exactly the moment this screen is for.
   */
  const rows: { id: string; title: string }[] = [
    ...lessons.map((l) => ({ id: l.id, title: l.title })),
    ...shelf
      .filter((s) => !lessons.some((l) => l.id === s.lessonId))
      .map((s) => ({ id: s.lessonId, title: s.title })),
  ];

  const save = async (id: string) => {
    if (!owner) return;
    setNotice(null);
    setBusy((b) => ({ ...b, [id]: "saving" }));
    try {
      const detail = await lessonsApi.detail(id);
      const result = saveLesson(owner, detail);
      if (result === "full") {
        setNotice(
          `This device keeps ${MAX_SAVED_LESSONS} lessons. Remove one to save another.`,
        );
      } else if (result === "refused") {
        setNotice(
          "This device wouldn't keep that lesson. Try removing one you've saved.",
        );
      }
    } catch {
      setNotice("That lesson couldn't be saved just now. Try again when you're connected.");
    } finally {
      setBusy((b) => ({ ...b, [id]: "idle" }));
      reload();
    }
  };

  const remove = (id: string) => {
    if (!owner) return;
    removeSavedLesson(owner, id);
    reload();
  };

  const saveAll = async () => {
    for (const row of rows) if (!saved.has(row.id)) await save(row.id);
  };

  if (openId) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-nevo-cream">
        <LessonProvider>
          <LessonExitProvider
            onExit={() => {
              setOpenId(null);
              reload();
            }}
          >
            <LessonRoute lessonId={openId} />
          </LessonExitProvider>
        </LessonProvider>
      </div>
    );
  }

  const unsaved = rows.filter((r) => !saved.has(r.id));

  return (
    <div className="mx-auto w-full max-w-[640px] px-5 py-2 pb-6 sm:px-8 sm:py-6">
      <h1 className="text-2xl font-semibold tracking-[-0.01em] text-nevo-near-black sm:text-[30px] lg:text-[32px]">
        Downloads
      </h1>
      <p className="mt-2 text-sm leading-[1.55] text-nevo-near-black/65">
        Save a lesson while you&rsquo;re connected, and you can open it here
        even without a connection. Pictures and sound aren&rsquo;t saved yet.
      </p>

      {unsaved.length > 0 && !failed && (
        <button
          type="button"
          onClick={() => void saveAll()}
          className="mt-5 h-[52px] w-full cursor-pointer rounded-[12px] bg-nevo-navy text-[15px] font-medium text-nevo-cream transition-[filter] hover:brightness-110"
        >
          Save all my lessons
        </button>
      )}

      {notice && (
        <p role="status" className="mt-3 text-sm text-nevo-violet">
          {notice}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="mt-8 text-center text-sm text-nevo-near-black/60">
          {failed
            ? "You haven't saved any lessons on this device yet."
            : "There are no lessons to save yet."}
        </p>
      ) : (
        <ul className="mt-3">
          {rows.map((row) => {
            const isSaved = saved.has(row.id);
            const isSaving = busy[row.id] === "saving";
            return (
              <li
                key={row.id}
                className="flex items-center gap-3 border-b border-nevo-near-black/8 py-3"
              >
                <span className="min-w-0 flex-1 truncate text-[15px] text-nevo-near-black">
                  {row.title}
                </span>
                {isSaved ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setOpenId(row.id)}
                      className="h-10 cursor-pointer rounded-[10px] px-3 text-[15px] font-medium text-nevo-navy transition-colors hover:bg-nevo-navy/8"
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${row.title} from this device`}
                      onClick={() => remove(row.id)}
                      className="flex size-10 cursor-pointer items-center justify-center rounded-full"
                    >
                      <span className="flex size-[22px] items-center justify-center rounded-full bg-nevo-navy">
                        <Check
                          className="size-3.5 text-nevo-cream"
                          strokeWidth={3}
                          aria-hidden
                        />
                      </span>
                    </button>
                  </>
                ) : isSaving ? (
                  <span
                    role="img"
                    aria-label="Saving"
                    className="mx-2.5 block size-5 shrink-0 rounded-full border-[2.5px] border-nevo-navy/20 border-t-nevo-navy motion-safe:animate-spin motion-safe:[animation-duration:800ms]"
                  />
                ) : (
                  <button
                    type="button"
                    aria-label={`Save ${row.title} for offline`}
                    onClick={() => void save(row.id)}
                    className="flex size-10 cursor-pointer items-center justify-center rounded-full text-nevo-near-black/50 transition-colors hover:bg-nevo-near-black/6"
                  >
                    <CloudDownload className="size-[22px]" strokeWidth={2} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
