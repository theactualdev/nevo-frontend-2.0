"use client";

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { StudentAvatar } from "@/components/student/Shell/StudentAvatar";
import { AVATAR_LOOKS, type AvatarLook } from "@/lib/profile/avatarLook";
import { cn } from "@/lib/utils";

/**
 * "Choose your look" (frame 27, avatar selector).
 *
 * The frame draws a mobile bottom sheet: a close button, the title, and eight
 * shapes in a four-column grid, each a `Nevo Avatar` look - a shape on a round
 * tile, never the child's initials (Lydia, 4 Nov: "Initials put a child's
 * name on a screen anyone nearby can read"; "Frame 27 is correct and the
 * build changes"). The chosen one wears a navy ring. There is no Save -
 * tapping a look IS the choice, which is why the sheet closes on it.
 *
 * Tablet and desktop are not drawn; they get the centred card the sign-out
 * sheet already uses, so the two sheets on this screen behave alike.
 */
export function AvatarPickerSheet({
  open,
  onOpenChange,
  current,
  onChoose,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current: AvatarLook;
  onChoose: (look: AvatarLook) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        data-nevo-console="student"
        side="bottom"
        aria-describedby={undefined}
        className="gap-0 rounded-t-[16px] border-0! bg-nevo-cream px-6 pt-5 pb-8 text-nevo-near-black shadow-[0_-8px_32px_rgba(0,0,0,0.16)] sm:inset-x-auto! sm:top-1/2 sm:bottom-auto! sm:left-1/2! sm:w-[420px] sm:max-w-[calc(100%-48px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[16px] sm:p-8 sm:shadow-[0_8px_32px_rgba(0,0,0,0.16)]"
      >
        <SheetTitle className="text-[19px] font-semibold text-nevo-near-black">
          Choose your look
        </SheetTitle>
        <div className="mt-5 grid grid-cols-4 gap-4">
          {AVATAR_LOOKS.map((look) => {
            const chosen = look.id === current.id;
            return (
              <button
                key={look.id}
                type="button"
                aria-label={look.label}
                aria-pressed={chosen}
                onClick={() => onChoose(look)}
                className={cn(
                  "flex aspect-square cursor-pointer rounded-full transition-[transform,filter] hover:brightness-[0.96] active:scale-95",
                  chosen &&
                    "outline-[2.5px] outline-offset-3 outline-nevo-navy outline-solid",
                )}
              >
                <StudentAvatar look={look} className="size-full" />
              </button>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
