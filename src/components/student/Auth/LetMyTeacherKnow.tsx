"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/shared";
import { authApi } from "@/lib/api";
import { childById, type RememberedChild } from "@/lib/auth/deviceRoster";

/** `resending` is "Try again" on the didn't-send state, which stays up while it goes. */
type Sending = "idle" | "sending" | "sent" | "failed" | "resending";

/**
 * 00a's body and its "Let my teacher know" (design, D3; SCRUM-217), as the
 * frame revised it on 1 Oct: the teacher clears, the child chooses the new
 * PIN.
 *
 * THE CHILD DOES NOT RESET THEIR OWN PIN, AND NOBODY SETS ONE FOR THEM. This
 * asks; the adult already linked to them clears it; the child then sets a new
 * one themselves. It shows no PIN and sets none - `POST /auth/pin/reset`
 * answers 202 with nothing about the account.
 *
 * WHICH CHILD comes from the PIN screen that sent them here, as the roster's
 * opaque id. The school code and identifier are looked up on the device at
 * the moment of asking and never put in the address. With no remembered child
 * to ask for - this page opened directly, or the entry aged out - there is
 * nothing to send, so there is no button: absence is the instruction. "Back
 * to sign in" is then the only way on, and takes the primary style the sent
 * state draws it in. NOT DRAWN: 00a always has a child to ask for.
 *
 * "YOUR TEACHER KNOWS" ONLY ONCE THE SERVER TOOK IT. The sent state replaces
 * the whole body, as the frame draws it, and only after the 202 - never on
 * the tap.
 *
 * "THAT DIDN'T SEND" REPLACES THE WHOLE BODY TOO (D60), as 00a draws it on
 * 6 Oct: "didn't-send state owns the failure, stays pressable". A refresh
 * mark, the frame's words, "Try again" - which sends the same ask again - and
 * the way back under it. It was the asking body with an interim line of ours
 * added under the buttons.
 */
export function LetMyTeacherKnow({
  childId,
  back,
}: {
  childId?: string;
  /** The sign-in door, carrying where the child was going. */
  back: string;
}) {
  /*
   * Read after mount: the roster is in localStorage, which the server cannot
   * see. Undefined until then - and while it is, an id in the address draws
   * the asking layout, so the ordinary arrival does not swap its buttons
   * under the child's finger. Nothing is sent before the read: `ask` needs
   * the child it found.
   */
  const [child, setChild] = useState<RememberedChild | null | undefined>(
    undefined,
  );
  useEffect(() => {
    const find = () => setChild(childId ? childById(childId) : null);
    find();
  }, [childId]);
  const asking = child === undefined ? Boolean(childId) : child !== null;
  const [sending, setSending] = useState<Sending>("idle");

  const didntSend = sending === "failed" || sending === "resending";

  const ask = () => {
    if (!child || sending === "sent") return;
    if (sending === "sending" || sending === "resending") return;
    setSending(didntSend ? "resending" : "sending");
    authApi
      .requestPinReset({
        schoolCode: child.schoolCode,
        loginIdentifier: child.loginIdentifier,
      })
      .then(
        () => setSending("sent"),
        () => setSending("failed"),
      );
  };

  return (
    <div
      aria-live="polite"
      className="flex flex-1 flex-col items-center justify-center px-9 pb-12 text-center sm:px-10 sm:pb-16"
    >
      {sending === "sent" ? (
        <>
          <span className="flex size-[72px] items-center justify-center rounded-full bg-nevo-navy motion-safe:animate-nevo-pop sm:size-[88px]">
            <Check
              className="size-9 text-nevo-cream sm:size-11"
              strokeWidth={2.6}
              aria-hidden
            />
          </span>
          <h1 className="mt-7 text-[23px] font-semibold tracking-[-0.01em] sm:mt-8 sm:text-[28px]">
            Your teacher knows
          </h1>
          <p className="mt-3.5 max-w-[300px] text-base leading-[1.55] text-pretty text-nevo-near-black/70 sm:mt-4 sm:max-w-[420px] sm:text-lg lg:max-w-[440px]">
            Once they&apos;ve cleared your old PIN, sign in again and choose
            your new one.
          </p>
          <Button
            asChild
            className="mt-8 w-full text-base sm:mt-9 sm:max-w-[360px]"
          >
            <Link href={back}>Back to sign in</Link>
          </Button>
        </>
      ) : didntSend ? (
        <>
          <span className="flex size-[72px] items-center justify-center rounded-full bg-nevo-violet/22 sm:size-[88px]">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
              className="size-8 text-nevo-navy sm:size-10"
            >
              <path d="M3 12a9 9 0 1 0 2.6-6.4" />
              <path d="M3 4v4h4" />
            </svg>
          </span>
          <h1 className="mt-7 text-[23px] font-semibold tracking-[-0.01em] sm:mt-8 sm:text-[28px]">
            That didn&apos;t send
          </h1>
          <p className="mt-3.5 max-w-[300px] text-base leading-[1.55] text-pretty text-nevo-near-black/70 sm:mt-4 sm:max-w-[420px] sm:text-lg lg:max-w-[440px]">
            That&apos;s on us, not you. Try letting your teacher know again.
          </p>
          <Button
            loading={sending === "resending"}
            onClick={ask}
            className="mt-8 w-full text-base sm:mt-9 sm:max-w-[360px]"
          >
            Try again
          </Button>
          <Button
            asChild
            variant="ghost"
            className="mt-2 h-12 w-full text-base hover:bg-nevo-cream-elevated sm:max-w-[360px]"
          >
            <Link href={back}>Back to sign in</Link>
          </Button>
        </>
      ) : (
        <>
          <Image
            src="/illustrations/error.png"
            alt="A calm figure with an open, questioning hand"
            width={1254}
            height={1254}
            sizes="248px"
            priority
            className="size-[184px] object-contain sm:size-[248px]"
          />
          <h1 className="mt-8 text-[23px] font-semibold tracking-[-0.01em] sm:mt-9 sm:text-[28px]">
            Forgot your PIN?
          </h1>
          <p className="mt-3.5 max-w-[300px] text-base leading-[1.55] text-pretty text-nevo-near-black/70 sm:mt-4 sm:max-w-[420px] sm:text-lg lg:max-w-[440px]">
            That&apos;s okay. Your teacher can clear your old PIN, and then
            you&apos;ll choose a new one yourself.
          </p>
          {asking ? (
            <>
              <Button
                loading={sending === "sending"}
                onClick={ask}
                className="mt-8 w-full text-base sm:mt-9 sm:max-w-[360px]"
              >
                Let my teacher know
              </Button>
              <Button
                asChild
                variant="ghost"
                className="mt-2 h-12 w-full text-base hover:bg-nevo-cream-elevated sm:max-w-[360px]"
              >
                <Link href={back}>Back to sign in</Link>
              </Button>
            </>
          ) : (
            <Button
              asChild
              className="mt-8 w-full text-base sm:mt-9 sm:max-w-[360px]"
            >
              <Link href={back}>Back to sign in</Link>
            </Button>
          )}
        </>
      )}
    </div>
  );
}
