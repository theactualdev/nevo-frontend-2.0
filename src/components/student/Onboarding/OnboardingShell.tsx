"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ProgressBar } from "@/components/shared";

/**
 * Shared shell for onboarding Steps 1–3 (UI/UX spec B.2): a thin progress line,
 * a back-chevron + wordmark header, and a single-column content area centred
 * both ways.
 * Full-viewport, no chrome, solid cream.
 *
 * `fill` makes the content area a fixed-height flex column (no page scroll) so a
 * child can own its own scroll region — e.g. Step 3's pinned search + scrolling
 * class list.
 */
export function OnboardingShell({
  step,
  totalSteps = 3,
  backHref,
  fill = false,
  children,
}: {
  step: number;
  totalSteps?: number;
  backHref: string;
  fill?: boolean;
  children: ReactNode;
}) {
  const router = useRouter();

  return (
    <div className="flex min-h-[100dvh] flex-col bg-nevo-cream text-nevo-near-black">
      {/* Progress — position `step` of `totalSteps` */}
      <ProgressBar
        value={step / totalSteps}
        className="shrink-0"
        aria-label={`Step ${step} of ${totalSteps}`}
      />

      {/* Header: back + wordmark */}
      <header className="flex h-14 shrink-0 items-center px-4 sm:h-16 sm:px-5 lg:px-6">
        <button
          type="button"
          aria-label="Back"
          onClick={() => router.push(backHref)}
          className="flex size-11 cursor-pointer items-center justify-center rounded-[10px] transition-colors hover:bg-nevo-near-black/[0.06] active:bg-nevo-near-black/[0.12]"
        >
          <ChevronLeft className="size-6" strokeWidth={2} />
        </button>
        <Image
          src="/brand/nevo-wordmark.png"
          alt="Nevo"
          width={344}
          height={116}
          className="ml-1.5 h-5 w-auto sm:h-[22px] lg:h-6"
        />
      </header>

      {/*
        Content - single column, centred both ways in the space under the
        header (QA, 30 Sep). `my-auto`, not `justify-center`: auto margins
        drop to zero when the content is taller than the space, so a long step
        on a short screen scrolls from its top instead of losing it above the
        fold. A `fill` step owns the whole height, so there is nothing to centre.
      */}
      <div
        className={cn(
          "flex flex-1 flex-col items-center px-6 pb-6 sm:pb-10",
          fill ? "min-h-0 overflow-hidden" : "overflow-y-auto",
        )}
      >
        <div
          className={cn(
            "flex w-full max-w-full flex-col sm:max-w-[440px]",
            fill ? "min-h-0 flex-1" : "my-auto",
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
