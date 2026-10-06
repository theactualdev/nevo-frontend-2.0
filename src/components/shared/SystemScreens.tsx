"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useHydrated } from "@/hooks/useHydrated";
import { getSession } from "@/lib/auth/session";
import { doorForRole } from "@/lib/auth/consoleDoor";
import { Button } from "./Button";
import { CombinedMark, Wordmark } from "./BrandMarks";

/**
 * Board 28's 404 and generic error, shared by every console's boundary.
 *
 * WHAT THEY WERE: a lucide compass or cloud on a cream tile - board 28's own
 * caption calls those "placeholder art" - and one way out, `router.back()`.
 * Opened directly (a stale bookmark, a link in a message, a new tab), there is
 * no back, so the only button did nothing and the screen was a dead end.
 *
 * WHAT THEY ARE: the logo file and the illustration the frame draws, and a way
 * out that always goes somewhere - back where there is a back, otherwise the
 * person's own home. IA 31 adds the other way: on the 404 the logo is a link
 * to Home.
 */

/** Where "home" is for whoever is looking. Nobody signed in: the site. */
export function homeFor(role: string | null | undefined): string {
  switch (doorForRole(role)) {
    case "student":
      return "/student/dashboard";
    case "teacher":
      return "/teacher/dashboard";
    case "admin":
      return "/admin";
    default:
      return "/";
  }
}

/**
 * Whether "Go back" has anywhere to go. A tab opened on this page has a
 * history of exactly one entry, and `router.back()` from there does nothing.
 */
export function canGoBack(historyLength: number): boolean {
  return historyLength > 1;
}

/** Home for the person looking, once the client can tell who that is. */
function useHome(): string {
  const hydrated = useHydrated();
  return homeFor(hydrated ? getSession()?.role : null);
}

function useGoBack(home: string): () => void {
  const router = useRouter();
  return () => {
    if (canGoBack(window.history.length)) router.back();
    else router.push(home);
  };
}

const ART =
  "-my-3.5 size-[180px] object-contain sm:my-0 sm:h-[184px] sm:w-[220px]";

export function NotFoundScreen({
  inShell = false,
}: {
  /**
   * Drawn inside a console's own shell: no full-viewport height, because the
   * shell is already the page. The teacher console renders it this way, so a
   * missing record leaves the teacher in the console rather than outside it.
   */
  inShell?: boolean;
} = {}) {
  const home = useHome();
  const goBack = useGoBack(home);
  return (
    <div
      className={
        inShell
          ? "flex w-full flex-1 flex-col items-center justify-center bg-nevo-cream px-10 py-16 text-center text-nevo-near-black"
          : "flex min-h-[100dvh] w-full flex-col items-center justify-center bg-nevo-cream px-10 text-center text-nevo-near-black"
      }
    >
      {/* IA 31: "Nevo wordmark -> Student Home Dashboard". The frame draws
          the combined mark here, so that is what links home. */}
      <Link
        href={home}
        aria-label="Nevo home"
        className="mb-8 cursor-pointer sm:mb-10"
      >
        <CombinedMark />
      </Link>
      <Image
        src="/illustrations/not-found.png"
        alt=""
        width={1254}
        height={1254}
        sizes="220px"
        priority
        className={ART}
      />
      <h1 className="mt-7 text-xl font-medium sm:mt-8 sm:text-2xl">
        This page doesn&apos;t exist
      </h1>
      <Button
        variant="ghost"
        className="mt-7 h-12 w-full max-w-[290px] text-[15px] font-normal sm:mt-8 sm:max-w-[340px]"
        onClick={goBack}
      >
        Go back
      </Button>
    </div>
  );
}

/**
 * The generic error. `retry` is Next 16's `unstable_retry`, which re-fetches
 * the segment and renders it again; `reset` only re-rendered, so a fault in a
 * server read came straight back.
 */
export function ErrorScreen({
  retry,
  mark = true,
  className,
}: {
  retry: () => void;
  /**
   * The frame's wordmark. Off inside the student shell, whose sidebar and top
   * bar already carry it - the logo reference: "logo in the sidebar only".
   */
  mark?: boolean;
  className?: string;
}) {
  const home = useHome();
  const goBack = useGoBack(home);
  return (
    <div
      className={
        className ??
        "flex min-h-[100dvh] w-full flex-col items-center justify-center bg-nevo-cream px-10 text-center text-nevo-near-black"
      }
    >
      {mark && <Wordmark size="compact" className="mb-7 sm:mb-9" />}
      <Image
        src="/illustrations/error.png"
        alt=""
        width={1254}
        height={1254}
        sizes="220px"
        className={ART}
      />
      <h1 className="mt-7 text-xl font-medium sm:mt-8 sm:text-2xl">
        Something went wrong
      </h1>
      <p className="mt-2 text-[15px] text-nevo-near-black/60 sm:mt-2.5 sm:text-base">
        We&apos;re on it. Try again or go back.
      </p>
      <Button
        className="mt-7 w-full max-w-[290px] text-base sm:mt-8 sm:max-w-[340px]"
        onClick={retry}
      >
        Try again
      </Button>
      <Button
        variant="ghost"
        className="mt-2 h-12 w-full max-w-[290px] text-[15px] font-normal sm:max-w-[340px]"
        onClick={goBack}
      >
        Go back
      </Button>
    </div>
  );
}
