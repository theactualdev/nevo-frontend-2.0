"use client";

import { useEffect, useState } from "react";
import { pauseNote } from "@/context/SetupGateContext";
import { useSetupGate } from "@/hooks";
import { emailConfirmationApi } from "@/lib/api/emailConfirmation";
import { schoolApi } from "@/lib/api/school";
import { cn } from "@/lib/utils";
import { PRIMARY_BTN } from "../Roster/primitives";
import { SetupPausedBanner } from "../SetupPausedBanner";

const CARD = "rounded-xl bg-nevo-cream-elevated shadow-[0_2px_8px_rgba(0,0,0,0.06)]";

/**
 * D01b AC-05, the unconfirmed console: look around, writes paused.
 *
 * WAS D04's EARLY OVERVIEW, which told a school that hadn't confirmed its
 * email - let alone paid - that it "is live on Nevo", and invited it to share
 * a school code that works for nothing yet (the 2 Nov audit, launch-level).
 * AC-05 draws something else: the banner, then the one thing to do next -
 * "Add your roster" - with the reason it can't be done yet, and the two other
 * first steps shown paused.
 *
 * "UPLOAD A ROSTER" ANSWERS WHEN PRESSED. Writes are paused, so pressing it
 * can't upload; what it does is say why, with the resend right there
 * (SCRUM-151 wants the resend inside the paused line). A button that did
 * nothing would be a control that does nothing.
 *
 * One wording for one reason: the paused line is the gate's (`pauseNote`),
 * and the resend states are the banner's.
 */
export function UnconfirmedDashboard() {
  const { email } = useSetupGate();
  const [school, setSchool] = useState<string | null>(null);
  const [asked, setAsked] = useState(false);
  const [resend, setResend] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const paused = pauseNote("email_unconfirmed");

  useEffect(() => {
    let alive = true;
    schoolApi
      .get()
      .then((sc) => {
        if (alive) setSchool(sc.name?.trim() || null);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const again = () => {
    if (resend === "sending") return;
    setResend("sending");
    emailConfirmationApi
      .resend()
      .then(() => setResend("sent"))
      .catch(() => setResend("failed"));
  };

  return (
    <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
      <div className="mx-auto max-w-[860px]">
        <SetupPausedBanner />

        <div className="mt-7">
          {school ? (
            <span className="text-[13px] text-nevo-near-black/55 xl:text-[13.5px]">Overview</span>
          ) : null}
          <h2 className="mt-1 text-[23px] font-semibold tracking-[-0.015em] text-nevo-near-black xl:text-[26px]">
            {school ?? "Overview"}
          </h2>
        </div>

        <div className={cn(CARD, "mt-6 px-[26px] py-7")}>
          <h3 className="m-0 text-[19px] font-semibold text-nevo-near-black">Add your roster</h3>
          <p className="m-0 mt-2 max-w-[60ch] text-[15px] leading-[1.6] text-nevo-near-black/70">
            Upload your staff and students so Nevo can build your classes.
          </p>
          <button type="button" onClick={() => setAsked(true)} className={cn(PRIMARY_BTN, "mt-5")}>
            Upload a roster
          </button>
          {asked ? (
            <p role="status" className="m-0 mt-3 max-w-[60ch] text-[14px] leading-[1.55] text-nevo-navy">
              Confirm your email first -{" "}
              {email ? `we sent a link to ${email}.` : "we’ve sent you a link."}{" "}
              {resend === "sent" ? (
                "Sent. It may take a minute to arrive."
              ) : resend === "failed" ? (
                "We couldn’t send that just now. Your first link is still valid - try again in a moment."
              ) : (
                <>
                  <button
                    type="button"
                    onClick={again}
                    disabled={resend === "sending"}
                    className="cursor-pointer font-semibold underline underline-offset-2 hover:opacity-75 disabled:cursor-default disabled:opacity-60"
                  >
                    {resend === "sending" ? "Sending…" : "Resend it"}
                  </button>
                  .
                </>
              )}
            </p>
          ) : null}
        </div>

        {/* Shown, and plainly paused: no link, no hover, no promise. */}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {["Create a class", "Invite teachers"].map((title) => (
            <div key={title} className={cn(CARD, "px-[22px] py-[18px]")}>
              <span className="block text-[15px] font-semibold text-nevo-near-black/60">{title}</span>
              <span className="mt-1 block text-[13px] text-nevo-near-black/50">{paused}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
