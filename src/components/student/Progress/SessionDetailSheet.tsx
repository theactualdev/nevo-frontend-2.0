"use client";

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/shared";
import type { SessionRow } from "./progressData";

/**
 * Session Detail (Subject Detail frame) - tapping a session marker on the growth
 * line opens this calm look at that one session: the date, the lesson, and a
 * plain-language note. Qualitative only - never a mark. A bottom sheet on
 * mobile, a centred card on tablet/desktop, dismissed by Close or the scrim.
 */
export function SessionDetailSheet({
  session,
  open,
  onOpenChange,
}: {
  session: SessionRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!session) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        data-nevo-console="student"
        side="bottom"
        aria-describedby={undefined}
        className="gap-0 rounded-t-[20px] border-0! bg-nevo-cream px-6 pt-5 pb-8 text-nevo-near-black shadow-[0_-8px_32px_rgba(0,0,0,0.16)] sm:inset-x-auto! sm:top-1/2 sm:bottom-auto! sm:left-1/2! sm:w-[480px] sm:max-w-[calc(100%-48px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[20px] sm:p-8 sm:shadow-[0_8px_32px_rgba(0,0,0,0.16)]"
      >
        <span className="pr-12 font-mono text-xs tracking-[0.1em] text-nevo-near-black/55 uppercase">
          {session.date}
        </span>
        <SheetTitle className="mt-2 text-xl font-semibold tracking-[-0.01em] text-nevo-near-black">
          {session.title}
        </SheetTitle>
        <p className="mt-3 max-w-[520px] text-base leading-[1.6] text-nevo-near-black">
          {session.note}
        </p>

        <Button className="mt-7 w-full" onClick={() => onOpenChange(false)}>
          Close
        </Button>
      </SheetContent>
    </Sheet>
  );
}
