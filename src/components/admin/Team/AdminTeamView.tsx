"use client";

import { useCallback, useEffect, useState } from "react";
import {
  SEAT_LIMIT_REACHED,
  adminActivationLink,
  teamApi,
  roleForScopes,
  type AdminTeam,
  type InvitedTeamMember,
  type TeamMember,
} from "@/lib/api/team";
import { ApiError, apiErrorCode } from "@/lib/api/client";
import type { PermissionScope } from "@/lib/constants/permissions";
import { cn } from "@/lib/utils";
import { feedbackApi } from "@/lib/api/feedback";
import { CheckIcon, CloseIcon, PausedNote } from "../Roster/primitives";
import { useSetupGate } from "@/hooks";
import { schoolApi } from "@/lib/api/school";
import { NoAccess, failureKind } from "../NoAccess";
import { getSession } from "@/lib/auth/session";
import { EditAccessPanel, ScopeChecklist } from "./EditAccess";
import { useSupportEmail } from "../SupportEmail";
import {
  seatWords,
  SCOPE_CATALOGUE,
  initialsFor,
  orderScopes,
  scopeName,
} from "./adminScopes";

/**
 * D03 Admin Team & Permissions - who can see and do what.
 *
 * Scopes are assigned one at a time; there are no bundled presets in v1, and
 * the scope names here are the same ones that appear wherever access is
 * described, which is why they live in one catalogue.
 *
 * Four states are drawn: the list, the invite panel, "just you so far" for a
 * new school, and the at-allowance state. A page-level loading and a
 * fetch-failure state are NOT drawn anywhere in the admin set - those two are
 * ours, and deliberately quiet.
 *
 * WHAT THE API DOES NOT CARRY, so the frame cannot be met in full:
 * - no founding flag, so the "Founding" badge and the locked General Oversight
 *   pill (with the note about a school never locking itself out) cannot render
 * - no last-active timestamp, so the frame's "Active today" / "2 days ago"
 *   column has nothing behind it
 * Both are raised with backend rather than invented here.
 *
 * (Two more used to be listed. The SCHOOL NAME was never missing - the school
 * record this screen already reads for the band carries it - and the seat
 * allowance now follows that band. Editing an admin's access shipped on 30
 * Sep - see `EditAccess`.)
 */

const CARD = "rounded-xl bg-nevo-cream-elevated shadow-[0_2px_8px_rgba(0,0,0,0.06)]";

type Phase = "loading" | "ready" | "failed" | "denied";
/** "1 October 2026", or nothing when the date is unreadable. */
function longDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "soon";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

type SendPhase = "idle" | "sending" | "sent";

function ScopePill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-nevo-violet/24 px-[11px] py-1 text-[11.5px] font-semibold text-nevo-navy">
      {label}
    </span>
  );
}

function displayName(m: TeamMember): string {
  const full = [m.firstName, m.lastName].filter(Boolean).join(" ").trim();
  return full || m.email || "Invited admin";
}

