"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { classesApi, type AdminClass } from "@/lib/api/classes";
import { invitesApi, type Invitation, type InviteRole } from "@/lib/api/invites";
import { cn } from "@/lib/utils";
import {
  CARD,
  GHOST_BTN,
  PausedNote,
  PRIMARY_BTN,
  PlusIcon,
  ROW_DIVIDER,
} from "../Roster/primitives";
import { useSetupGate } from "@/hooks";
import { BulkImportModal } from "./BulkImportModal";
import { InviteStatusPill, normaliseStatus } from "./inviteStatus";
import {
  CONSENT_WITHDRAWN,
  PAGE_SIZE,
  matchesStatus,
  pageWindow,
  statTiles,
} from "./inviteFilters";
import { NewInviteModal } from "./NewInviteModal";
import { LinkHandout } from "./LinkHandout";
import { confirmedSent, consentNote, needsManualDelivery } from "./deliveryCopy";
import { inviteeName, joinLink } from "./joinLink";
import { NoAccess, failureKind } from "../NoAccess";

/**
 * D19 School Invitations (SCRUM-79) - the single home for inviting teachers
 * and students.
 *
 * D6 Teachers and D7 Students both link here rather than carrying their own
 * invite forms; SCRUM-40 is explicit that they must not rebuild one. Anything
 * to do with getting a person onto the platform belongs on this screen.
 *
 * The tone is set by the frame and worth keeping: calm status only. Soft
 * violet for pending, navy for joined, muted near-black for expired, and
 * failures follow gentle recovery rather than alarm. Nothing here is red,
 * because none of it is an emergency - an expired invite is Tuesday.
 *
 * TODO(api): the invitation row carries no `classId`, so D19's CLASS COLUMN
 * and its class filter are absent. The invite request accepts a class and the
 * response drops it, which also means a sent invite cannot be shown with the
 * class it was sent for.
 *
 * TODO(api): no created-at either, so the frame's "Invited 9 Jul" column has
 * no source. `expiresAt` is the only date on the row, and it is shown as an
 * expiry rather than back-computed into a send date from a TTL nobody
 * documented.
 */

type Phase = "loading" | "ready" | "failed" | "denied";
type Tab = InviteRole;

const TOAST_MS = 3000;

const STATUS_FILTERS = [
  { value: "", label: "Any status" },
  { value: "pending", label: "Pending" },
  { value: "joined", label: "Joined" },
  { value: "expired", label: "Expired" },
];

const SEARCH_BAR =
  "flex h-[42px] w-full max-w-[320px] flex-1 items-center gap-[9px] rounded-[10px] border-[1.5px] border-nevo-near-black/10 bg-nevo-cream-elevated px-[15px] text-[14.5px] text-nevo-near-black outline-none transition-colors placeholder:text-nevo-near-black/50 focus-within:border-nevo-navy";

const FILTER_PILL =
  "flex h-[42px] cursor-pointer items-center gap-[7px] rounded-[10px] border-[1.5px] border-nevo-near-black/16 px-[14px] text-[13.5px] font-medium text-nevo-near-black/72 transition-colors hover:bg-nevo-navy/[0.06]";

function SearchIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="flex-none text-nevo-near-black/50"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4-4" />
    </svg>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function InvitationsView() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [classes, setClasses] = useState<AdminClass[]>([]);
  const [tab, setTab] = useState<Tab>("teacher");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [composing, setComposing] = useState(false);
  /** D24 / D01b: inviting, resending and revoking pause while setup is unfinished. */
  const { writesPaused } = useSetupGate();
  const [importing, setImporting] = useState(false);
  const [toast, setToast] = useState("");
  /*
   * The invitation whose link the admin now has to deliver themselves.
   * Persistent and in-row, NOT a toast: a three-second message is no place
   * to hand someone a link they are responsible for sending.
   */
  const [handout, setHandout] = useState<Invitation | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  /** The instant every row's expiry is judged against - see `normaliseStatus`. */
  const [now, setNow] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const say = useCallback((message: string) => {
    setToast(message);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(""), TOAST_MS);
  }, []);

  const load = useCallback(() => {
    Promise.all([invitesApi.list(), classesApi.list()])
      .then(([rows, cls]) => {
        setInvites(rows);
        setClasses(cls);
        setNow(Date.now());
        setPhase("ready");
      })
      .catch((err: unknown) => setPhase(failureKind(err)));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const forTab = useMemo(
    () => invites.filter((i) => (i.role ?? "").toLowerCase() === tab),
    [invites, tab],
  );

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return forTab.filter((i) => {
      if (!matchesStatus(i, status, now)) return false;
      if (!needle) return true;
      return (
        (i.name ?? "").toLowerCase().includes(needle) ||
        (i.email ?? "").toLowerCase().includes(needle)
      );
    });
  }, [forTab, search, status, now]);

  const stats = useMemo(() => statTiles(forTab, now), [forTab, now]);

  /*
   * Paged. This screen's own bulk import takes five hundred rows in one go and
   * the table rendered every one of them, so a school that imported its roster
   * met a list it could only scroll.
   *
   * The window is CLAMPED rather than trusted: narrowing a filter while on
   * page four would otherwise leave an admin looking at an empty table with no
   * indication that the rows are elsewhere.
   */
  const pager = pageWindow(visible.length, page);
  const rows = visible.slice(pager.start, pager.start + PAGE_SIZE);

  const noun = tab === "teacher" ? "teachers" : "students";
  const filtering = Boolean(search.trim() || status);

  /** Any change to what is being looked at starts again at the top. */
  const filterBy = (next: string) => {
    setStatus(next);
    setPage(1);
  };

  /** Straight to the clipboard - the recovery this screen never offered. */
  const copyLink = (invite: Invitation) => {
    const link = joinLink(invite.token);
    if (!link) return;
    navigator.clipboard
      ?.writeText(link)
      .then(() => say(`${inviteeName(invite)}'s link is copied`))
      .catch(() => say("Your browser wouldn't let us copy that"));
  };

  const resend = (invite: Invitation) => {
    setBusy(invite.id);
    setHandout(null);
    invitesApi
      .resend(invite.id)
      .then((updated) => {
        setInvites((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
        /*
         * `deliveryStatus` was returned by this very call and never read, so
         * the toast said "Invite resent to <name>" over a backend answer of
         * `email_not_configured` - which the spec defines as nobody having
         * been emailed. Resending again does the same nothing.
         */
        /*
         * ASSERT DELIVERY ONLY WHEN TOLD. The check used to be
         * `needsManualDelivery(...)`, so a null or absent `deliveryStatus` -
         * nullable in the contract, and cast unchecked by the client - fell
         * through to "Invite resent to <name>" over a response that
         * established nothing.
         */
        if (!confirmedSent(updated.deliveryStatus)) {
          setHandout(updated);
          const hasLink = Boolean(joinLink(updated.token));
          say(
            needsManualDelivery(updated.deliveryStatus)
              ? hasLink
                ? "No email went out - their link is in the row below"
                : "No email went out, and no link came back"
              : hasLink
                ? "We couldn't confirm an email - their link is in the row below"
                : "We couldn't confirm an email went out",
          );
          return;
        }
        say(`Invite resent to ${updated.email ?? updated.name ?? "them"}`);
      })
      .catch(() => say("That didn't resend. We're on it - try again in a moment."))
      .finally(() => setBusy(null));
  };

  const revoke = (invite: Invitation) => {
    setBusy(invite.id);
    invitesApi
      .revoke(invite.id)
      .then(() => {
        setInvites((prev) => prev.filter((i) => i.id !== invite.id));
        setConfirmRevoke(null);
        say(`${invite.name ?? invite.email ?? "That invite"}'s link no longer works`);
      })
      .catch(() => say("That didn't revoke. We're on it - try again in a moment."))
      .finally(() => setBusy(null));
  };

  return (
    <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
      <div className="mx-auto max-w-[900px]">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h2 className="m-0 text-[28px] font-semibold tracking-[-0.018em] text-nevo-near-black">
              Invite your school
            </h2>
            <p className="mt-1.5 text-[14.5px] text-nevo-near-black/60">
              Add teachers and students to start using Nevo
            </p>
          </div>
          <div className="flex flex-none gap-3">
            <button
              type="button"
              onClick={() => setImporting(true)}
              disabled={writesPaused}
              className={GHOST_BTN}
            >
              Bulk import
            </button>
            <button
              type="button"
              onClick={() => setComposing(true)}
              disabled={writesPaused}
              className={PRIMARY_BTN}
            >
              <PlusIcon />
              New invite
            </button>
          </div>
        </div>

        <PausedNote className="mt-3" />

        {/* TABS */}
        <div
          role="tablist"
          aria-label="Invitations"
          className="mt-7 flex gap-1 border-b border-nevo-near-black/10"
        >
          {(["teacher", "student"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => {
                setTab(t);
                setPage(1);
                // The consent filter is offered on the student tab only, so
                // carrying it to Teachers would hide every row behind a
                // control that is no longer on screen to clear.
                if (status === CONSENT_WITHDRAWN) setStatus("");
              }}
              className={cn(
                "-mb-px cursor-pointer border-b-2 px-4 pb-3 pt-2 text-[14.5px] font-semibold transition-colors",
                tab === t
                  ? "border-nevo-navy text-nevo-navy"
                  : "border-transparent text-nevo-near-black/55 hover:text-nevo-near-black/80",
              )}
            >
              {t === "teacher" ? "Teachers" : "Students"}
            </button>
          ))}
        </div>

        {phase === "loading" ? <div className={cn(CARD, "mt-6 h-[320px] animate-pulse")} /> : null}

        {phase === "denied" ? (
          <NoAccess what="invitations" />
        ) : phase === "failed" ? (
          <div className={cn(CARD, "mt-6 px-[26px] py-7")}>
            <h3 className="text-[17px] font-semibold text-nevo-near-black">
              We couldn&rsquo;t load your invitations
            </h3>
            <p className="mt-2 max-w-[52ch] text-sm leading-[1.55] text-nevo-near-black/62">
              Nothing has changed, and no invite has been affected. Try again in
              a moment.
            </p>
            <button
              type="button"
              onClick={() => {
                setPhase("loading");
                load();
              }}
              className={cn(PRIMARY_BTN, "mt-5")}
            >
              Try again
            </button>
          </div>
        ) : null}

        {phase === "ready" && forTab.length === 0 && !filtering ? (
          <div className={cn(CARD, "mt-6 px-6 py-16 text-center")}>
            <h3 className="m-0 text-xl font-semibold text-nevo-near-black">
              No invites yet
            </h3>
            <p className="mt-2.5 text-[15px] leading-[1.6] text-nevo-near-black/64">
              Invite your {noun} to get started.
            </p>
            <button
              type="button"
              onClick={() => setComposing(true)}
              disabled={writesPaused}
              className={cn(PRIMARY_BTN, "mx-auto mt-6")}
            >
              Send first invite
            </button>
          </div>
        ) : null}

        {phase === "ready" && (forTab.length > 0 || filtering) ? (
          <>
            {/* D19 draws these as the screen's primary filter control, and
                they were three numbers nobody could press. The first of them
                counted the whole tab, which is not a subset anything can
                select - so the set is now the frame's own Pending / Joined /
                Expired, and pressing the active one clears back to all. */}
            <div className="mt-6 flex gap-3.5 max-lg:flex-col">
              {stats.map((s) => {
                const on = status === s.key;
                return (
                  <button
                    key={s.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => filterBy(on ? "" : s.key)}
                    className={cn(
                      "flex-1 cursor-pointer rounded-xl border-[1.5px] px-[22px] py-5 text-left transition-colors",
                      on
                        ? "border-nevo-violet bg-nevo-cream-elevated"
                        : "border-transparent bg-nevo-cream-inset hover:border-nevo-violet/40 hover:bg-nevo-cream-elevated",
                    )}
                  >
                    <span className="block text-[34px] leading-none font-semibold tracking-[-0.02em] text-nevo-navy">
                      {s.n}
                    </span>
                    <span
                      className={cn(
                        "mt-2.5 block text-sm font-semibold",
                        on ? "text-nevo-navy" : "text-nevo-near-black",
                      )}
                    >
                      {s.label}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <label className={SEARCH_BAR}>
                <SearchIcon />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={`Search ${noun}`}
                  aria-label={`Search ${noun}`}
                  className="min-w-0 flex-1 border-none bg-transparent outline-none"
                />
              </label>
              <label className={FILTER_PILL}>
                <span className="sr-only">Filter by status</span>
                <select
                  value={status}
                  onChange={(e) => filterBy(e.target.value)}
                  className="cursor-pointer appearance-none bg-transparent outline-none"
                >
                  {STATUS_FILTERS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                  {/* Students only: a teacher invite has no parent behind it.
                      Every student row already carries `consentStatus`, and
                      until now there was no way to ask the screen which
                      families had withdrawn - the one question this roster is
                      most likely to be opened for. */}
                  {tab === "student" ? (
                    <option value={CONSENT_WITHDRAWN}>Consent withdrawn</option>
                  ) : null}
                </select>
              </label>
            </div>

            <div className={cn(CARD, "mt-4")}>
              <div className="grid grid-cols-[1.4fr_1.4fr_110px_150px] gap-4 border-b border-nevo-near-black/8 bg-nevo-near-black/[0.03] px-6 py-[13px] text-[11.5px] font-semibold uppercase tracking-[0.05em] text-nevo-near-black/50 max-lg:grid-cols-[1.4fr_110px_120px]">
                <span>Name</span>
                <span className="max-lg:hidden">Email</span>
                <span>Status</span>
                <span>Actions</span>
              </div>

              {visible.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <p className="m-0 text-[15px] font-semibold text-nevo-near-black">
                    No invites match
                  </p>
                  <p className="mt-1.5 text-sm text-nevo-near-black/62">
                    Try a different name or filter.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      filterBy("");
                    }}
                    className="mt-3 cursor-pointer text-sm font-semibold text-nevo-navy hover:opacity-75"
                  >
                    Clear filters
                  </button>
                </div>
              ) : (
                rows.map((invite, i) => {
                  const s = normaliseStatus(invite.status, invite.expiresAt, now);
                  const confirming = confirmRevoke === invite.id;
                  const working = busy === invite.id;
                  const joined = s === "joined";
                  return (
                    <div
                      key={invite.id}
                      className={cn("px-6 py-[15px]", i < rows.length - 1 && ROW_DIVIDER)}
                    >
                      <div className="grid grid-cols-[1.4fr_1.4fr_110px_150px] items-center gap-4 max-lg:grid-cols-[1.4fr_110px_120px]">
                        <span className="min-w-0">
                          <span className="block truncate text-[15px] font-semibold text-nevo-near-black">
                            {invite.name ?? invite.email ?? "Invited person"}
                          </span>
                          <span className="block text-[12.5px] text-nevo-near-black/55">
                            Expires {formatDate(invite.expiresAt)}
                          </span>
                          {/* Students only - consent is a fact about a child,
                              and a teacher invite has no parent behind it. The
                              note is ABSENT when the invite carried no consent
                              record at all: older invitations predate the
                              field, and "we weren't told" must not render as
                              "nobody has been asked". */}
                          {tab === "student" && consentNote(invite.consentStatus) ? (
                            <span className="block text-[12.5px] text-nevo-near-black/55">
                              {consentNote(invite.consentStatus)}
                            </span>
                          ) : null}
                        </span>
                        <span className="min-w-0 truncate text-sm text-nevo-near-black/66 max-lg:hidden">
                          {invite.email ?? "—"}
                        </span>
                        <span className="flex">
                          <InviteStatusPill status={s} />
                        </span>
                        <span className="flex items-center gap-3">
                          {joined ? (
                            <span className="text-[13px] text-nevo-near-black/45">
                              Nothing to do
                            </span>
                          ) : (
                            <>
                              {/* Only when the read actually carried a
                                  token - `token` is nullable in the contract
                                  and only promised on create. */}
                              {joinLink(invite.token) ? (
                                <button
                                  type="button"
                                  onClick={() => copyLink(invite)}
                                  className="cursor-pointer text-[13.5px] font-semibold text-nevo-navy transition-opacity hover:opacity-75"
                                >
                                  Copy link
                                </button>
                              ) : null}
                              <button
                                type="button"
                                disabled={working || writesPaused}
                                onClick={() => resend(invite)}
                                className="cursor-pointer text-[13.5px] font-semibold text-nevo-navy transition-opacity hover:opacity-75 disabled:opacity-45"
                              >
                                Resend
                              </button>
                              <button
                                type="button"
                                disabled={working || writesPaused}
                                onClick={() => setConfirmRevoke(confirming ? null : invite.id)}
                                className="cursor-pointer text-[13.5px] font-semibold text-nevo-near-black/60 transition-opacity hover:opacity-75 disabled:opacity-45"
                              >
                                Revoke
                              </button>
                            </>
                          )}
                        </span>
                      </div>

                      {handout?.id === invite.id ? (
                        <LinkHandout
                          className="mt-3"
                          invites={[handout]}
                          lead={
                            needsManualDelivery(handout.deliveryStatus)
                              ? joinLink(handout.token)
                                ? `No email was sent to ${inviteeName(handout)} - this school has no mail set up in Nevo, so this link is the only way in.`
                                : `No email was sent to ${inviteeName(handout)}, and this resend carried no link.`
                              : `We couldn't confirm an email reached ${inviteeName(handout)}.`
                          }
                          /* NOT "resend from the invitations list" - this IS
                             the invitations list, and that is the button they
                             just pressed. */
                          noLinkHint="Revoke and invite them again to get a fresh link."
                        />
                      ) : null}

                      {/* Inline confirm, in the row, saying exactly what happens. */}
                      {confirming ? (
                        <div className="mt-3 rounded-[10px] bg-nevo-violet/[0.18] px-4 py-3">
                          <p className="m-0 text-[13.5px] font-semibold text-nevo-navy">
                            Revoke this invite?
                          </p>
                          <p className="m-0 mt-1 text-[13.5px] leading-[1.5] text-nevo-navy/85">
                            {invite.name ?? invite.email ?? "This person"}&rsquo;s
                            link will stop working immediately.
                          </p>
                          <div className="mt-3 flex gap-2.5">
                            <button
                              type="button"
                              disabled={working || writesPaused}
                              onClick={() => revoke(invite)}
                              className="cursor-pointer rounded-lg bg-nevo-navy px-4 py-2 text-[13.5px] font-semibold text-nevo-cream transition-[filter] hover:brightness-110 disabled:opacity-60"
                            >
                              Revoke
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmRevoke(null)}
                              className="cursor-pointer rounded-lg px-4 py-2 text-[13.5px] font-semibold text-nevo-near-black/70 transition-colors hover:bg-nevo-near-black/[0.06]"
                            >
                              Keep
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>

            {pager.label ? (
              <div className="mt-4 flex items-center justify-between gap-4">
                <span className="text-[13px] text-nevo-near-black/58">
                  {pager.label}
                </span>
                {pager.pageCount > 1 ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={pager.page === 1}
                      aria-label="Previous page"
                      className="flex size-8 cursor-pointer items-center justify-center rounded-md border border-nevo-cream-inset bg-nevo-cream-elevated text-nevo-navy transition-colors hover:bg-nevo-navy/[0.06] disabled:cursor-default disabled:opacity-40"
                    >
                      &lsaquo;
                    </button>
                    <span className="text-[13px] font-medium text-nevo-near-black/70">
                      {`Page ${pager.page} of ${pager.pageCount}`}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setPage((p) => Math.min(pager.pageCount, p + 1))
                      }
                      disabled={pager.page === pager.pageCount}
                      aria-label="Next page"
                      className="flex size-8 cursor-pointer items-center justify-center rounded-md border border-nevo-cream-inset bg-nevo-cream-elevated text-nevo-navy transition-colors hover:bg-nevo-navy/[0.06] disabled:cursor-default disabled:opacity-40"
                    >
                      &rsaquo;
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      {toast ? (
        <div
          role="status"
          className="fixed bottom-8 left-1/2 z-[60] -translate-x-1/2 rounded-[10px] bg-nevo-navy px-5 py-3 text-sm font-semibold text-nevo-cream shadow-[0_8px_28px_rgba(0,0,0,0.24)] motion-safe:animate-nevo-rise"
        >
          {toast}
        </div>
      ) : null}

      {composing ? (
        <NewInviteModal
          role={tab}
          classes={classes}
          onClose={() => setComposing(false)}
          onSent={() => load()}
        />
      ) : null}

      {importing ? (
        <BulkImportModal
          role={tab}
          classes={classes}
          onClose={() => setImporting(false)}
          onSent={() => load()}
        />
      ) : null}
    </div>
  );
}
