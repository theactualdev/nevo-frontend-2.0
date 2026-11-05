"use client";

import { useSetupGate } from "@/hooks";
import { ReadFailed } from "../ReadFailed";
import { NotActiveDashboard } from "./NotActiveDashboard";
import { OverviewView } from "./OverviewView";
import { UnconfirmedDashboard } from "./UnconfirmedDashboard";

/**
 * Which dashboard a school gets: D24 OB-00 while it is not active, D04
 * otherwise.
 *
 * THE SERVER'S `inOnboarding`, NOT A COUNT. The Overview used to decide a
 * school was new from `adaptationTotal === 0`, so an unpaid school got D04's
 * "Welcome to Nevo" - a welcome to a product that was not switched on. The
 * setup gate already reads the onboarding state and branches on the field
 * backend said to branch on; this reads the same answer.
 *
 * AN UNCONFIRMED EMAIL COMES FIRST. D01b AC-05 owns that console - the
 * banner, "Add your roster", and the first steps shown paused - and it is the
 * one thing a school can fix before anything here would help. It used to
 * render D04's early Overview, which told the school it "is live on Nevo".
 *
 * NO LONGER FAILS OPEN. If the onboarding read failed, `onboarding` is null
 * and this used to render the ordinary Overview - whose early variant tells a
 * school that "{school} is live on Nevo", which may be a school that hasn't
 * paid (the 2 Nov audit). Telling a running school it's not active would be
 * wrong; telling an unpaid one it's live is just as wrong (Lydia, 4 Nov: "the
 * product asserting a state that is not true ... is worse than any missing
 * feature"). So a failed read says it failed, and offers to ask again.
 */
export function AdminDashboard() {
  const { loading, pause, onboarding, refresh } = useSetupGate();

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
        <div className="mx-auto h-[420px] max-w-[1000px] animate-pulse rounded-xl bg-nevo-cream-elevated" />
      </div>
    );
  }

  if (pause === "email_unconfirmed") {
    return <UnconfirmedDashboard />;
  }

  if (pause === "not_active" && onboarding) {
    return <NotActiveDashboard state={onboarding} />;
  }

  // Not active, active, or neither: only the read can say.
  if (!onboarding) {
    return (
      <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
        <div className="mx-auto max-w-[860px]">
          <h2 className="mt-1 text-[23px] font-semibold tracking-[-0.015em] text-nevo-near-black xl:text-[26px]">
            Overview
          </h2>
          <ReadFailed className="mt-6" what="your school's setup" onRetry={refresh} />
        </div>
      </div>
    );
  }

  return <OverviewView />;
}
