"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSetupGate } from "@/hooks";
import { invitesApi, type Invitation } from "@/lib/api/invites";
import type { TeacherDetail } from "@/lib/api/teachers";
import { CheckIcon } from "../Roster/primitives";
import { withBack, type Back } from "../back";
import {
  confirmedSent,
  unconfirmedResendLead,
  unconfirmedResendToast,
} from "../Invitations/deliveryCopy";
import { normaliseStatus } from "../Invitations/inviteStatus";
import { inviteeName, joinLink } from "../Invitations/joinLink";
import { LinkHandout } from "../Invitations/LinkHandout";
import { withResend } from "../Invitations/InvitationsView";
import { openInviteFor } from "./openInvite";

/**
 * RESEND AND REVOKE ON THE TEACHER'S OWN PAGE (backlog 82; SCRUM-40: "the
 * pending state with resend and revoke", deferring to D19's pipeline). An
 * invited teacher's page sent the admin away to Invitations to do either.
 *
 * D19'S OWN CALLS, WORDS AND REFUSALS, not a second set: the invitation is the
 * one the Teachers list's Resend finds (`openInviteFor`, by email - a teacher
 * read carries no invitation id), Resend on a live or expired one, Revoke on a
 * live one only, with D19's inline confirm and lines. Nothing is said about a
 * delivery the server did not confirm: D19's link handout, as there.
 *
 * Where no invitation is found, or the read fails, the page keeps its way to
 * Invitations - which also holds Reissue for a revoked one - and says nothing
 * it cannot back.
 */
export function InviteActions({
  teacher,
  here,
}: {
  teacher: TeacherDetail;
  /** This page, for Back on Invitations. */
  here: Back;
}) {
  const [invite, setInvite] = useState<Invitation | null>(null);
  const [judgedAt, setJudgedAt] = useState<number | null>(null);
  const [read, setRead] = useState<"loading" | "ready" | "failed">("loading");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [resent, setResent] = useState<string | null>(null);
  const [handout, setHandout] = useState<Invitation | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [revoked, setRevoked] = useState(false);
  const { writesPaused } = useSetupGate();

  useEffect(() => {
    let alive = true;
    invitesApi
      .list()
      .then((all) => {
        if (!alive) return;
        const now = Date.now();
        setInvite(openInviteFor(teacher, all, now));
        setJudgedAt(now);
        setRead("ready");
      })
      .catch(() => {
        if (alive) setRead("failed");
      });
    return () => {
      alive = false;
    };
  }, [teacher]);

  const manage = (
    <Link
      href={withBack("/admin/invitations", here)}
      className="font-semibold text-nevo-navy hover:opacity-75"
    >
      Manage the invitation
    </Link>
  );

  const resend = (inv: Invitation) => {
    setBusy(true);
    setHandout(null);
    setResent(null);
    setSaid(null);
    invitesApi
      .resend(inv.id)
      .then((answer) => {
        const updated = withResend(inv, answer);
        setInvite(updated);
        if (!confirmedSent(answer.deliveryStatus)) {
          setHandout(updated);
          setSaid(
            unconfirmedResendToast(answer.deliveryStatus, Boolean(joinLink(updated.token))),
          );
          return;
        }
        setResent(`Invite resent to ${updated.email ?? inviteeName(updated)}`);
      })
      .catch(() => setSaid("That didn't resend. We're on it - try again in a moment."))
      .finally(() => setBusy(false));
  };

  const revoke = (inv: Invitation) => {
    setBusy(true);
    setSaid(null);
    invitesApi
      .revoke(inv.id)
      .then(() => {
        setConfirming(false);
        setRevoked(true);
        setInvite(null);
        setSaid(`${inv.name ?? inv.email ?? "That invite"}'s link no longer works`);
      })
      .catch(() => setSaid("That didn't revoke. We're on it - try again in a moment."))
      .finally(() => setBusy(false));
  };

  const state =
    invite && judgedAt !== null
      ? normaliseStatus(invite.status, invite.expiresAt, judgedAt)
      : null;

  return (
    <div className="mt-5">
      <p className="m-0 text-[13.5px] leading-[1.55] text-nevo-near-black/62">
        This teacher hasn&rsquo;t opened their console yet.
        {read === "failed" || (read === "ready" && !invite && !revoked) ? (
          <> {manage}</>
        ) : null}
      </p>

      {invite && (state === "pending" || state === "expired") ? (
        <div className="mt-2.5 flex items-center gap-4">
          <button
            type="button"
            disabled={busy || writesPaused}
            onClick={() => resend(invite)}
            className="cursor-pointer text-[13.5px] font-semibold text-nevo-navy transition-opacity hover:opacity-75 disabled:opacity-45"
          >
            Resend
          </button>
          {state === "pending" ? (
            <button
              type="button"
              disabled={busy || writesPaused}
              onClick={() => setConfirming((c) => !c)}
              aria-expanded={confirming}
              className="cursor-pointer text-[13.5px] font-semibold text-nevo-near-black/60 transition-opacity hover:opacity-75 disabled:opacity-45"
            >
              Revoke
            </button>
          ) : null}
        </div>
      ) : null}

      {resent ? (
        <p
          role="status"
          className="m-0 mt-3 flex max-w-[520px] items-center gap-[7px] rounded-lg bg-[#e5dfd3] px-3.5 py-2.5 text-[13px] text-nevo-navy motion-safe:animate-nevo-rise"
        >
          <CheckIcon size={13} />
          {resent}
        </p>
      ) : null}

      {said ? (
        <p role="status" className="m-0 mt-2.5 max-w-[520px] text-[13px] leading-[1.5] text-nevo-navy">
          {said}
        </p>
      ) : null}

      {handout ? (
        <LinkHandout
          className="mt-3 max-w-[520px]"
          invites={[handout]}
          lead={unconfirmedResendLead(
            handout.deliveryStatus,
            Boolean(joinLink(handout.token)),
            inviteeName(handout),
          )}
          noLinkHint="Revoke and invite them again to get a fresh link."
        />
      ) : null}

      {/* D19's inline confirm, saying exactly what happens. */}
      {confirming && invite ? (
        <div className="mt-3 max-w-[520px] rounded-[10px] bg-nevo-violet/[0.18] px-4 py-3">
          <p className="m-0 text-[13.5px] font-semibold text-nevo-navy">
            Revoke this invite?
          </p>
          <p className="m-0 mt-1 text-[13.5px] leading-[1.5] text-nevo-navy/85">
            {invite.name ?? invite.email ?? "This person"}&rsquo;s link will stop
            working immediately, and any classes assigned to them come off too.
          </p>
          <div className="mt-3 flex gap-2.5">
            <button
              type="button"
              disabled={busy || writesPaused}
              onClick={() => revoke(invite)}
              className="cursor-pointer rounded-lg bg-nevo-navy px-4 py-2 text-[13.5px] font-semibold text-nevo-cream transition-[filter] hover:brightness-110 disabled:opacity-60"
            >
              Revoke
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="cursor-pointer rounded-lg px-4 py-2 text-[13.5px] font-semibold text-nevo-near-black/70 transition-colors hover:bg-nevo-near-black/[0.06]"
            >
              Keep
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
