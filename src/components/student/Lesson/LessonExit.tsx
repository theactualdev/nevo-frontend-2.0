"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";
import { useRouter } from "next/navigation";

/**
 * Where a lesson goes when a child leaves it, finishes it, or opens its review.
 *
 * NAVIGATION BY DEFAULT, which is every lesson opened from its own route. The
 * one exception is a lesson opened from Downloads with no connection: there is
 * no service worker, so loading another page offline fails outright - and a
 * child who finished their saved lesson would land on the browser's offline
 * page. Downloads opens the lesson in place and provides this, so every exit
 * simply closes it and puts the child back on their saved lessons.
 */
const LessonExitContext = createContext<((to: string) => void) | null>(null);

export function LessonExitProvider({
  onExit,
  children,
}: {
  /** Called with the destination the lesson would have navigated to. */
  onExit: (to: string) => void;
  children: ReactNode;
}) {
  return (
    <LessonExitContext.Provider value={onExit}>
      {children}
    </LessonExitContext.Provider>
  );
}

export function useLessonExit(): (to: string) => void {
  const provided = useContext(LessonExitContext);
  const router = useRouter();
  const navigate = useCallback((to: string) => router.push(to), [router]);
  return provided ?? navigate;
}
