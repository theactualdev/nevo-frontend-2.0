"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Check, CloudDownload } from "lucide-react";
import { LessonProvider } from "@/context/LessonContext";
import { useStudentLessons } from "@/hooks/useStudentLessons";
import { lessonsApi } from "@/lib/api/lessons";
import { getSession } from "@/lib/auth/session";
import { downloadLesson, formatSize } from "@/lib/offline/lessonPackage";
import {
  MAX_SAVED_LESSONS,
  removeSavedLesson,
  saveLesson,
  savedLessons,
  type SavedLesson,
} from "@/lib/offline/savedLessons";
import { LessonExitProvider } from "@/components/student/Lesson/LessonExit";
import { LessonRoute } from "@/components/student/Lesson/LessonRoute";
import { TAB_PAGE, TAB_TITLE } from "@/components/student/Shell/TabPage";
import { BulkSaveButton } from "./BulkSaveButton";

/**
 * Downloads for a signed-in child.
 *
 * A child saves a lesson while they have a connection: the backend's offline
 * package is fetched and unpacked (`lessonPackage`), the lesson inside it is
 * kept on this device (`savedLessons`) - or the detail read, when it is not a
 * lesson the player can open - and a saved lesson opens from here without one.
 *
 * THE SIZE ON EVERY ROW, as the frame draws it (backend B61, 5 Oct). It is
 * the package's, as the server measured it (`sizeBytes`), never ours. A saved
 * row shows the size of what the child kept. Any other row asks
 * `GET /offline-manifest`, a read that records nothing - before B61 the only
 * manifest was the one a save returns, and asking for it per row would have
 * registered downloads the child never made. The server builds the archive to
 * measure it, so a row asks only once it is on screen (or about to be), and
 * only once. A row with no size shows none: not while it is being asked, not
 * when the read fails, and not for the manifest's 0, which is "not measured".
 *
 * TEXT ONLY, SAID UP FRONT. The manifest says `includesMedia: false`, so the
 * line that pictures and sound are not saved stands on that, not on our guess,
 * and shows once a saved lesson carries it.
 *
 * OPENED IN PLACE, NOT NAVIGATED TO. There is no service worker, so loading
 * another page with no connection fails outright. The lesson opens over this
 * page instead, and every way out of it closes it again (`LessonExitProvider`).
 * This page itself is exempt from the shell's offline takeover.
 *
 * NOT DRAWN: the frame has no way to open a lesson from here. The Open
 * control and the copy are ours (D43 signed them off; design confirmed on
 * 6 Oct the intro line is ours to change).
 */

type RowState = "saving" | "idle";

