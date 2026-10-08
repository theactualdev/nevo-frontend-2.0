"use client";

import { usePathname } from "next/navigation";
import { useSessionLapse } from "@/hooks/useSessionLapse";
import { AskNevo } from "./AskNevo";
import { SystemMessagesProvider } from "@/components/shared/SystemMessages";
import { TeacherSidebar } from "./TeacherSidebar";

/**
 * Teacher Console chrome: the nav rail plus the floating Ask Nevo drawer on
 * every console surface. Full-screen flows render bare - today that is only
 * C01 onboarding, a standalone screen per its frame. Same pattern as the
 * student app's StudentShell.
 */
export function TeacherShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";

  /*
   * Notice when a teacher's session runs out under them.
   *
   * `StudentShell` has called this since the hook was written; this shell
   * never did, so a teacher's lapse was silent. The door it needs already
   * exists and is already role-aware - `sessionExpiredDoor` returns
   * `/auth/teacher/session-expired` for `role === "teacher"`, and that page is
   * built - so the whole gap was this one call, and the page it was built for
   * was unreachable.
   *
   * The failure mode is the same one the hook's own docblock describes: an
   * expired session clears itself, so no request is made, so no 401 arrives,
   * so nothing redirects. The route guard runs only on navigation - and a
   * teacher reading one class's roster does not navigate. They work on into a
   * void.
   *
   * ABOVE THE EARLY RETURN, deliberately: hooks cannot run conditionally.
   */
  useSessionLapse();

  if (pathname.startsWith("/teacher/onboarding")) return <>{children}</>;

  /*
   * The pill yields inside the upload wizard and returns when it closes
   * (design, 31 Aug). Upload is the one console flow that owns the whole
   * screen - a floating pill over a file picker and a structure tree is
   * competing with the thing the teacher came to do.
   *
   * Route-based rather than state-based: the wizard's steps are URLs, so
   * leaving the flow is what brings the pill back, with no state to reset.
   */
  const inUpload = pathname.startsWith("/teacher/lessons/upload");

  return (
    /* SCRUM-152's bar is console-wide by construction: it rides above the
       content, clear of the sidebar, and any screen inside the shell can say
       what happened without routing a prop down to it. */
    <SystemMessagesProvider>
    <div className="flex h-dvh flex-row overflow-hidden bg-nevo-cream text-nevo-near-black">
      <TeacherSidebar />
      {/*
        "Larger text" is a console-wide preference, so the zoom lives on the
        shell, not one page. The rail keeps its own scale, as in the student
        app - but not what the rail OPENS (C12).

        THIS WAS AN INLINE `zoom` ON <main> ONLY. Everything drawn outside it
        ignored the setting: Ask Nevo's drawer, the bell's popover, the
        feedback and sign-out sheets the rail opens, and the message bar. A
        teacher who needed larger text got it on the page and lost it on every
        overlay. It is now the student app's `.nevo-text-zoom` class, which
        globals.css keys off `html[data-text-size]` - set by the boot script
        before the first paint (rule 6), where the inline style waited for
        React - and each of those overlays carries it too.
      */}
      <main className="nevo-text-zoom flex min-w-0 flex-1 flex-col overflow-y-auto">
        {children}
      </main>
      {/* C15: Ask Nevo floats on every console surface except upload. */}
      {!inUpload && <AskNevo />}
    </div>
    </SystemMessagesProvider>
  );
}
