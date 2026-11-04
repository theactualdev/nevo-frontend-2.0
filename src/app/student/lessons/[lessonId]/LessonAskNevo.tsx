"use client";

import { useContext } from "react";
import { usePathname } from "next/navigation";
import { AskNevo } from "@/components/student/AskNevo/AskNevo";
import { isLessonRoute } from "@/components/student/Shell/lessonRoutes";
import { LessonContext } from "@/context/LessonContext";

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
 *
 * AND ONLY WHERE THE PLAYER SAYS SO (`askNevoAllowed`). IA 31 kept it off
 * all lesson content; Lydia brought it back into the player on 4 Nov, except
 * while an answer is being taken - a check's sheet, a calculation step, the
 * after-lesson questions. The player switches it for each of its screens
 * (`askNevoHere` in `LessonPlayer`), the completion screen and the review
 * session's entry (D108) among them.
 */
export function LessonAskNevo() {
  const allowed = useContext(LessonContext)?.askNevoAllowed ?? false;
  return isLessonRoute(usePathname()) && allowed ? <AskNevo /> : null;
}
