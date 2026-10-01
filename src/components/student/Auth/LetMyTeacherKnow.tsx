"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/shared";
import { authApi } from "@/lib/api";
import { childById, type RememberedChild } from "@/lib/auth/deviceRoster";

type Sending = "idle" | "sending" | "sent" | "failed";

/**
 * 00a's "Let my teacher know" (design, D3; SCRUM-217).
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
 * nothing to send, so there is no button: absence is the instruction.
 *
 * "SENT" ONLY ONCE THE SERVER TOOK IT, and only "sent": a 202 says the request
 * was accepted, not who was told or when, so the screen claims no more than
 * that. A refusal says so and leaves the button to try again.
 *
 * NOT DRAWN: 00a has no button and design gave none of these words. They are
 * the plainest the behaviour allows, and are listed for design.
 */
export function LetMyTeacherKnow({ childId }: { childId?: string }) {
  // Read after mount: the roster is in localStorage, which the server cannot see.
  const [child, setChild] = useState<RememberedChild | null>(null);
  useEffect(() => {
    const find = () => setChild(childId ? childById(childId) : null);
    find();
  }, [childId]);
  const [sending, setSending] = useState<Sending>("idle");

  if (!child) return null;

  const ask = () => {
    if (sending === "sending" || sending === "sent") return;
    setSending("sending");
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
    <div className="mt-3 flex w-full flex-col items-center">
      {sending === "sent" ? (
        <p
          role="status"
          className="flex h-13 items-center text-base font-medium text-nevo-navy"
        >
          Sent
        </p>
      ) : (
        <Button
          variant="secondary"
          loading={sending === "sending"}
          onClick={ask}
          className="w-full text-base sm:max-w-[360px]"
        >
          Let my teacher know
        </Button>
      )}
      {sending === "failed" && (
        <p
          role="status"
          className="mt-3 max-w-[300px] text-sm leading-[1.5] text-nevo-near-black/70 sm:max-w-[360px]"
        >
          We couldn&apos;t send that just now - that&apos;s on us, not you. Try
          again in a moment.
        </p>
      )}
    </div>
  );
}
