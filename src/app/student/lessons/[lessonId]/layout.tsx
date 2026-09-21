import { LessonProvider } from "@/context/LessonContext";
import { LessonAskNevo } from "./LessonAskNevo";

/**
 * Lesson-scoped layout — wraps the Lesson Player in LessonContext (student only,
 * FE Architecture §8). Scoped here rather than the whole Student App so lesson
 * state/adaptation/signals live only for the active lesson.
 */
export default function LessonLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <LessonProvider>
      {children}
      {/*
        INSIDE the provider, deliberately. Ask Nevo used to render from
        `StudentShell` as a sibling of this layout, so the lesson id it already
        reads and already sends resolved to null on every question asked from
        inside a lesson.
      */}
      <LessonAskNevo />
    </LessonProvider>
  );
}