export function SavedLessons() {
  const owner = getSession()?.userId ?? null;
  const { lessons, failed, loading } = useStudentLessons();
  const [shelf, setShelf] = useState<SavedLesson[]>([]);
  const [busy, setBusy] = useState<Record<string, RowState>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  /** What each row would cost to keep, from its manifest read (B61). */
  const [sizes, setSizes] = useState<Record<string, number | null>>({});
  const asked = useRef(new Set<string>());
  /**
   * The shelf has been read. Until it has, no row knows whether it already
   * holds its size, so none asks - a row's effect runs before this screen's
   * own, and would otherwise ask for a lesson the device already measured.
   */
  const [shelfRead, setShelfRead] = useState(false);

  /**
   * One manifest read per row, once, when the row comes on screen. A failed
   * read is forgotten, so the row asks again the next time it is shown.
   */
  const askSize = useCallback((id: string) => {
    if (asked.current.has(id)) return;
    asked.current.add(id);
    lessonsApi
      .offlineManifest(id)
      .then((m) =>
        setSizes((s) => ({
          ...s,
          [id]: m.sizeBytes && m.sizeBytes > 0 ? m.sizeBytes : null,
        })),
      )
      .catch(() => {
        asked.current.delete(id);
      });
  }, []);

  const reload = useCallback(() => {
    setShelf(owner ? savedLessons(owner) : []);
    setShelfRead(true);
  }, [owner]);
  useEffect(() => {
    // Post-mount read of device storage, which the server cannot see.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
  }, [reload]);

  const kept = new Map(shelf.map((s) => [s.lessonId, s]));
  // On the manifest's word, never assumed: see the docblock.
  const textOnly = shelf.some((s) => s.includesMedia === false);

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
      const pkg = await downloadLesson(id);
      const result = saveLesson(owner, pkg.detail, {
        sizeBytes: pkg.sizeBytes,
        includesMedia: pkg.includesMedia,
      });
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
      setNotice(saveFailedLine());
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
    for (const row of rows) if (!kept.has(row.id)) await save(row.id);
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

  const unsaved = rows.filter((r) => !kept.has(r.id));

  return (
    <div className={TAB_PAGE}>
      <div className="max-w-[640px]">
      <h1 className={TAB_TITLE}>Downloads</h1>
      {/* Straight apostrophes, as the student screens and the frames write
          them; this screen mixed both. */}
      <p className="mt-2 text-sm leading-[1.55] text-nevo-near-black/65">
        Save a lesson while you&apos;re connected, and you can open it here
        even without a connection.
        {textOnly && <> Pictures and sound aren&apos;t saved.</>}
      </p>

      {/*
        STAYS WHEN EVERYTHING IS SAVED (D211, 13 Oct), finished rather than
        gone: see `BulkSaveButton`. "Everything" is only claimed once the
        lesson list has answered - while it is in flight the rows are the shelf
        alone, all of them saved - and never over a failed read.
      */}
      {!failed && (unsaved.length > 0 || (!loading && rows.length > 0)) && (
        <BulkSaveButton
          finished={unsaved.length === 0}
          label="Save all my lessons"
          onSave={() => void saveAll()}
        />
      )}

      {/* The readable violet: the surface one is 2.3:1 on cream. */}
      {notice && (
        <p role="status" className="mt-3 text-sm text-nevo-violet-text">
          {notice}
        </p>
      )}

      {/*
        NOT ANSWERED YET IS NOT "NOTHING TO SAVE". While the lesson list is in
        flight `lessons` is empty, and with nothing on the shelf this used to
        tell the child there were no lessons - a claim made before anything
        had been asked.
      */}
      {rows.length === 0 && loading ? (
        <div className="mt-8 flex justify-center">
          <span
            role="status"
            aria-label="Loading"
            className="block size-5 rounded-full border-[2.5px] border-nevo-navy/20 border-t-nevo-navy motion-safe:animate-spin motion-safe:[animation-duration:800ms]"
          />
        </div>
      ) : rows.length === 0 && failed ? (
        /*
          A FAILED READ IS NOT AN EMPTY SHELF. With the list unread and nothing
          saved this said only that nothing was saved here, as if there were
          nothing to save - the failure itself went unmentioned. Home's and
          Lessons' failed state, in their words.
        */
        <div className="mt-8 rounded-[16px] bg-nevo-cream-elevated p-[22px] shadow-elevation-1">
          <p className="text-[17px] font-semibold text-nevo-near-black">
            We couldn&apos;t load your lessons just now
          </p>
          <p className="mt-1.5 text-[15px] leading-[1.5] text-nevo-near-black/68">
            Nothing is lost. Give it a moment and try again.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 flex h-[48px] cursor-pointer items-center rounded-[12px] bg-nevo-navy px-7 text-[15px] font-medium text-nevo-cream"
          >
            Try again
          </button>
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-8 text-center text-sm text-nevo-near-black/60">
          There are no lessons to save yet.
        </p>
      ) : (
        <ul className="mt-3">
          {rows.map((row) => {
            const isSaved = kept.has(row.id);
            const isSaving = busy[row.id] === "saving";
            // The kept download's own size first; otherwise what keeping it
            // would cost, once its manifest has been read.
            const keptSize = kept.get(row.id)?.sizeBytes;
            const size = formatSize(keptSize ?? sizes[row.id]);
            return (
              <Row
                key={row.id}
                id={row.id}
                onSeen={!shelfRead || keptSize ? null : askSize}
              >
                <span className="min-w-0 flex-1 truncate text-[15px] text-nevo-near-black">
                  {row.title}
                </span>
                {size && (
                  <span className="shrink-0 text-[13px] text-nevo-near-black/55">
                    {size}
                  </span>
                )}
                {isSaved ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setOpenId(row.id)}
                      className="h-11 cursor-pointer rounded-[10px] px-3 text-[15px] font-medium text-nevo-navy transition-colors hover:bg-nevo-navy/8"
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${row.title} from this device`}
                      onClick={() => remove(row.id)}
                      className="flex size-11 cursor-pointer items-center justify-center rounded-full"
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
                    className="mx-3 block size-5 shrink-0 rounded-full border-[2.5px] border-nevo-navy/20 border-t-nevo-navy motion-safe:animate-spin motion-safe:[animation-duration:800ms]"
                  />
                ) : (
                  <button
                    type="button"
                    aria-label={`Save ${row.title} for offline`}
                    onClick={() => void save(row.id)}
                    className="flex size-11 cursor-pointer items-center justify-center rounded-full text-nevo-near-black/50 transition-colors hover:bg-nevo-near-black/6"
                  >
                    <CloudDownload className="size-[22px]" strokeWidth={2} />
                  </button>
                )}
              </Row>
            );
          })}
        </ul>
      )}
      </div>
    </div>
  );
}

/**
 * WHY A SAVE DIDN'T LAND, ONLY AS FAR AS WE KNOW IT (D181, 13 Oct): "Do not
 * blame the connection for a server failure." A refused or broken save is the
 * server's, so it says only that it didn't save. The connection is named only
 * when the browser itself says there is none - `navigator.onLine` false is
 * certain, where true proves nothing - and then the old line, which tells the
 * child the one thing that will help.
 */
const SAVE_FAILED = "That didn't save. Try again in a moment.";
const SAVE_FAILED_OFFLINE =
  "That lesson couldn't be saved just now. Try again when you're connected.";

function saveFailedLine(): string {
  return typeof navigator !== "undefined" && navigator.onLine === false
    ? SAVE_FAILED_OFFLINE
    : SAVE_FAILED;
}

/**
 * One row, which asks for its size once it is on screen or about to be
 * (`onSeen`), and never before. Null when the row already has its size.
 * With no IntersectionObserver to ask, the row counts as shown.
 */
function Row({
  id,
  onSeen,
  children,
}: {
  id: string;
  onSeen: ((id: string) => void) | null;
  children: ReactNode;
}) {
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!onSeen || !el) return;
    if (typeof IntersectionObserver === "undefined") {
      onSeen(id);
      return;
    }
    const watcher = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        watcher.disconnect();
        onSeen(id);
      },
      // "About to show": a row just below the fold asks a little early.
      { rootMargin: "0px 0px 160px 0px" },
    );
    watcher.observe(el);
    return () => watcher.disconnect();
  }, [id, onSeen]);
  return (
    <li
      ref={ref}
      // 44px controls in a row no taller than it was.
      className="flex items-center gap-3 border-b border-nevo-near-black/8 py-2.5"
    >
      {children}
    </li>
  );
}
