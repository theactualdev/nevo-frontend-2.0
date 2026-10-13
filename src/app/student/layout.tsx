import type { Metadata } from "next";
import { AccountPauseHost } from "@/components/student/Auth/AccountPauseHost";
import { RotateLock } from "@/components/student/Shell/RotateLock";
import { StudentShell } from "@/components/student/Shell/StudentShell";

// Signed-in product surface - never indexed.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Student App context layout (Product Arch A.1 — tablet-first, calm, low
 * cognitive load).
 *
 * Hosts the app shell (`StudentShell`): sidebar/bottom-nav on the daily-experience
 * tabs, bare on the full-screen flows (onboarding, Lesson Player). Layout-level
 * auth (student role, FE Arch §2) will back up proxy.ts here once it lands.
 */
export default function StudentLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Portrait-only v1 - covers every student surface, incl. bare flows, and
    // holds the one underneath still while it does.
    <RotateLock>
      <StudentShell>{children}</StudentShell>
      {/* 28b: a pause that lands while a child is here is shown over this
          screen, not by leaving it. It portals over whatever the shell is
          showing, the lesson player most of all. */}
      <AccountPauseHost />
    </RotateLock>
  );
}
