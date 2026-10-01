"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { studentEntryApi } from "@/lib/api/studentEntry";
import { linkIsDead } from "@/lib/auth/linkAnswer";
import { WelcomeScreen } from "@/components/student/Welcome/WelcomeScreen";
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
 * **The other doors are handled elsewhere, and they are handled.** Design ruled
 * on 23 Sep that the gate is on the child's state rather than the route, so PIN
 * sign-in, the remembered-device unlock and the SSO callback all resolve
 * consent too - through `lib/auth/entryGate`, which is the one copy of that
 * rule. This component is the LINK's share of it and nothing more.
 *
 * **It does not read `accountReady`.** Declared on the wire type so it stops
 * being erased, and still unanswered: the name carries two readings - "no
 * account yet, create a PIN" and "not cleared to have one" - which route a
 * child to different screens. Asked 23 Sep.
 *
 * **It does not poll.** One resolve. See `WaitingOnConsent`.
 */
export function StudentEntry({ token }: { token: string }) {
  const router = useRouter();
  const [held, setHeld] = useState<boolean | null>(null);
  const [dead, setDead] = useState(false);

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
        /*
         * TWO REASONS, ONE SCREEN, AND THE CHILD IS TOLD NEITHER. Design ruled
         * the age check on 23 Sep: *"same screen as 00d, same words, different
         * state underneath. The child is not told why."*
         *
         * The reasoning is worth keeping next to the code, because the obvious
         * "improvement" here is to explain: a disputed date of birth is two
         * adults disagreeing with each other, and telling a child invites them
         * to go and settle it - which makes a child the arbiter between their
         * parent and their school. From where they stand, Nevo is not ready
         * for them yet, and that is true in both states. The adults are told in
         * full, on the administrator's surface.
         */
        if (state.consentState === "pending" || state.ageCheckPending) {
          setHeld(true);
          return;
        }
        setHeld(false);
        onward();
      })
      .catch((err: unknown) => {
        if (!live.current) return;
        /*
         * A DEAD LINK IS TOLD SO HERE, by the link's own endpoint. An unknown,
         * expired or revoked token is a 404 `entry_link_invalid`, and handing
         * that onward left it to a different endpoint to notice. The words are
         * the Welcome's dead-link lines, design's since 24 Sep, and they agree
         * with the server's own: "Ask your teacher for a new link."
         */
        if (linkIsDead(err)) {
          setDead(true);
          return;
        }
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
  if (dead) return <WelcomeScreen linkError />;
  if (held !== true) return null;

  return <WaitingOnConsent />;
}
