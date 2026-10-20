"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The shell for 05 Entry and 03 Teacher Join (UI/UX spec B.2): a back-chevron
 * + wordmark header and a single-column content area centred both ways.
 * Full-viewport, no chrome, solid cream.
 *
 * NO PROGRESS LINE. It drew "step 2 of 3" across three steps, and two of them
 * were deleted on 30 Sep (SCRUM-208). The entry frame draws none, and a line
 * one step long measures nothing.
 *
 * `lifted` is the frame's keyboard-up layout: while the on-screen keyboard is
 * docked, the content starts at the top so the field being typed into and the
 * button stay above the tray. Touch only - a fine pointer has a real keyboard
 * and never shows the tray, so there is nothing to make room for.
 *
 * `footer` is where that tray docks, after the content and in the flow, so the
 * page grows by its height rather than hiding anything under it.
 *
 * `onBack` runs as Back is pressed, before it goes to `backHref`: 05 ends the
 * session it has been holding there (19 Oct browser-storage audit).
 */
export function OnboardingShell({
  backHref,
  onBack,
  lifted = false,
  footer,
  children,
}: {
  backHref: string;
  onBack?: () => void;
  lifted?: boolean;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();

  return (
    <div className="flex min-h-[100dvh] flex-col bg-nevo-cream text-nevo-near-black">
      {/* Header: back + wordmark */}
      <header className="flex h-14 shrink-0 items-center px-4 sm:h-16 sm:px-5">
        <button
          type="button"
          aria-label="Back"
          onClick={() => {
            onBack?.();
            router.push(backHref);
          }}
          className="flex size-11 cursor-pointer items-center justify-center rounded-[10px] transition-colors hover:bg-nevo-near-black/[0.06] active:bg-nevo-near-black/[0.12]"
        >
          <ChevronLeft className="size-6" strokeWidth={2} />
        </button>
        {/*
          The entry frame's `logoH`: 16px on a phone and 18 on a tablet, set
          as the profiling shell sets its wordmark. It was 20, 22 and 24. A
          desktop draws the tablet's, in the letterbox (D207).
        */}
        <Image
          src="/brand/nevo-wordmark.png"
          alt="Nevo"
          width={344}
          height={116}
          className="ml-1.5 h-4 w-auto sm:h-[18px]"
        />
      </header>

      {/*
        Content - single column, centred both ways in the space under the
        header (QA, 30 Sep). `my-auto`, not `justify-center`: auto margins
        drop to zero when the content is taller than the space, so a long step
        on a short screen scrolls from its top instead of losing it above the
        fold. The column is the frame's `innerMax`: 440px on a tablet, and
        on a desktop, which letterboxes the tablet (D207) and has no
        composition of its own.
      */}
      <div className="flex flex-1 flex-col items-center overflow-y-auto px-6 pb-6 sm:pb-10">
        <div
          className={cn(
            "my-auto flex w-full max-w-full flex-col sm:max-w-[440px]",
            lifted && "[@media(pointer:coarse)]:my-0 [@media(pointer:coarse)]:pt-4",
          )}
        >
          {children}
        </div>
      </div>

      {footer}
    </div>
  );
}
