"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useSignals } from "@/hooks";
import { authApi } from "@/lib/api";
import { invitesApi } from "@/lib/api/invites";
import {
  getOnboardingDraft,
  rememberOnboardedStudent,
} from "@/lib/auth/onboarding";
import { setSession } from "@/lib/auth/session";
import { enterFirstLesson } from "@/lib/auth/entryGate";
import { useNextLessonHref } from "@/hooks/useNextLessonHref";
import { flushPendingBaseline } from "@/lib/profiling/pendingBaseline";
import { randomId } from "@/lib/utils";
import { ProfilingFlow } from "@/components/student/Profiling/ProfilingFlow";
import { TransitionScreen } from "./TransitionScreen";
import { LearningNotice } from "./LearningNotice";
import { PinCreationScreen } from "./PinCreationScreen";
import { YoureInScreen } from "./YoureInScreen";

/**
 * Onboarding Phase C — one continuous experience: a calm transition, the
 * Baseline Cognitive Profiling flow (SCRUM-104 — design retired the Observed
 * Interaction Sequence's four activities and this flow took their slot), the
 * Consent Gate, PIN Creation, and the "You're In" hand-off into the app.
 * Manual students arrive from Steps 1–3, SSO students from the callback; only
 * the transition copy and the PIN step differ, driven by the session
 * (`user.method`), never a URL param.
 */
