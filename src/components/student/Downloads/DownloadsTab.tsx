"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CloudDownload } from "lucide-react";
import { useHasSession } from "@/hooks/useHasSession";
import { useHydrated } from "@/hooks/useHydrated";
import { SampleRegion } from "@/components/shared/SampleRegion";
import { cn } from "@/lib/utils";
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
 * device and opens it without a connection - the smaller version of offline.
 * The real version (the backend's offline package, with sizes and media) waits
 * on backend: `GET /lessons/{id}/offline-package` answers an untyped `{}`.
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
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    const active = timers.current;
    return () => active.forEach(clearTimeout);
  }, []);

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
      return;
    }
    setStatuses((s) => ({ ...s, [id]: "downloading" }));
    finishAfter(id, DOWNLOAD_MS);
  };

  const downloadAll = () => {
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

  const allDone = ITEMS.every((i) => statuses[i.id] === "downloaded");

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
    <div className="mx-auto w-full max-w-[640px] px-5 py-2 pb-6 sm:px-8 sm:py-6">
      <h1 className="text-2xl font-semibold tracking-[-0.01em] text-nevo-near-black sm:text-[30px] lg:text-[32px]">
        Downloads
      </h1>

      <button
        type="button"
        onClick={downloadAll}
        disabled={allDone}
        className="mt-5 h-[52px] w-full cursor-pointer rounded-[12px] bg-nevo-navy text-[15px] font-medium text-nevo-cream transition-[filter] hover:brightness-110 disabled:cursor-default disabled:opacity-40"
      >
        {allDone ? "All lessons saved for offline" : "Download today's lessons"}
      </button>

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
    </SampleRegion>
  );
}

/** Heading only, while we work out who is looking. */
function DownloadsShell() {
  return (
    <div className="mx-auto w-full max-w-[640px] px-5 py-2 pb-6 sm:px-8 sm:py-6">
      <h1 className="text-2xl font-semibold tracking-[-0.01em] text-nevo-near-black sm:text-[30px] lg:text-[32px]">
        Downloads
      </h1>
      <div className="mt-5 h-[52px] animate-pulse rounded-[12px] bg-nevo-cream-elevated" />
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
