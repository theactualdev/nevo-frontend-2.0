"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { studentEntryApi } from "@/lib/api/studentEntry";
import { WaitingOnConsent } from "./WaitingOnConsent";

/**
 * The entry link, re-sequenced. Frame 31 (22 Sep) and frame 00d.
 *
 * **CONSENT IS CHECKED HERE, BEFORE THE SEQUENCE.** The old flow sat a child
 * through the whole assessment and met them with a gate at the end; this one
 * resolves the link first, so an unconsented child never starts.
 *
 * ## What this deliberately does NOT do
 *
 * **It does not hold a SIGNED-IN child.** Only the link path is ruled. Whether a
 * returning unconsented child signing in by PIN is held too is an open design
 * question (asked 22 Sep, re-asked 23 Sep), and it is the same question the
 * parent lane raised from the other side on 23 Sep - `ConsentGateResponse`
 * carries a required `blocked` that nothing reads, and the 7 Sep SCRUM-80
 * ruling ("Nevo is not the consent gate, the child proceeds normally") has not
 * been withdrawn in words. `consents.ts` holds that note. **Nothing here
 * touches that path.**
 *
 * **It does not read `accountReady` or `ageCheckPending`.** Both are declared
 * on the wire type so they stop being erased, and both are unanswered: the
 * first has two plausible readings that route a child to different screens,
 * and the second is a disputed date of birth, which is not a missing consent
 * and has no frame.
 *
 * **It does not poll.** One resolve. See `WaitingOnConsent`.
 */
export function StudentEntry({ token }: { token: string }) {
  const router = useRouter();
  const [held, setHeld] = useState<boolean | null>(null);

  /**
   * ONE RESOLVE PER TOKEN, and the guard is a ref rather than the effect's own
   * cleanup on purpose.
   *
   * `router` belongs in the dependency list - it is used - so the effect
   * re-runs whenever its identity changes. Cancelling the in-flight read on
   * each re-run would abandon the only request and leave a child on the blank
   * for ever; re-requesting would poll, which is the one thing frame 00d
   * forbids. So a re-run is a no-op, and liveness is tracked for the component
   * rather than for the effect run.
   */
  const askedFor = useRef<string | null>(null);
  const live = useRef(true);
  useEffect(() => () => void (live.current = false), []);

  useEffect(() => {
    if (askedFor.current === token) return;
    askedFor.current = token;

    void studentEntryApi
      .resolve(token)
      .then((state) => {
        if (!live.current) return;
        if (state.consentState === "pending") {
          setHeld(true);
          return;
        }
        setHeld(false);
        onward();
      })
      .catch(() => {
        /*
         * A FAILED READ IS NOT A MISSING CONSENT, and this is the same ruling
         * `useConsentGate` already made for withdrawal: a dropped network, a
         * backend having a bad minute and a child on 3G all look identical to
         * "not consented", and holding on any of them would turn an outage
         * into a wall a child cannot get past and cannot be told about.
         *
         * Handing onward is also the SAFE direction here rather than the
         * lenient one, because the destination validates the link itself - an
         * expired or revoked invitation is refused at the door there, with
         * words. So a child whose read failed meets the ordinary flow, and a
         * child whose LINK is bad still meets the truth about it.
         */
        if (!live.current) return;
        setHeld(false);
        onward();
      });

    function onward() {
      /*
       * TODAY'S FLOW, NOT THE RE-SEQUENCED ONE. Frame 31 draws
       * "The Close -> PIN Creation" with no name, school or class step, because
       * the school already recorded the child and `resolve` returns those
       * fields. Building that half needs `accountReady` answered - it decides
       * whether a consented child goes to PIN creation or to sign-in - so the
       * onward path stays the working one and the richer version is filed
       * rather than guessed.
       */
      router.replace(`/student/onboarding?token=${encodeURIComponent(token)}`);
    }
  }, [token, router]);

  /*
   * A deliberate blank while the resolve is in flight, and while handing
   * onward. Absence is an instruction: a spinner here would be the "door held
   * shut" the frame refuses, and a child who IS consented would see it flash
   * on their way past for no reason.
   */
  if (held !== true) return null;

  return <WaitingOnConsent />;
}