export function ObservedInteractionSequence() {
  const router = useRouter();
  const { user } = useAuth();
  const isSso = user?.method === "sso";
  /*
   * The join token, and the identifier redeeming it hands back.
   *
   * A ref rather than state: it is written inside the PIN screen's own store
   * step and read in the completion that immediately follows, so it must not
   * wait for a re-render - and nothing renders from it.
   */
  const joinToken = getOnboardingDraft().joinToken;
  const identifierRef = useRef<string | null>(null);
  // Where "You're In" hands off to. Read here rather than at the tap so the
  // answer is ready by the time a child gets to the last screen.
  const firstLesson = useNextLessonHref();
  /*
   * One profile-seeding session spans the whole sequence.
   *
   * The id used to be `onboarding-${uuid}`, and the prefix was fatal: the
   * ingest contract declares `sessionId` as `format: uuid`, so every
   * onboarding batch failed the client's own UUID guard and was held until
   * the screen unmounted, taking the child's whole profiling stream with it.
   * A bare UUID plus `sessionType: "onboarding"` is what the 3 Sep contract
   * asks for, and it says the same thing honestly.
   *
   * These events are captured BEFORE the account exists. `useSignals` holds
   * them rather than throwing them at a Bearer-only endpoint, and they go out
   * on the first flush after PIN completion creates the session.
   */
  const [sessionId] = useState(() => randomId());
  const { trackEvent, flush } = useSignals(sessionId, undefined, "onboarding");
  const [phase, setPhase] = useState<"transition" | "activities">("transition");
  /*
   * Whether this device can sign the child back in on its own. False for an
   * invite-link child, who has a real account and no school code to pair with
   * their username — see `rememberOnboardedStudent`. Starts true so the
   * celebration does not flash a warning before there is anything to warn about.
   */
  const [deviceRemembered, setDeviceRemembered] = useState(true);
  const [index, setIndex] = useState(0);
  /**
   * The capture session the profiling run parked its vector under.
   *
   * Handed to `flushPendingBaseline` so the vector has to be THIS run every
   * time, not merely whatever is parked. Before the join path stored a
   * session, a mismatched token was doing that job by accident; it is not
   * doing it any more.
   */
  const parkedRunRef = useRef<string | null>(null);

  if (phase === "transition") {
    return (
      <TransitionScreen
        path={isSso ? "sso" : "manual"}
        onDone={() => setPhase("activities")}
        track={trackEvent}
      />
    );
  }

  const advance = () => setIndex((i) => i + 1);

  /*
   * An SSO child is signed in for the whole sequence and never reaches the PIN
   * step that delivers everyone else's baseline, so theirs is parked under
   * their own id and sent from here. `method: "sso"` is written only by the
   * SSO callback, and survives a reload for that same account and no other
   * (`setSession` carries it across a refresh only when the user id matches),
   * so the owner is always the account that signed in through SSO.
   */
  const ssoOwner = isSso ? (user?.id ?? null) : null;

  if (index === 0) {
    return (
      <ProfilingFlow
        track={trackEvent}
        ownerUserId={ssoOwner}
        onDone={(runSessionId) => {
          parkedRunRef.current = runSessionId;
          if (ssoOwner) void flushPendingBaseline(ssoOwner, runSessionId);
          advance();
        }}
      />
    );
  }

  if (index === 1) {
    return <LearningNotice onContinue={advance} track={trackEvent} />;
  }

  if (index === 2) {
    return (
      <PinCreationScreen
        sso={isSso}
        /*
         * A join-link child has no session yet, so there is nothing to
         * `POST /auth/pin` against. Redeeming the invitation IS the account
         * creation: it stores the PIN and hands back the login identifier the
         * next sign-in will be checked against. Without a token there is
         * nowhere to put the PIN, so none is claimed to be stored.
         */
        storePin={async (pin) => {
          const draft = getOnboardingDraft();
          const [first, ...rest] = (draft.name ?? "").trim().split(/\s+/);
          const firstName = first || null;
          const lastName = rest.join(" ") || null;

          // A join link redeems the invitation; that IS the account creation
          // and it carries its own identity.
          if (joinToken) {
            const res = await invitesApi.acceptJoin(joinToken, {
              pin,
              firstName,
              lastName,
            });
            identifierRef.current = res.loginIdentifier;
            /*
             * SIGN THEM IN. Backend put `session` on this response on 16 Sep
             * and this client dropped it, so redeeming an invitation created
             * an account and left the child holding nothing: their first
             * lesson, their progress and their parked baseline all belonged to
             * nobody. It was the recorded launch blocker and it was a field
             * nothing read.
             *
             * Stored exactly as `authApi.completeAccount` stores its own, and
             * guarded because the field is absent on any deployment older than
             * today - then the child is where they were before, not worse off.
             */
            if (res.session) {
              setSession({
                token: res.session.accessToken,
                expiresAt: res.session.expiresAt,
                userId: res.session.userId,
                role: res.session.role,
              });
            }
            /*
             * The baseline this child sat in phase 0 can now reach them.
             *
             * READ THE SECOND ARGUMENT BEFORE CHANGING ANY OF THIS. Until the
             * line above, this path had no session, and that absence was doing
             * the safety work: a parked vector simply could not be sent. Now
             * that a session exists, `session.userId === res.userId` is true by
             * construction and would happily send whatever is parked -
             * including a vector the PREVIOUS child on a shared tablet left
             * behind when their warm-up submit failed. So the flush is told
             * which run parked it, and sends only that one.
             */
            await flushPendingBaseline(res.userId, parkedRunRef.current);
            return;
          }

          /*
           * Otherwise the child came in by school and class code. Both halves
           * of this went public on 3 Sep; before that there was nowhere to put
           * the PIN and no identifier to remember, so this path onboarded a
           * child who then had no account.
           *
           * The connection token is fetched HERE rather than when the class
           * was chosen: it lives 20 minutes, and the profiling probes and
           * consent gate sit in between. Asking for it at the moment it is
           * spent means it cannot go stale in a child's hands.
           */
          /*
           * EITHER FORM. `{ classCode }` alone is what a Teacher Join child
           * has, and it is the more reliable of the two: `ConnectionResponse`
           * declares `schoolCode` nullable, so the `{ classId, schoolCode }`
           * pair is not always available even after a successful join. A child
           * who came through the school-code route has the pair and no code.
           */
          const connection = await authApi.connectClassCode(
            draft.classCode
              ? { classCode: draft.classCode }
              : { classId: draft.classId, schoolCode: draft.schoolCode },
          );
          if (!connection.onboardingToken) {
            throw new Error("no onboarding token");
          }
          const res = await authApi.completeAccount({
            pin,
            onboardingToken: connection.onboardingToken,
            firstName,
            lastName,
            age: draft.age ?? null,
          });
          identifierRef.current = res.loginIdentifier;

          /*
           * The session now exists, so the onboarding stream that has been
           * held since before the account did can finally be addressed.
           * Flushing HERE rather than leaving it to unmount matters: the
           * child is about to be routed into a lesson, and an unmount flush
           * races that navigation.
           */
          // Their account exists now, so the parked baseline finally has an
          // owner. Guarded on the id `completeAccount` just returned: a token
          // left behind by the previous child on a shared tablet cannot satisfy
          // it, which is what stops one child's assessment landing on another's
          // record.
          await flushPendingBaseline(res.userId, parkedRunRef.current);

          flush();
        }}
        onComplete={() => {
          /*
           * The device now belongs to this student - but only if the server
           * issued an identifier it will recognise AND the draft carries the
           * school code that is the other half of the credential. SSO students
           * re-enter through their provider, not a PIN.
           *
           * THE ANSWER IS NOT DISCARDED ANY MORE. An invite-link child has no
           * school code — the join endpoints return a `schoolName` and never a
           * code — so this returns false for them, correctly, and used to do it
           * in silence. They were then told "You're all set" and would find the
           * next morning that the tablet had never heard of them.
           */
          setDeviceRemembered(
            isSso ? true : rememberOnboardedStudent(identifierRef.current),
          );
          advance();
        }}
      />
    );
  }

  // "You're In" — the hand-off out of onboarding straight into the first lesson
  // (Product Arch B.2: land in a lesson, never an empty dashboard). B.2 asks us
  // to land them in a lesson; it does not ask us to invent one, and this screen
  // fires the instant an account is created - so the dashboard read is almost
  // always still in flight here. `useNextLessonHref` is where that is decided.
  return (
    <YoureInScreen
      onDone={() => {
        /*
         * THROUGH THE CONSENT GATE, like every other door. This pushed the
         * first lesson directly - so a child who joined by link, class code or
         * school code was never checked, and one the server holds went
         * straight into a lesson. `enterFirstLesson` opens the lesson, or
         * the waiting screen for a held child; a failed read is not a hold.
         */
        void enterFirstLesson(firstLesson, (to) => router.push(to));
      }}
      track={trackEvent}
      deviceRemembered={deviceRemembered}
    />
  );
}
