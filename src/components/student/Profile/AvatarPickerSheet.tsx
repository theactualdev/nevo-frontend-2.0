"use client";

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { StudentAvatar } from "@/components/student/Shell/StudentAvatar";
import { AVATAR_LOOKS, type AvatarLook } from "@/lib/profile/avatarLook";
import { cn } from "@/lib/utils";

/**
 * "Choose your look" (frame 27, avatar selector).
 *
 * The frame (928cf30) draws a mobile bottom sheet: a close button, the title,
 * and all eighteen looks - six shapes in each of three tones, a row each - as
 * the one `StudentAvatar` (SCRUM-324): a shape on a round tile, never the
 * child's initials (Lydia, 4 Nov). The star is one of them (SCRUM-322). The
 * chosen one wears the navy ring. There is no Save - tapping a look IS the
 * choice, which is why the sheet closes on it.
 *
 * Tablet: the frame's centred card, 520 wide, with the tiles at 60px. The
 * phone's are 46px, where the shape fills 58% of the tile, not 46%.
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
        className="gap-0 rounded-t-[16px] border-0! bg-nevo-cream px-6 pt-5 pb-8 text-nevo-near-black shadow-[0_-8px_32px_rgba(0,0,0,0.16)] sm:inset-x-auto! sm:top-1/2 sm:bottom-auto! sm:left-1/2! sm:w-[520px] sm:max-w-[calc(100%-48px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[16px] sm:px-10 sm:pt-7 sm:pb-10 sm:shadow-[0_8px_32px_rgba(0,0,0,0.16)]"
      >
        <SheetTitle className="text-[19px] font-semibold text-nevo-near-black">
          Choose your look
        </SheetTitle>
        <div className="mt-5 grid grid-cols-[repeat(6,46px)] justify-between gap-2 p-1 sm:grid-cols-[repeat(6,60px)] sm:gap-[14px]">
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
                  "flex size-[46px] cursor-pointer rounded-full transition-[transform,filter] hover:brightness-[0.96] active:scale-95 sm:size-[60px]",
                  chosen &&
                    "outline-[2.5px] outline-offset-3 outline-nevo-navy outline-solid",
                )}
              >
                <StudentAvatar
                  look={look}
                  className="size-full"
                  glyphClassName="size-[58%] sm:size-[46%]"
                />
              </button>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