export function AdminTeamView() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [inviting, setInviting] = useState(false);
  /** The admin whose access is being edited, if any. */
  const [editing, setEditing] = useState<TeamMember | null>(null);
  /**
   * The allowance as the SERVER states it (8 Oct): limit, used, remaining,
   * overrides included. Null fields mean an older answer carried none, and
   * then nothing about seats is asserted.
   */
  const [seatInfo, setSeatInfo] = useState<Omit<AdminTeam, "members">>({
    seatLimit: null,
    seatsUsed: null,
    seatsRemaining: null,
  });
  /** D03 names the school - "can administer Brightgate Academy". */
  const [school, setSchool] = useState<string | null>(null);

  useEffect(() => {
    schoolApi
      .get()
      .then((sc) => setSchool(sc.name?.trim() || null))
      .catch(() => setSchool(null));
  }, []);

  // No synchronous setState in the effect body (react-hooks/set-state-in-effect):
  // "loading" is already the initial state, so only a retry has to reset it.
  const fetchTeam = useCallback(() => {
    teamApi
      .list()
      .then(({ members, ...seats }) => {
        setTeam(members);
        setSeatInfo(seats);
        setPhase("ready");
      })
      .catch((err: unknown) => setPhase(failureKind(err)));
  }, []);

  useEffect(() => {
    fetchTeam();
  }, [fetchTeam]);

  const retry = () => {
    setPhase("loading");
    fetchTeam();
  };

  return (
    <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
      <div className="mx-auto max-w-[820px]">
        {phase === "loading" && (
          <>
            <Heading count={null} />
            <div className={cn(CARD, "mt-6 h-[280px] animate-pulse")} />
          </>
        )}

        {phase === "denied" && <NoAccess what="the admin team" />}
        {phase === "failed" && (
          <>
            <Heading count={null} />
            {/* No frame draws this; kept quiet and recoverable. */}
            <div className={cn(CARD, "mt-6 px-[26px] py-7")}>
              <h3 className="text-[17px] font-semibold text-nevo-near-black">
                We couldn&rsquo;t load your admin team
              </h3>
              <p className="mt-2 max-w-[52ch] text-sm leading-[1.55] text-nevo-near-black/62">
                Nothing has changed - this is only about showing you the list.
                Try again in a moment.
              </p>
              <button
                type="button"
                onClick={retry}
                className="mt-5 h-[46px] cursor-pointer rounded-[10px] bg-nevo-navy px-5 text-sm font-semibold text-nevo-cream transition-[filter] hover:brightness-110 active:brightness-93"
              >
                Try again
              </button>
            </div>
          </>
        )}

        {phase === "ready" && team.length <= 1 && (
          <JustYou member={team[0]} school={school} onInvite={() => setInviting(true)} />
        )}

        {phase === "ready" && team.length > 1 && (
          <TeamList
            team={team}
            seats={seatInfo}
            school={school}
            onInvite={() => setInviting(true)}
            onEdit={setEditing}
          />
        )}
      </div>

      {/*
        * A DOCKED SHEET OVER THE LIST, not a page in its place.
        *
        * Inviting used to return the InvitePanel INSTEAD of this whole screen,
        * so the team an admin was looking at vanished the moment they pressed
        * Invite - and the seats line, which is the thing that decides whether
        * to invite at all, went with it. SCRUM-40's rule for the console is
        * that "sheets are reserved for a single focused action: assign,
        * invite, enrol, move", and an invite is exactly that.
        */}
      {inviting && (
        <InvitePanel
          atLimit={seatInfo.seatsRemaining !== null && seatInfo.seatsRemaining <= 0}
          seatLimit={seatInfo.seatLimit}
          onCancel={() => setInviting(false)}
          onSent={() => {
            setInviting(false);
            retry();
          }}
        />
      )}

      {editing && (
        <EditAccessPanel
          member={editing}
          name={displayName(editing)}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            retry();
          }}
        />
      )}
    </div>
  );
}

function Heading({ count, school = null }: { count: number | null; school?: string | null }) {
  return (
    <>
      <h2 className="text-[23px] font-semibold tracking-[-0.015em] text-nevo-near-black xl:text-[26px]">
        Admin Team
      </h2>
      {count !== null && (
        <p className="mt-1.5 text-[15.5px] leading-[1.55] text-nevo-near-black/60">
          {`${count} ${count === 1 ? "person" : "people"} can administer ${school ?? "this school"}`}
        </p>
      )}
    </>
  );
}

/**
 * At the allowance, in D03's terms: the seats are in use, and another is added
 * at no charge on request - which is made from the Admin Team page.
 */
function limitLine(limit: number | null): string {
  return `All ${limit === null ? "your" : seatWords(limit)} admin accounts are in use, so this invitation can't be sent yet. Request another account from the Admin Team page - it's added at no charge.`;
}

function SeatsLine({ used, seats }: { used: number; seats: number | null }) {
  return (
    <span className="text-[13px] text-nevo-near-black/55">
      {seats === null
        ? `${used} admin ${used === 1 ? "account" : "accounts"}`
        : `${used} of ${seats} admin accounts`}
    </span>
  );
}

function InviteButton({
  onClick,
  label = "Invite an admin",
}: {
  onClick: () => void;
  label?: string;
}) {
  // D24 / D01b: inviting pauses while setup is unfinished. The note is drawn
  // once under the heading rather than beside each of these.
  const { writesPaused } = useSetupGate();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={writesPaused}
      className="h-[46px] shrink-0 cursor-pointer rounded-[10px] bg-nevo-navy px-5 text-sm font-semibold text-nevo-cream transition-[filter] hover:brightness-110 active:brightness-93 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:brightness-100"
    >
      {label}
    </button>
  );
}

