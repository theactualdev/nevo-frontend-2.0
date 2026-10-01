"use client";

import { LogOut } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/shared";

/**
 * Sign-out confirmation (`Sign Out Modal` - student, gentler variant). A calm
 * check before ending a session, so an accidental tap never signs anyone out:
 * violet log-out badge, "Sign out?", the reassurance that progress is saved,
 * primary Sign out + quiet Stay signed in. Bottom sheet on mobile, centred card
 * on tablet/desktop; honours reduced-motion via the shared sheet.
 *
 * A CHILD WHO SIGNS IN THROUGH THEIR SCHOOL HAS NO PIN (D9), so for them the
 * line loses its PIN and keeps the rest. Removing the false half is the whole
 * change; nothing new is said in its place.
 */
export function SignOutSheet({
  open,
  onOpenChange,
  onSignOut,
  sso = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSignOut: () => void;
  /** Signed in through their school, so there is no PIN to come back with. */
  sso?: boolean;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        aria-describedby={undefined}
        className="gap-0 rounded-t-[20px] border-0! bg-nevo-cream px-6 pt-6 pb-8 text-center text-nevo-near-black shadow-[0_-8px_32px_rgba(0,0,0,0.16)] sm:inset-x-auto! sm:top-1/2 sm:bottom-auto! sm:left-1/2! sm:w-[400px] sm:max-w-[calc(100%-48px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[16px] sm:p-8 sm:shadow-[0_24px_60px_rgba(0,0,0,0.28)]"
      >
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-nevo-violet/22 text-nevo-navy">
          <LogOut className="size-[26px]" strokeWidth={1.9} />
        </span>
        <SheetTitle className="mt-4 text-center text-xl font-semibold text-nevo-near-black">
          Sign out?
        </SheetTitle>
        <p className="mt-2 text-sm leading-[1.55] text-nevo-near-black/62">
          {sso
            ? "You can come back anytime. Your progress is saved."
            : "You can come back anytime with your PIN. Your progress is saved."}
        </p>

        <Button className="mt-6 w-full" onClick={onSignOut}>
          Sign out
        </Button>
        <Button
          variant="ghost"
          className="mt-2 h-12 w-full text-[15px]"
          onClick={() => onOpenChange(false)}
        >
          Stay signed in
        </Button>
      </SheetContent>
    </Sheet>
  );
}
