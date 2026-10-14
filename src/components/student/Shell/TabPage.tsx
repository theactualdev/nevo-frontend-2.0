import type { ReactNode } from "react";
import { IllustrationWrapper } from "@/components/shared/IllustrationWrapper";
import { cn } from "@/lib/utils";

/**
 * Where a tab's content sits: the frames' scroll padding, the same on Lessons,
 * Progress and Downloads (Nevo Lessons / Progress / Downloads Frame) - 8, 20
 * and 20 round a phone's, 44 on a tablet, 52 on a desktop - and LEFT-ALIGNED.
 * The tabs centred themselves in a max-width box with 32px of padding, so on
 * a tablet a title sat at (96, 24) where the frames put it at (108, 52), and
 * on a desktop it drifted to the middle of the screen.
 *
 * Between a phone and a tablet (640-767, no frame) the old 32/24 stands.
 */
export const TAB_PAGE = "px-5 pt-2 pb-5 sm:px-8 sm:py-6 md:p-11 lg:p-[52px]";

/** The frames' tab heading: 24 / 30 / 32, 8px under the top padding. */
export const TAB_TITLE =
  "mt-2 text-2xl font-semibold tracking-[-0.01em] text-nevo-near-black sm:text-[30px] lg:text-[32px]";

/**
 * What a tab's page box adds to fill the screen, for a state that centres in
 * it (29 Empty States). The shell's content box is a column at least the
 * height of the screen; this grows into it.
 *
 * `min-h-0 basis-0`: the page is the screen's height, not its content's, so
 * what does not fit is taken out of the art (`EmptyArt`) rather than pushed
 * below the fold. (`basis-0` and not `flex-1`'s 0%, which an auto-height
 * column treats as "size to content".) Without it the page grew to hold 29's
 * full-height figure, and on Home - where the greeting and the warm-up card
 * sit above it, which 29 does not draw - the line under the figure landed
 * past the bottom of a phone and of a 1280x832 desktop.
 */
export const TAB_FILL = "flex min-h-0 flex-1 basis-0 flex-col";

/**
 * 29 Empty States' block: the art centred in what is left under the heading,
 * and one line under it at 19 / 22 / 24, at most 280 / 360 / 400 wide - 28px
 * under the art on a phone and 32 from a tablet. The art sizes itself; see
 * `EmptyArt`.
 */
export function TabEmpty({
  art,
  line,
  children,
  className,
  lineClassName,
}: {
  art: ReactNode;
  line: string;
  children?: ReactNode;
  /**
   * The block's padding and the line's margin, where a screen's own block is
   * drawn differently - Home's, under its greeting and warm-up card. The
   * paddings are split by side so an override replaces one cleanly.
   */
  className?: string;
  lineClassName?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 basis-0 flex-col items-center justify-center px-5 pt-6 pb-6 text-center md:px-0",
        className,
      )}
    >
      {art}
      <h2
        className={cn(
          "mt-7 max-w-[280px] shrink-0 text-[19px] font-medium leading-[1.35] text-nevo-near-black md:mt-8 md:max-w-[360px] md:text-[22px] lg:max-w-[400px] lg:text-2xl",
          lineClassName,
        )}
      >
        {line}
      </h2>
      {children}
    </div>
  );
}

/**
 * One of 29's figures, by HEIGHT as the board draws them (`height:Npx;
 * width:auto`). The figures are 2:3 cut-outs, so the width follows; the
 * intrinsic size given here only picks the file the optimiser serves.
 *
 * THE FIGURE GIVES WAY, THE WORDS DO NOT. Inside a `TAB_FILL` page it may
 * shrink below its height (`min-h-0`) to keep the line under it on screen,
 * drawn whole (`object-contain`); with the room, it is 29's size exactly.
 */
export function EmptyArt({
  src,
  className,
}: {
  src: string;
  /** The heights: phone, then `md:` and `lg:`. */
  className: string;
}) {
  return (
    <IllustrationWrapper
      src={src}
      alt=""
      width={244}
      height={366}
      className={cn("min-h-0 w-auto object-contain", className)}
    />
  );
}
