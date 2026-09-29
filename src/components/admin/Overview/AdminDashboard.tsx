"use client";

import { useSetupGate } from "@/hooks";
import { NotActiveDashboard } from "./NotActiveDashboard";
import { OverviewView } from "./OverviewView";

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
 * AN UNCONFIRMED EMAIL COMES FIRST. D01b AC-05 owns that console - its banner
 * and paused rows are drawn on the Overview - and it is the one thing a
 * school can fix before anything here would help.
 *
 * FAILS OPEN. If the onboarding read failed, `onboarding` is null and the
 * ordinary Overview renders, exactly as the gate pauses nothing on a failed
 * read. Telling a running school it is not active, on no evidence, would be
 * the worst sentence this page could say.
 */
export function AdminDashboard() {
  const { loading, pause, onboarding } = useSetupGate();

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
        <div className="mx-auto h-[420px] max-w-[1000px] animate-pulse rounded-xl bg-nevo-cream-elevated" />
      </div>
    );
  }

  if (pause === "not_active" && onboarding) {
    return <NotActiveDashboard state={onboarding} />;
  }

  return <OverviewView />;
}
