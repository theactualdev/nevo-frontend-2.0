"use client";

import { useEffect, useState } from "react";
import { usePermissions, useSetupGate } from "@/hooks";
import { PERMISSION_SCOPES } from "@/lib/constants/permissions";
import { schoolApi } from "@/lib/api/school";
import { DpaStep } from "../Onboarding/DpaStep";

/**
 * NO CONSOLE WITHOUT THE DATA PROCESSING AGREEMENT.
 *
 * The setup wizard asks for it as step 3, but it keeps its place only in
 * memory. A proprietor who confirmed their email, closed the tab and signed in
 * at /auth/admin landed in the full console with no agreement accepted - and
 * nothing anywhere sent them back. `GET /api/v1/school/dpa-acceptance` answers
 * `null` in exactly that case; it was wrapped and never called.
 *
 * So the console's pages wait on it. The rail stays - an admin can see where
 * they are - but every page renders the agreement until it is accepted.
 *
 * AN UNCONFIRMED EMAIL COMES FIRST, as it does in the wizard (confirm, then
 * agree). D01b AC-05 owns that console and its banner.
 *
 * FAILS OPEN. Only a `null` that actually came back holds the console. A read
 * that failed, or has not answered yet, renders the pages as they are: a 500
 * must not turn into "your school hasn't agreed to anything".
 *
 * WHO CAN AGREE. The agreement is accepted "on behalf of" the school, which is
 * a general-oversight decision. An admin without it - invited to a school
 * whose founder never finished - is told who can, rather than handed a
 * checkbox they have no standing to tick.
 */

type Dpa = "unknown" | "accepted" | "missing";

export function DpaGate({ children }: { children: React.ReactNode }) {
  const { pause } = useSetupGate();
  const { resolved, hasScope } = usePermissions();
  const [dpa, setDpa] = useState<Dpa>("unknown");
  const [schoolName, setSchoolName] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    schoolApi
      .dpaAcceptance()
      .then((a) => live && setDpa(a ? "accepted" : "missing"))
      .catch(() => live && setDpa("unknown"));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (dpa !== "missing") return;
    let live = true;
    schoolApi
      .get()
      .then((s) => live && setSchoolName(s.name?.trim() || null))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [dpa]);

  if (dpa !== "missing" || pause === "email_unconfirmed") return <>{children}</>;

  const canAgree = resolved && hasScope(PERMISSION_SCOPES.GENERAL_OVERSIGHT);

  return (
    <div className="mx-auto w-full max-w-[640px] px-6 py-10">
      {canAgree ? (
        <DpaStep
          schoolName={schoolName ?? "your school"}
          onDone={() => setDpa("accepted")}
        />
      ) : (
        <>
          <h2 className="m-0 text-[23px] font-semibold tracking-[-0.018em] text-nevo-near-black">
            Your school hasn&rsquo;t agreed to the data agreement yet
          </h2>
          <p className="mt-2.5 max-w-[56ch] text-[15px] leading-[1.55] text-nevo-near-black/68">
            An administrator with general oversight needs to read and accept
            Nevo&rsquo;s data processing agreement for your school before the
            console opens. Once they have, everything here will be waiting.
          </p>
        </>
      )}
    </div>
  );
}
