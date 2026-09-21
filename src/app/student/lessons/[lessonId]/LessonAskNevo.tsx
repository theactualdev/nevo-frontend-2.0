"use client";

import { usePathname } from "next/navigation";
import { AskNevo } from "@/components/student/AskNevo/AskNevo";
import { isLessonRoute } from "@/components/student/Shell/lessonRoutes";

/**
 * Ask Nevo, INSIDE the lesson's provider.
 *
 * It was rendered from `StudentShell` as a sibling of `{children}` - so on a
 * lesson route it sat outside the `LessonProvider` that this layout supplies,
 * and `useContext(LessonContext)?.lessonId` resolved to null every time. The
 * scoping was written and wired all along: `AskNevo` already reads that id and
 * already sends it. Every question a child asked from inside a lesson reached
 * the backend with no lesson attached to it.
 *
 * Provider placement, not wiring - which is why this is a move rather than a
 * feature.
 *
 * The route test is the shell's own, shared rather than copied: `/review` and
 * `/summary` sit under this layout and are not the player.
 */
export function LessonAskNevo() {
  return isLessonRoute(usePathname()) ? <AskNevo /> : null;
}