function MemberRow({
  m,
  last,
  you = false,
  onEdit,
}: {
  m: TeamMember;
  last: boolean;
  /** The signed-in admin's own row - D03's grey "You" beside the name. */
  you?: boolean;
  /** Absent where this admin's access cannot be edited from here. */
  onEdit?: () => void;
}) {
  const name = displayName(m);
  const { writesPaused } = useSetupGate();
  /*
   * THE SPEC'S THREE STATES, NOT "ACTIVE OR NOT". This read anything other
   * than `active` as still-pending, so a DEACTIVATED admin wore the violet
   * "Invited" pill - telling the proprietor someone they had removed was on
   * their way in. The spec's enum is active | invited | deactivated; a status
   * outside it carries no pill rather than a guessed one.
   */
  const status = m.status.toLowerCase();
  const pending = status === "invited";
  const deactivated = status === "deactivated";
  return (
    <div
      className={cn(
        "flex items-center gap-[13px] px-[22px] py-[18px]",
        !last && "border-b border-nevo-near-black/7",
      )}
    >
      <span className="flex size-[38px] shrink-0 items-center justify-center rounded-full bg-nevo-navy/10 text-[12.5px] font-semibold text-nevo-navy">
        {initialsFor(name, m.email)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[15px] font-semibold text-nevo-near-black">
            {name}
          </span>
          {you ? (
            <span className="shrink-0 rounded-full bg-nevo-near-black/7 px-2 py-0.5 text-[10.5px] font-semibold text-nevo-near-black/50">
              You
            </span>
          ) : null}
        </span>
        {m.email && (
          <span className="truncate text-[13px] text-nevo-near-black/55">
            {m.email}
          </span>
        )}
        <span className="mt-0.5 flex flex-wrap gap-[6px]">
          {orderScopes(m.scopes).map((s) => (
            <ScopePill key={s} label={scopeName(s)} />
          ))}
          {m.scopes.length === 0 && (
            <span className="text-[12.5px] text-nevo-near-black/45">
              No access yet
            </span>
          )}
        </span>
      </span>
      {pending && (
        <span className="shrink-0 rounded-full bg-nevo-violet/24 px-[11px] py-1 text-[12px] font-semibold text-nevo-navy">
          Invited
        </span>
      )}
      {deactivated && (
        <span className="shrink-0 rounded-full bg-nevo-near-black/8 px-[11px] py-1 text-[12px] font-semibold text-nevo-near-black/60">
          Deactivated
        </span>
      )}
      {onEdit && !deactivated ? (
        <button
          type="button"
          onClick={onEdit}
          disabled={writesPaused}
          className="shrink-0 cursor-pointer text-[13.5px] font-semibold text-nevo-navy hover:underline disabled:cursor-not-allowed disabled:text-nevo-near-black/45 disabled:no-underline"
        >
          Edit access
        </button>
      ) : null}
    </div>
  );
}

function TeamList({
  team,
  seats,
  school,
  onInvite,
  onEdit,
}: {
  team: TeamMember[];
  /** The school's name, or null when its record could not be read. */
  school: string | null;
  /** The server's seat figures; null fields assert nothing. */
  seats: Omit<AdminTeam, "members">;
  onInvite: () => void;
  onEdit: (m: TeamMember) => void;
}) {
  /*
   * WHO CAN ADMINISTER, AND WHO USES A SEAT: everyone not deactivated. A
   * removed admin was counted in "N people can administer" and against the
   * allowance, so a school could be told its seats were full by people who
   * no longer have access.
   */
  const live = team.filter((m) => m.status.toLowerCase() !== "deactivated");
  /** The signed-in admin, whose own row is not editable here. */
  const [me] = useState(() => getSession()?.userId ?? null);
  const supportEmail = useSupportEmail();
  /*
   * The server's count decides, not ours: it knows the limit, overrides
   * included, and who it counts against it. Our own count of live members is
   * only the fallback for an answer that carried no seat figures.
   */
  const limit = seats.seatLimit;
  const used = seats.seatsUsed ?? live.length;
  const atAllowance =
    seats.seatsRemaining !== null
      ? seats.seatsRemaining <= 0
      : limit !== null && used >= limit;
  const [requested, setRequested] = useState<
    "idle" | "sending" | "sent" | "failed"
  >("idle");

  const requestAccount = () => {
    if (requested === "sending" || requested === "sent") return;
    setRequested("sending");
    feedbackApi
      .submit({
        type: "account_request",
        note: `Requesting an additional admin account. All ${limit ?? used} admin accounts are in use.`,
        // Ops' first question about any request is which screen it came from.
        context: "/admin/team",
      })
      .then(() => setRequested("sent"))
      .catch(() => setRequested("failed"));
  };

  return (
    <>
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <Heading count={live.length} school={school} />
        </div>
        {/*
          * THE ACTION STAYS, ALWAYS. At the seat allowance this button was
          * removed outright, so a school that had filled its seats had no path
          * to add anyone at all - and SCRUM-39 is explicit the other way: "At
          * zero remaining the invite action stays visible and routes to
          * Billing." The card below is the explanation, not a replacement for
          * the affordance; a control that vanishes teaches nothing.
          */}
        <InviteButton onClick={onInvite} />
      </div>

      <PausedNote className="mt-3" />

      <div className="mt-5 flex items-center justify-between gap-4">
        <SeatsLine used={used} seats={limit} />
      </div>

      {atAllowance && (
        <div className={cn(CARD, "mt-3 px-[26px] py-6")}>
          <h3 className="text-[16px] font-semibold text-nevo-near-black">
            {`All ${limit === null ? used : seatWords(limit)} admin accounts are in use`}
          </h3>
          <p className="mt-2 max-w-[60ch] text-sm leading-[1.6] text-nevo-near-black/66">
            {limit !== null
              ? `${school ?? "This school"} includes ${seatWords(limit)} admin accounts as standard. `
              : ""}
            Need another?
            We&rsquo;ll add it at no charge - just ask. Keeping the standing
            number small is a data-governance and security measure, not a
            billing one: the fewer accounts that can reach student data, the
            smaller the risk.
          </p>
          {/*
            * THIS BUTTON DID NOTHING. It was `<button type="button">` with no
            * onClick, no handler and no form anywhere in this file to catch a
            * submit - styled as the primary navy CTA, under copy promising
            * "we'll add it at no charge, just ask", and inert when asked. It
            * broke this console's own law, stated at `SettingsView.tsx`: a
            * screen that appears to act and does not is worse than one that
            * admits the control is not built.
            *
            * The old marker said "TODO(api): no endpoint requests an extra
            * account", which was true and beside the point. No BESPOKE
            * endpoint is needed: `POST /api/v1/feedback` is deployed,
            * consumed, and carries `context` so whoever triages it knows
            * which school and which screen. The ask is a sentence to a human,
            * not a seat mutation - nothing here should provision an account.
            */}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {requested === "sent" ? (
              <p className="m-0 flex items-center gap-2.5 text-sm font-semibold text-nevo-navy">
                <span className="flex size-[22px] flex-none items-center justify-center rounded-full bg-nevo-navy text-nevo-cream motion-safe:animate-nevo-pop">
                  <CheckIcon size={12} />
                </span>
                Asked. We&rsquo;ll be in touch, usually the same day.
              </p>
            ) : (
              <>
                <button
                  type="button"
                  disabled={requested === "sending"}
                  onClick={requestAccount}
                  className="h-[46px] cursor-pointer rounded-[10px] bg-nevo-navy px-5 text-sm font-semibold text-nevo-cream transition-[filter] hover:brightness-110 active:brightness-93 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:brightness-100"
                >
                  {requested === "sending"
                    ? "Sending…"
                    : "Request another account"}
                </button>
                <span className="text-[13px] text-nevo-near-black/55">
                  {requested === "failed"
                    ? `That didn’t send. Nothing has changed — try again, or email ${supportEmail}.`
                    : "Added at no charge, usually the same day. Admin accounts are always free."}
                </span>
              </>
            )}
          </div>
        </div>
      )}

      <div className={cn(CARD, "mt-3 overflow-hidden")}>
        {team.map((m, i) => (
          <MemberRow
            key={m.userId}
            m={m}
            last={i === team.length - 1}
            you={m.userId === me}
            // Not your own row: taking your own Oversight away would lose the
            // page you are standing on, and the founder's lock needs a
            // founding flag the team response does not carry.
            onEdit={m.userId === me ? undefined : () => onEdit(m)}
          />
        ))}
      </div>
    </>
  );
}

function JustYou({
  member,
  school,
  onInvite,
}: {
  member: TeamMember | undefined;
  school: string | null;
  onInvite: () => void;
}) {
  const [me] = useState(() => getSession()?.userId ?? null);
  return (
    <>
      <h2 className="text-[23px] font-semibold tracking-[-0.015em] text-nevo-near-black xl:text-[26px]">
        Admin Team
      </h2>
      <p className="mt-1.5 max-w-[60ch] text-[15.5px] leading-[1.55] text-nevo-near-black/60">
        It&rsquo;s just you for now &ndash; you have full oversight of{" "}
        {school ?? "this school"}.
      </p>

      {member && (
        <div className={cn(CARD, "mt-5 overflow-hidden")}>
          <MemberRow m={member} last you={member.userId === me} />
        </div>
      )}

      <div className={cn(CARD, "mt-4 px-[26px] py-7")}>
        <h3 className="text-[17px] font-semibold text-nevo-near-black">
          Share the load when you&rsquo;re ready
        </h3>
        <p className="mt-2 max-w-[60ch] text-sm leading-[1.6] text-nevo-near-black/66">
          Invite an IT lead, a SENCo or a finance colleague and give each
          exactly the access they need &ndash; one scope at a time. Nothing
          changes for you.
        </p>
        <div className="mt-5">
          <InviteButton onClick={onInvite} />
        </div>
      </div>
    </>
  );
}

function InvitePanel({
  atLimit,
  seatLimit,
  onCancel,
  onSent,
}: {
  /** The server says no seat is left: say so before anything is typed. */
  atLimit: boolean;
  seatLimit: number | null;
  onCancel: () => void;
  onSent: () => void;
}) {
  const [email, setEmail] = useState("");
  const [on, setOn] = useState<Set<PermissionScope>>(
    () => new Set(SCOPE_CATALOGUE.filter((s) => s.defaultOn).map((s) => s.scope)),
  );
  const [phase, setPhase] = useState<SendPhase>("idle");
  const [invited, setInvited] = useState<InvitedTeamMember | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const count = on.size;
  const valid = /.+@.+\..+/.test(email.trim()) && count > 0 && !atLimit;

  /*
   * ONE WAY OUT, THREE DOORS: the close button, the backdrop and Escape, as
   * every other sheet in the console has them. There was no close button at
   * all, and the backdrop closed the panel even mid-send.
   *
   * Never while the invitation is being created - the write is in flight and
   * its answer carries the only copy of the activation link. And once it
   * exists, leaving is "Done": the list refreshes to show the new admin.
   */
  const close = () => {
    if (phase === "sending") return;
    if (phase === "sent") onSent();
    else onCancel();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || phase === "sending") return;
      if (phase === "sent") onSent();
      else onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [phase, onSent, onCancel]);

  const send = () => {
    if (!valid || phase !== "idle") return;
    setError("");
    setPhase("sending");
    const scopes = [...on];
    teamApi
      .invite({ email: email.trim(), role: roleForScopes(scopes), scopes })
      .then((created) => {
        /*
         * KEEP THE RESPONSE. This was `.then(() => ...)`, discarding a 201
         * whose `invitationToken` is the ONLY way to build an activation
         * link - and then navigating away 1.4 seconds later, so the one copy
         * of it was gone before anybody could act on it. The same shape as the
         * bulk import's dropped join tokens, in its sibling surface.
         */
        setInvited(created);
        setPhase("sent");
      })
      .catch((err: unknown) => {
        setPhase("idle");
        // The server's refusal past the allowance is not a fault to retry.
        if (err instanceof ApiError && apiErrorCode(err.detail) === SEAT_LIMIT_REACHED) {
          setError(limitLine(seatLimit));
          return;
        }
        /*
         * THE SYSTEM OWNS THE FAULT. "Check the address and try again" reads
         * as a correction to the admin, on a failure we have no reason to
         * attribute to them - the response that produced it says nothing about
         * the address. And it left the real question unanswered: whether the
         * four scopes they had just ticked are still there. They are.
         */
        setError(
          "That didn't send, and we're on it. What you typed and the access you chose are still here - try again in a moment.",
        );
      });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-nevo-near-black/28 backdrop-blur-[0.4px] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-busy={phase === "sending"}
        aria-label="Invite a new admin"
        onClick={(e) => e.stopPropagation()}
        className="h-full w-full max-w-[560px] overflow-y-auto bg-nevo-cream px-[38px] py-[34px] shadow-[0_0_48px_rgba(0,0,0,0.22)] motion-safe:animate-in motion-safe:slide-in-from-right motion-safe:duration-200"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-[23px] font-semibold tracking-[-0.015em] text-nevo-near-black xl:text-[26px]">
            Invite a new admin
          </h2>
          <button
            type="button"
            onClick={close}
            disabled={phase === "sending"}
            aria-label="Close"
            className="flex size-[34px] flex-none cursor-pointer items-center justify-center rounded-lg text-nevo-near-black transition-colors hover:bg-nevo-near-black/[0.06] disabled:cursor-default disabled:opacity-40"
          >
            <CloseIcon />
          </button>
        </div>
        <p className="mt-1.5 text-[15.5px] leading-[1.55] text-nevo-near-black/60">
          {/*
            * WAS: "They'll get an email to set a password and join."
            *
            * Nothing supported that. The 201 carries `invitationId`,
            * `userId`, `email`, `role`, `scopes`, `invitationToken` and
            * `expiresAt` - and NO delivery state of any kind, unlike the
            * student invites, which have `deliveryStatus` precisely so a
            * screen can tell. So the console can no more promise an email than
            * deny one, and it does neither: it hands over the link.
            */}
          They&rsquo;ll set a password and join from a link you give them.
        </p>

        <label
          htmlFor="invite-email"
          className="mt-7 block text-[13px] font-semibold text-nevo-near-black/70"
        >
          Email address
        </label>
        <input
          id="invite-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="g.eze@brightgate.edu.ng"
          disabled={phase !== "idle"}
          className="mt-2 h-[52px] w-full rounded-[10px] border-[1.5px] border-nevo-near-black/16 bg-nevo-cream-elevated px-4 text-[16px] text-nevo-near-black outline-none transition-colors placeholder:text-nevo-near-black/35 focus:border-nevo-navy disabled:opacity-60"
        />

        <span className="mt-7 block text-[13px] font-semibold text-nevo-near-black/70">
          What can they access?
        </span>
        <ScopeChecklist on={on} setOn={setOn} disabled={phase !== "idle"} />

        {atLimit && !error ? (
          <p className="mt-4 rounded-[10px] bg-nevo-violet/16 px-4 py-3 text-[13.5px] leading-[1.5] text-nevo-near-black/78">
            {limitLine(seatLimit)}
          </p>
        ) : null}

        {error && (
          <p className="mt-4 rounded-[10px] bg-nevo-violet/16 px-4 py-3 text-[13.5px] leading-[1.5] text-nevo-near-black/78">
            {error}
          </p>
        )}

        <div className="mt-6 flex items-center gap-3.5">
          <button
            type="button"
            onClick={send}
            className={cn(
              "flex h-[50px] items-center justify-center rounded-[10px] bg-nevo-navy px-6 text-[15px] font-semibold text-nevo-cream transition-[filter]",
              valid && phase === "idle"
                ? "cursor-pointer hover:brightness-110 active:brightness-93"
                : "cursor-default opacity-50",
            )}
          >
            {phase === "sending"
              ? "Sending…"
              : phase === "sent"
                ? "Invitation created"
                : "Send invitation"}
          </button>
          {phase === "idle" && (
            <button
              type="button"
              onClick={onCancel}
              className="h-[50px] cursor-pointer rounded-[10px] px-4 text-sm font-medium text-nevo-navy transition-colors hover:bg-nevo-navy/6"
            >
              Cancel
            </button>
          )}
        </div>

        {invited ? (
          /*
            * The handover. Held on screen until the admin says they are done -
            * this used to navigate away on a 1.4s timer, taking the only copy
            * of the token with it.
            *
            * No red, and no claim in either direction about email.
            */
          <div className="mt-6 rounded-[10px] bg-nevo-violet/[0.18] px-5 py-4 text-nevo-navy">
            <p className="m-0 text-[14.5px] leading-[1.55]">
              <strong>{invited.email}</strong> is invited. Send them this link
              &ndash; it&rsquo;s how they set a password and join.
            </p>
            <div className="mt-3 flex items-center gap-3">
              <span className="min-w-0 flex-1 truncate rounded-[8px] bg-nevo-cream px-3 py-2 font-mono text-[12.5px] text-nevo-near-black">
                {adminActivationLink(invited)}
              </span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard
                    ?.writeText(adminActivationLink(invited))
                    .then(() => setCopied(true))
                    // A clipboard the browser refuses is not a copy.
                    .catch(() => setCopied(false));
                }}
                className="shrink-0 cursor-pointer text-[13px] font-semibold text-nevo-navy hover:underline"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="m-0 mt-2.5 text-[13px] leading-[1.5]">
              It expires {longDate(invited.expiresAt)}. There is no way to
              resend or cancel an admin invitation yet, so keep this link until
              they have used it.
            </p>
            <button
              type="button"
              onClick={onSent}
              className="mt-3.5 cursor-pointer text-[13.5px] font-semibold text-nevo-navy hover:underline"
            >
              Done
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
