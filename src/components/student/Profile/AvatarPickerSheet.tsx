"use client";

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { AVATAR_TONES, type AvatarTone } from "@/lib/profile/avatarTone";
import { cn } from "@/lib/utils";

/**
 * "Choose your look" (frame 27, avatar selector).
 *
 * The frame draws a mobile bottom sheet: a close button, the title, and eight
 * discs in a four-column grid, each carrying the child's own initials so they
 * see themselves in every option. The chosen one wears a navy ring. There is
 * no Save - tapping a disc IS the choice, which is why the sheet closes on it.
 *
 * Tablet and desktop are not drawn; they get the centred card the sign-out
 * sheet already uses, so the two sheets on this screen behave alike.
 */
export function AvatarPickerSheet({
  open,
  onOpenChange,
  initials,
  current,
  onChoose,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initials: string;
  current: AvatarTone;
  onChoose: (tone: AvatarTone) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        aria-describedby={undefined}
        className="gap-0 rounded-t-[20px] border-0! bg-nevo-cream px-6 pt-5 pb-8 text-nevo-near-black shadow-[0_-8px_32px_rgba(0,0,0,0.16)] sm:inset-x-auto! sm:top-1/2 sm:bottom-auto! sm:left-1/2! sm:w-[420px] sm:max-w-[calc(100%-48px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[16px] sm:p-8 sm:shadow-[0_24px_60px_rgba(0,0,0,0.28)]"
      >
        <SheetTitle className="text-[19px] font-semibold text-nevo-near-black">
          Choose your look
        </SheetTitle>
        <div className="mt-5 grid grid-cols-4 gap-4">
          {AVATAR_TONES.map((tone) => {
            const chosen = tone.id === current.id;
            return (
              <button
                key={tone.id}
                type="button"
                aria-label={tone.label}
                aria-pressed={chosen}
                onClick={() => onChoose(tone)}
                style={{ background: tone.background, color: tone.text }}
                className={cn(
                  "flex aspect-square cursor-pointer items-center justify-center rounded-full text-xl font-semibold transition-transform active:scale-95",
                  chosen &&
                    "outline-[2.5px] outline-offset-2 outline-nevo-navy outline-solid",
                )}
              >
                <span aria-hidden>{initials}</span>
              </button>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
