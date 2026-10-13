"use client";

import Link from "next/link";
import type { PickerEntry } from "@/lib/auth/deviceRoster";
import { ChildAvatar } from "./ChildAvatar";

/**
 * 28c-1 — "Who's learning?": the children this tablet remembers.
 *
 * Replaces the single-identity lock screen, which kept the last child's name on
 * an unauthenticated screen and gave the child before them no way back to their
 * own account except a second one.
 *
 * WHAT IS ON SCREEN IS FIRST NAMES AND SHAPES. The frame: *"First names and
 * avatars only, nowhere a username, surname, class, school code or last-used
 * time."* That is enforced upstream rather than here - this component is handed
 * `PickerEntry`, which structurally cannot carry a credential, so no future
 * edit to this file can put one on screen. See `deviceRoster`.
 *
 * A TILE WITH NO NAME IS EXPECTED (28c-4). A PIN login returns a session, not a
 * profile, so a child can be remembered before we ever learn their name. The
 * shape stands alone rather than inventing a name or falling back to their
 * username, which is what the old lock screen did.
 *
 * Portrait and landscape both, because a tray-mounted tablet cannot be turned -
 * the same reason the rotate prompt has a way through.
 *
 * THE FRAME'S SPACING WHERE THE FRAME DRAWS IT, which is the tablet: 72px
 * above and 44 below in portrait, 48 and 34 in landscape, the heading 32px
 * upright and 30 sideways, the names 23 and 20. A phone keeps the tighter
 * spacing, and on one narrower than 375 the side padding gives up 8px so two
 * tiles still sit side by side - 142 + 16 + 142 is 300, and 360 less 32 a
 * side left 296, which dropped every child into one column.
 */
export function ProfilePicker({
  entries,
  onChoose,
  someoneElseHref,
}: {
  entries: PickerEntry[];
  onChoose: (id: string) => void;
  /** Frame 00c, the full sign-in. Also where a child not on this tablet goes. */
  someoneElseHref: string;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center px-8 pt-10 pb-8 max-[375px]:px-6 sm:px-14 portrait:sm:pt-[72px] portrait:sm:pb-11 landscape:px-10 landscape:pt-8 lg:landscape:pt-12 lg:landscape:pb-[34px]">
      {/* Combined purple wordmark, cropped from the padded 1080-square file -
          the same crop the PIN beat uses, so the two halves of this door do not
          drift apart. */}
      <span className="relative block h-[18px] w-[56px] shrink-0 overflow-hidden sm:h-[22px] sm:w-[68px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/logo-wordmark-purple.png"
          alt="Nevo"
          className="absolute block h-[180px] w-[180px] max-w-none -translate-x-[65px] -translate-y-[87px] sm:h-[220px] sm:w-[220px] sm:-translate-x-[80px] sm:-translate-y-[107px]"
        />
      </span>

      <h1 className="mt-6 mb-8 text-[26px] leading-[normal] font-semibold tracking-[-0.015em] text-nevo-near-black sm:mt-10 sm:mb-11 portrait:sm:text-[32px] landscape:mt-4 landscape:mb-7 landscape:sm:text-[30px] lg:landscape:mt-[26px] lg:landscape:mb-[30px]">
        Who&apos;s learning?
      </h1>

      {/*
        LANDSCAPE SIDE PADDING IS 40px, NOT THE FRAME'S 64px, and the frame is
        why. Its landscape grid declares `max-width:960px` with 142px tiles and
        16px gaps - six of those need 932px - while its 64px padding leaves only
        896px on a 1024-wide tablet. The two disagree, so the frame's own
        layout would wrap six children to five and one: a single lone tile on a
        second row, which is the worst arrangement for a child scanning for
        their own face. Following the declared grid rather than the padding
        keeps them on one row. Raised with design.
      */}
      <div className="flex w-full max-w-[560px] flex-wrap content-start justify-center gap-x-4 gap-y-7 landscape:max-w-[960px] landscape:gap-y-6">
        {entries.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => onChoose(entry.id)}
            /*
             * The NAME is the accessible name, and the shape is decorative -
             * the frame calls the enlarged first name the primary identifier.
             * A nameless tile says "Choose this account" rather than borrowing
             * a shape name: "triangle" is not who anybody is, and a child who
             * cannot yet read is not helped by a screen reader either way.
             */
            aria-label={entry.name ?? "Choose this account"}
            className="flex w-[142px] cursor-pointer flex-col items-center gap-2.5 rounded-2xl border-none bg-transparent px-1.5 py-2.5 transition-[transform,filter] hover:brightness-[0.98] active:scale-[0.97] motion-reduce:transition-none portrait:sm:w-[158px] portrait:sm:gap-3"
          >
            <ChildAvatar
              shapeIndex={entry.shapeIndex}
              className="size-[92px] portrait:sm:size-[104px]"
            />
            {entry.name && (
              <span className="text-center text-[20px] leading-[normal] font-semibold tracking-[-0.01em] text-wrap-pretty text-nevo-near-black portrait:sm:text-[23px]">
                {entry.name}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="mt-auto pt-7">
        <Link
          href={someoneElseHref}
          className="inline-flex h-[50px] cursor-pointer items-center justify-center rounded-[10px] px-5 text-[17px] font-medium text-nevo-navy transition-[background] hover:bg-nevo-navy/8"
        >
          Someone else
        </Link>
      </div>
    </div>
  );
}
