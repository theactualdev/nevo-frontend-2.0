"use client";

import Image from "next/image";
import { Button } from "@/components/shared";
import { Wordmark } from "@/components/shared/BrandMarks";
import { REPLACED_ELSEWHERE_COPY } from "./signInMoments";

/**
 * Board 28, "Signed in here, other tablet released" (D59): this sign-in ended
 * the same account's session on another device
 * (`SessionResponse.replacedSession`).
 *
 * A SCREEN OF ITS OWN, WITH A CONTINUE, rather than a line riding the
 * "Welcome back" beat - which is where the interim words sat until design
 * drew it. The beat moves on by itself after a moment, so a child could miss
 * a line on it; this waits for them. Continue then goes on exactly as the
 * sign-in would have: the beat, or straight to the waiting screen for a child
 * who is held.
 *
 * The frame's layout is the signed-in-elsewhere screen's (`SessionEndScreen`,
 * `replaced`) with the body line gone: the wordmark, the concurrent-session
 * art, one heading and one button.
 */
export function SignedInHereScreen({ onContinue }: { onContinue: () => void }) {
  return (
    <main className="flex min-h-[100dvh] w-full flex-col items-center justify-center bg-nevo-cream px-10 text-center text-nevo-near-black">
      <Wordmark size="compact" className="mb-7 sm:mb-9" />
      <Image
        src="/illustrations/concurrent-session.png"
        alt=""
        width={1254}
        height={1254}
        sizes="220px"
        priority
        className="-my-3.5 size-[180px] object-contain sm:my-0 sm:h-[184px] sm:w-[220px]"
      />
      <h1 className="mt-7 text-xl leading-[1.3] font-medium sm:mt-8 sm:max-w-[460px] sm:text-2xl lg:max-w-[520px]">
        {REPLACED_ELSEWHERE_COPY}
      </h1>
      <Button
        onClick={onContinue}
        className="mt-8 w-full max-w-[290px] text-base sm:mt-9 sm:max-w-[340px]"
      >
        Continue
      </Button>
    </main>
  );
}
