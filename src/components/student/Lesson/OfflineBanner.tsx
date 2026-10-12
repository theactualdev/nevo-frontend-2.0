"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

/**
 * Offline banner (Lesson Player frame) — a calm, violet-tinted strip shown when
 * the device drops offline mid-lesson. The house style has the system own the
 * situation and never blame the learner or block the lesson.
 *
 * THE COPY USED TO CLAIM TWO THINGS THAT WERE NOT TRUE. "Showing your saved
 * lesson" implied a cached copy: there is none, the lesson is in memory from
 * the fetch that opened it, and a reload while offline gets nothing. "Your
 * progress is saved" was asserted at the one moment it was least true, because
 * every `PUT /progress` fails while offline.
 *
 * NOR A SAVE LATER (D136, 8 Oct): "nothing claims a save that has not been
 * confirmed". `useLessonProgress` does hold the newest unsent position and
 * re-send it on reconnect, but a banner that shows on any drop cannot know that
 * send will land. So it says only what is true while it shows: the lesson
 * keeps working.
 *
 * Driven by real connectivity (`navigator.onLine` + online/offline events).
 */
export function OfflineBanner() {
  // Assume online for the first paint (server render has no navigator); the
  // effect corrects it on mount so SSR and client markup agree.
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      className="flex shrink-0 items-center gap-2.5 bg-nevo-violet/16 px-4 py-2.5"
    >
      <span className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-nevo-violet/40">
        <WifiOff className="size-[13px] text-nevo-navy" strokeWidth={2} />
      </span>
      <span className="text-[13px] font-medium leading-[1.4] text-nevo-near-black">
        You&apos;re offline. Your lesson keeps working.
      </span>
    </div>
  );
}
