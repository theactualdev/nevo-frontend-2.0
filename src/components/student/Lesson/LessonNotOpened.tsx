"use client";

import Image from "next/image";
import { Button } from "@/components/shared";
import { Wordmark } from "@/components/shared/BrandMarks";

/**
 * D90, "Couldn't open lesson" (frame 28, all three breakpoints, 6 Oct).
 *
 * A lesson that nothing resolved: the read said 404, or a signed-out visitor
 * asked for an id the walkthrough does not hold. It replaces an interim card
 * of our own - "We couldn't find that lesson" and a second sentence guessing
 * that it "may have been put away", which no field ever said.
 *
 * THE FRAME'S ONE LINE AND ONE WAY OUT, and nothing else. No reason, because
 * the screen cannot know one, and no retry, because a lesson that is not
 * there is not a load that failed - that has its own screen, `LessonError`.
 * The wordmark is drawn here because the lesson routes render bare, outside
 * the shell that would otherwise carry it.
 */
export function LessonNotOpened({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex min-h-[100dvh] w-full flex-col items-center justify-center bg-nevo-cream px-10 text-center text-nevo-near-black">
      <Wordmark size="compact" className="mb-7 sm:mb-9" />
      <Image
        src="/illustrations/error.png"
        alt=""
        width={1254}
        height={1254}
        sizes="220px"
        priority
        className="-my-3.5 size-[180px] object-contain sm:size-[220px]"
      />
      <h1 className="mt-7 text-xl leading-[1.3] font-medium sm:mt-8 sm:text-2xl">
        We couldn&apos;t open that lesson.
      </h1>
      <Button
        className="mt-7 w-full max-w-[290px] text-base sm:mt-9 sm:max-w-[340px]"
        onClick={onBack}
      >
        Back to lessons
      </Button>
    </div>
  );
}
