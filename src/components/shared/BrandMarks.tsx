/* eslint-disable @next/next/no-img-element -- fixed crops out of a padded
   1080-square file; the optimiser would only resize what the window hides. */
import { cn } from "@/lib/utils";

/**
 * The three in-product logo files, cropped to the size each system screen
 * draws them at (`35 Logo Placement Reference`).
 *
 * The brand files are padded 1080px squares, so every screen that shows one
 * crops it through an overflow window - the PIN beat, the picker and the
 * waiting screen each carry their own copy of that arithmetic. The session-end,
 * paused, 404 and error screens need the same three marks at a handful of
 * sizes, and four more hand-copied crops is how one of them ends up a pixel
 * off. So they are here, once, with the numbers taken from the frames.
 *
 * All three are the real files from `public/brand`. Nothing here is drawn.
 */

/**
 * `logo-wordmark-purple`. Glyph box x392 y523, 336x108 in the source file.
 *
 * `compact`: 14px, 24px from `sm` - frame 28's concurrent-session and generic
 * error screens. `pause`: 18 / 21 / 22px - the `Account On Pause` frame.
 * `revoked`: 26px - frame 28a. `door`: 30px - 28c-2, the device that
 * remembers nobody. `form`: 17px, 19px from `sm` - 00c's sign-back-in form.
 */
export function Wordmark({
  size,
  className,
}: {
  size: "compact" | "pause" | "revoked" | "door" | "form";
  className?: string;
}) {
  const box = {
    form: "h-[17px] w-[53px] sm:h-[19px] sm:w-[59px]",
    compact: "h-[14px] w-[44px] sm:h-6 sm:w-[75px]",
    pause: "h-[18px] w-[56px] sm:h-[21px] sm:w-[65px] lg:h-[22px] lg:w-[68px]",
    revoked: "h-[26px] w-[81px]",
    door: "h-[30px] w-[93px]",
  }[size];
  const img = {
    form: "h-[170px] w-[170px] -translate-x-[62px] -translate-y-[82px] sm:h-[190px] sm:w-[190px] sm:-translate-x-[69px] sm:-translate-y-[92px]",
    compact:
      "h-[140px] w-[140px] -translate-x-[51px] -translate-y-[68px] sm:h-[240px] sm:w-[240px] sm:-translate-x-[87px] sm:-translate-y-[116px]",
    pause:
      "h-[180px] w-[180px] -translate-x-[65px] -translate-y-[87px] sm:h-[210px] sm:w-[210px] sm:-translate-x-[76px] sm:-translate-y-[102px] lg:h-[220px] lg:w-[220px] lg:-translate-x-[80px] lg:-translate-y-[107px]",
    revoked:
      "h-[260px] w-[260px] -translate-x-[94px] -translate-y-[126px]",
    door: "h-[300px] w-[300px] -translate-x-[109px] -translate-y-[145px]",
  }[size];
  return (
    <span
      className={cn("relative block shrink-0 overflow-hidden", box, className)}
    >
      <img
        src="/brand/logo-wordmark-purple.png"
        alt="Nevo"
        className={cn("absolute block max-w-none", img)}
      />
    </span>
  );
}

/**
 * `logo-combined-purple`, the primary brand mark - which frame 28 puts on the
 * session-expired and 404 screens. 30px tall, 35px from `sm`. Glyph box
 * x256-824 / y453-625 in the source, as `NevoLockup` has it.
 */
export function CombinedMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative block h-[30px] w-[100px] shrink-0 overflow-hidden sm:h-[35px] sm:w-[116px]",
        className,
      )}
    >
      <img
        src="/brand/nevo-logo-combined.png"
        alt="Nevo"
        className="absolute block h-[190px] w-[190px] max-w-none -translate-x-[45px] -translate-y-[80px] sm:h-[220px] sm:w-[220px] sm:-translate-x-[52px] sm:-translate-y-[92px]"
      />
    </span>
  );
}

/**
 * `logo-icon-purple`, which the reference keeps for collapsed sidebars and the
 * SSO screens. 27px, 29px from `sm` - frame 00b.
 */
export function IconMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative block size-[27px] shrink-0 overflow-hidden sm:size-[29px]",
        className,
      )}
    >
      <img
        src="/brand/logo-icon-purple.png"
        alt="Nevo"
        className="absolute block h-[169px] w-[169px] max-w-none -translate-x-[70px] -translate-y-[74px] sm:h-[178px] sm:w-[178px] sm:-translate-x-[75px] sm:-translate-y-[78px]"
      />
    </span>
  );
}
