"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CloudDownload } from "lucide-react";
import { useHasSession } from "@/hooks/useHasSession";
import { useHydrated } from "@/hooks/useHydrated";
import { SampleRegion } from "@/components/shared/SampleRegion";
import { cn } from "@/lib/utils";
import { TAB_PAGE, TAB_TITLE } from "@/components/student/Shell/TabPage";
import { SavedLessons } from "./SavedLessons";

type DownloadStatus = "available" | "downloading" | "downloaded";

interface DownloadItem {
  id: string;
  title: string;
  size: string;
}

// TODO(api): source today's lessons + sizes from the backend.
const ITEMS: DownloadItem[] = [
  { id: "adding-fractions", title: "Adding Fractions", size: "6 MB" },
  { id: "telling-the-time", title: "Telling the Time", size: "4 MB" },
  { id: "the-lighthouse", title: "The Lighthouse", size: "9 MB" },
  { id: "shapes-around-us", title: "Shapes Around Us", size: "3 MB" },
];

/** How long a simulated download takes to land. */
const DOWNLOAD_MS = 800;

/**
 * Downloads Tab (screen 24) — a lightweight offline manager: keep today's
 * lessons on the device for patchy connectivity.
 *
 * TWO AUDIENCES, TWO SCREENS.
 *
 * A signed-in child gets `SavedLessons`, which really keeps a lesson on this
 * device, from the backend's offline package, and opens it without a
 * connection.
 *
 * The signed-out walkthrough keeps the SIMULATION below: it flips a row to
 * "Saved offline" after 800ms having cached nothing, over four lessons that
 * are nobody's. That is fine for a demonstration of the designed screen and
 * would be a false promise to a real child, which is why they never see it.
 */
export function DownloadsTab() {
  const signedIn = useHasSession();
  const hydrated = useHydrated();
  const [statuses, setStatuses] = useState<Record<string, DownloadStatus>>(() =>
    Object.fromEntries(ITEMS.map((i) => [i.id, "available" as DownloadStatus])),
  );
  /** The finished button was pressed, so it says why it did nothing. */
  const [explained, setExplained] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    const active = timers.current;
    return () => active.forEach(clearTimeout);
  }, []);

  const allDone = ITEMS.every((i) => statuses[i.id] === "downloaded");

  const finishAfter = (id: string, delay: number) => {
    timers.current.push(
      setTimeout(
        () => setStatuses((s) => ({ ...s, [id]: "downloaded" })),
        delay,
      ),
    );
  };

  const toggle = (id: string) => {
    const status = statuses[id];
    if (status === "downloading") return;
    if (status === "downloaded") {
      setStatuses((s) => ({ ...s, [id]: "available" })); // remove
      setExplained(false);
      return;
    }
    setStatuses((s) => ({ ...s, [id]: "downloading" }));
    finishAfter(id, DOWNLOAD_MS);
  };

  const downloadAll = () => {
    if (allDone) {
      setExplained(true);
      return;
    }
    const pending = ITEMS.filter((i) => statuses[i.id] === "available");
    if (pending.length === 0) return;
    setStatuses((s) => {
      const next = { ...s };
      for (const i of pending) next[i.id] = "downloading";
      return next;
    });
    // Stagger completion so it feels like real progress, not a flip.
    pending.forEach((i, n) => finishAfter(i.id, DOWNLOAD_MS + n * 600));
  };

  // Nothing renders until we know who is looking - SSR cannot read the token,
  // and a frame of "Saved offline" is the claim this gate exists to prevent.
  if (!hydrated) return <DownloadsShell />;
  // A signed-in child gets the real shelf: see `SavedLessons`.
  if (signedIn) return <SavedLessons />;

  // Signed out: four lessons that are nobody's and a simulated save, so the
  // region is marked. The gates above hold today; the mark is what lets an
  // end-to-end run SEE it if one ever stops holding.
  return (
    <SampleRegion kind="student:downloads">
    <div className={TAB_PAGE}>
      <div className="max-w-[640px]">
      <h1 className={TAB_TITLE}>Downloads</h1>

      {/*
        FINISHED, NOT BLOCKED, SO NEVER GREY (D211, 13 Oct): it "still stays
        pressable and still says so rather than going grey." Pressed with
        everything saved, it answers in place, in the ruling's one line.
      */}
      <button
        type="button"
        onClick={downloadAll}
        className="mt-5 h-[52px] w-full cursor-pointer rounded-[12px] bg-nevo-navy text-[15px] font-medium text-nevo-cream transition-[filter] hover:brightness-110"
      >
        {allDone ? "All lessons saved for offline" : "Download today's lessons"}
      </button>
      {allDone && explained && (
        <p
          role="status"
          className="mt-3 rounded-[10px] bg-nevo-violet/14 px-[15px] py-[13px] text-[14px] leading-[1.5] text-nevo-near-black/80"
        >
          Everything&apos;s already saved.
        </p>
      )}

      <ul className="mt-3">
        {ITEMS.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => toggle(item.id)}
              className="flex w-full cursor-pointer items-center gap-3 border-b border-nevo-near-black/8 py-4 text-left"
            >
              <span className="min-w-0 flex-1 truncate text-[15px] text-nevo-near-black">
                {item.title}
              </span>
              <span className="text-[13px] text-nevo-near-black/55">
                {item.size}
              </span>
              <StatusIcon status={statuses[item.id]} />
            </button>
          </li>
        ))}
      </ul>
      </div>
    </div>
    </SampleRegion>
  );
}

/** Heading only, while we work out who is looking. */
function DownloadsShell() {
  return (
    <div className={TAB_PAGE}>
      <div className="max-w-[640px]">
        <h1 className={TAB_TITLE}>Downloads</h1>
        <div className="mt-5 h-[52px] animate-pulse rounded-[12px] bg-nevo-cream-elevated" />
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: DownloadStatus }) {
  if (status === "downloaded") {
    return (
      <span
        role="img"
        aria-label="Saved offline"
        className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-nevo-navy"
      >
        <Check className="size-3.5 text-nevo-cream" strokeWidth={3} aria-hidden />
      </span>
    );
  }
  if (status === "downloading") {
    return (
      <span
        role="img"
        aria-label="Downloading"
        className="block size-5 shrink-0 rounded-full border-[2.5px] border-nevo-navy/20 border-t-nevo-navy motion-safe:animate-spin motion-safe:[animation-duration:800ms]"
      />
    );
  }
  return (
    <CloudDownload
      aria-label="Download"
      className={cn("size-[22px] shrink-0 text-nevo-near-black/50")}
      strokeWidth={2}
    />
  );
}
