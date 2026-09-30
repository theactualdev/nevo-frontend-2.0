"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSetupGate } from "@/hooks";
import { classesApi } from "@/lib/api/classes";
import { invitesApi, type Invitation } from "@/lib/api/invites";
import { teachersApi, type TeacherSummary } from "@/lib/api/teachers";
import { cn } from "@/lib/utils";
import {
  Avatar,
  CARD,
  CheckIcon,
  GHOST_BTN,
  PausedNote,
  PRIMARY_BTN,
  PlusIcon,
  ROW_DIVIDER,
} from "../Roster/primitives";
import {
  confirmedSent,
  unconfirmedResendLead,
  unconfirmedResendToast,
} from "../Invitations/deliveryCopy";
import { joinLink } from "../Invitations/joinLink";
import { LinkHandout } from "../Invitations/LinkHandout";
import { openInviteFor } from "./openInvite";
import { StatusPill, isInvited } from "./status";
import { NoAccess, failureKind } from "../NoAccess";

/**
 * D6 Teachers - admin oversight of staff.
 *
 * EXPLICITLY NOT A PERFORMANCE SURFACE. An admin can see that a teacher is on
 * the platform and what they hold; never their students' scores, never the
 * contents of their notes, never a judgement of their teaching. SCRUM-40 calls
 * that boundary structural, and the frame puts it in writing on the detail page
 * rather than leaving it implied.
 *
 * Three columns only - Teacher, Classes, Status - and deliberately no
 * last-active column: recency lives on the detail page, so the list cannot be
 * read as a league table.
 *
 * Invites are not built here. "Invite a teacher" routes to D19 School
 * Invitations, which owns single and bulk invite, the pending pipeline, resend
 * and revoke. SCRUM-40 is explicit that this screen must not rebuild that form.
 *
 * RESEND IS THE ONE EXCEPTION, because D6 draws it: an Invited row carries
 * "Resend invite", and a toast confirms it. It calls D19's own resend on the
 * teacher's invitation (matched by email - see `openInvite`), and when the
 * backend does not confirm an email went out it says so and hands over the
 * link in the row, exactly as D19 does, rather than toasting "Invite resent"
 * over a response that established nothing.
 *
 * TODO(api): `GET /api/v1/teachers` carries no `class_count`, so the Classes
 * column resolves per row through `GET /api/v1/teachers/{id}/classes` - N+1,
 * fired after the list paints, exactly as D5 does. Folding a count into the
 * list response removes it.
 *
 * TODO(api): no `source` field either, so the SSO-sourced state (invite absent,
 * source line pointing at IT & SSO) cannot be detected and is not built.
 */

type Phase = "loading" | "ready" | "failed" | "denied";

/** D6's toast and the button's "Invite resent" both hold for three seconds. */
const TOAST_MS = 3000;

const SEARCH_BAR =
  "flex h-[42px] w-full max-w-[340px] flex-1 items-center gap-[9px] rounded-[10px] border-[1.5px] border-nevo-near-black/10 bg-nevo-cream-elevated px-[15px] text-[14.5px] text-nevo-near-black outline-none transition-colors placeholder:text-nevo-near-black/50 focus-within:border-nevo-navy";

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

export function TeachersView() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [teachers, setTeachers] = useState<TeacherSummary[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  /** Teachers whose class read failed - their cell is unknown, not pending. */
  const [countFailed, setCountFailed] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  /** Each invited teacher's resendable invitation, by teacher id. */
  const [invites, setInvites] = useState<Record<string, Invitation>>({});
  const [resending, setResending] = useState<Record<string, "sending" | "done">>({});
  /** A resend nobody was confirmed emailed about: its link, in that row. */
  const [handout, setHandout] = useState<{ teacherId: string; invite: Invitation } | null>(
    null,
  );
  const [toast, setToast] = useState<{ text: string; sent: boolean } | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  /** D24 / D01b: resending pauses while setup is unfinished, as it does on D19. */
  const { writesPaused } = useSetupGate();

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const later = (fn: () => void) => {
    timers.current.push(setTimeout(fn, TOAST_MS));
  };

  const say = (text: string, sent = false) => {
    setToast({ text, sent });
    later(() => setToast((cur) => (cur?.text === text ? null : cur)));
  };

  const settle = (teacherId: string) =>
    setResending((prev) => {
      const next = { ...prev };
      delete next[teacherId];
      return next;
    });

  const resend = (t: TeacherSummary) => {
    const invite = invites[t.id];
    if (!invite || resending[t.id]) return;
    setResending((prev) => ({ ...prev, [t.id]: "sending" }));
    setHandout(null);
    invitesApi
      .resend(invite.id)
      .then((updated) => {
        setInvites((prev) => ({ ...prev, [t.id]: updated }));
        if (!confirmedSent(updated.deliveryStatus)) {
          settle(t.id);
          setHandout({ teacherId: t.id, invite: updated });
          say(
            unconfirmedResendToast(updated.deliveryStatus, Boolean(joinLink(updated.token))),
          );
          return;
        }
        setResending((prev) => ({ ...prev, [t.id]: "done" }));
        say(`Invite resent to ${updated.email ?? t.email ?? t.name}`, true);
        later(() => settle(t.id));
      })
      .catch(() => {
        settle(t.id);
        say("That didn't resend. We're on it - try again in a moment.");
      });
  };

  // Search is server-side: a school past one page still finds people, which a
  // client-side filter over an already-fetched list would not manage.
  const load = useCallback((term: string) => {
    teachersApi
      .list(term.trim() || undefined)
      .then((rows) => {
        setTeachers(rows);
        setPhase("ready");
        setCountFailed(new Set());
        /*
         * Only when somebody is still invited. A failed read leaves no Resend
         * on any row - the header's "Invite a teacher" still reaches D19,
         * which has the same button.
         */
        const invited = rows.filter((t) => isInvited(t.status));
        if (invited.length > 0) {
          invitesApi
            .list()
            .then((all) => {
              const now = Date.now();
              const found: Record<string, Invitation> = {};
              invited.forEach((t) => {
                const inv = openInviteFor(t, all, now);
                if (inv) found[t.id] = inv;
              });
              setInvites(found);
            })
            .catch(() => setInvites({}));
        }
        rows.forEach((t) => {
          classesApi
            .teacherClasses(t.id)
            .then((list) => setCounts((prev) => ({ ...prev, [t.id]: list.length })))
            // Was `.catch(() => undefined)`, which left that row's Classes
            // cell as a loading bar for as long as the page was open.
            .catch(() =>
              setCountFailed((prev) => new Set(prev).add(t.id)),
            );
        });
      })
      .catch((err: unknown) => setPhase(failureKind(err)));
  }, []);

  useEffect(() => {
    const id = setTimeout(() => load(search), search ? 300 : 0);
    return () => clearTimeout(id);
  }, [load, search]);

  const pending = teachers.filter((t) => isInvited(t.status)).length;
  const canResend = (t: TeacherSummary) => isInvited(t.status) && Boolean(invites[t.id]);
  const anyResend = teachers.some(canResend);
  /*
   * D6 sets the Status column at 120px and lets Resend and the pill share it;
   * the pair is wider than that, so the column widens for every row - header
   * included - whenever any row carries the button, and the columns stay in
   * line. Two literal strings, so Tailwind sees both.
   */
  const cols = anyResend ? "grid-cols-[1.6fr_120px_220px]" : "grid-cols-[1.6fr_120px_120px]";
  const countLine = [
    `${teachers.length} ${teachers.length === 1 ? "teacher" : "teachers"}`,
    pending > 0
      ? `${pending} ${pending === 1 ? "invitation" : "invitations"} pending`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
      <div className="mx-auto max-w-[900px]">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h2 className="m-0 text-[28px] font-semibold tracking-[-0.018em] text-nevo-near-black">
              Teachers
            </h2>
            {phase === "ready" ? (
              <p className="mt-1.5 text-[14.5px] text-nevo-near-black/60">{countLine}</p>
            ) : null}
          </div>
          {phase === "ready" && teachers.length > 0 ? (
            <Link href="/admin/invitations" className={PRIMARY_BTN}>
              <PlusIcon />
              Invite a teacher
            </Link>
          ) : null}
        </div>

        {phase === "loading" ? <div className={cn(CARD, "mt-[22px] h-[320px] animate-pulse")} /> : null}

        {phase === "denied" ? (
          <NoAccess what="your teachers" />
        ) : phase === "failed" ? (
          <div className={cn(CARD, "mt-[22px] px-[26px] py-7")}>
            <h3 className="text-[17px] font-semibold text-nevo-near-black">
              We couldn&rsquo;t load your teachers
            </h3>
            <p className="mt-2 max-w-[52ch] text-sm leading-[1.55] text-nevo-near-black/62">
              Nothing has changed - this is only about showing you the list. Try
              again in a moment.
            </p>
            <button
              type="button"
              onClick={() => {
                setPhase("loading");
                load(search);
              }}
              className={cn(PRIMARY_BTN, "mt-5")}
            >
              Try again
            </button>
          </div>
        ) : null}

        {phase === "ready" && teachers.length === 0 && !search.trim() ? <EmptyState /> : null}

        {phase === "ready" && (teachers.length > 0 || search.trim()) ? (
          <>
            <div className="mt-[18px] flex flex-wrap items-center gap-3">
              <label className={SEARCH_BAR}>
                <SearchIcon />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search teachers"
                  aria-label="Search teachers"
                  className="min-w-0 flex-1 border-none bg-transparent outline-none"
                />
              </label>
            </div>

            <div className={cn(CARD, "mt-[18px]")}>
              <div
                className={cn(
                  "grid gap-4 border-b border-nevo-near-black/8 bg-nevo-near-black/[0.03] px-6 py-[13px] text-[11.5px] font-semibold uppercase tracking-[0.05em] text-nevo-near-black/50 max-xl:hidden",
                  cols,
                )}
              >
                <span>Teacher</span>
                <span>Classes</span>
                <span className="text-right">Status</span>
              </div>

              {teachers.length === 0 ? (
                <div className="px-6 py-10 text-center">
                  <p className="m-0 text-sm text-nevo-near-black/62">
                    No teachers match that.
                  </p>
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="mt-3 cursor-pointer text-sm font-semibold text-nevo-navy hover:opacity-75"
                  >
                    Clear search
                  </button>
                </div>
              ) : (
                teachers.map((t, i) => {
                  const held = counts[t.id];
                  return (
                    <div key={t.id} className={cn(i < teachers.length - 1 && ROW_DIVIDER)}>
                      {/*
                        * A ROW YOU CAN STILL OPEN, WITH A BUTTON IN IT. The row
                        * was one <button>, and a Resend cannot sit inside a
                        * button. The name is now the link, stretched over the
                        * row by its ::after, so the whole row still opens the
                        * teacher and Resend sits above it as its own control.
                        */}
                      <div
                        className={cn(
                          "relative grid w-full items-center gap-4 px-6 py-[15px] text-left transition-colors hover:bg-nevo-navy/[0.03] max-xl:flex max-xl:items-center max-xl:justify-between max-xl:gap-3 max-xl:px-[18px] max-xl:py-[13px]",
                          cols,
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <Avatar name={t.name} email={t.email} size={34} />
                          <span className="min-w-0">
                            <Link
                              href={`/admin/teachers/${t.id}`}
                              className="block truncate text-[15px] font-semibold text-nevo-near-black after:absolute after:inset-0"
                            >
                              {t.name}
                            </Link>
                            {t.email ? (
                              <span className="block truncate text-[13px] text-nevo-near-black/60 max-xl:hidden">
                                {t.email}
                              </span>
                            ) : null}
                            {/*
                              * THE CLASS LOAD, AT TABLET, WHERE ITS COLUMN IS
                              * GONE. The Classes cell is hidden below the
                              * desktop boundary and nothing took its place, so
                              * the one thing this screen exists to show -
                              * how much a teacher is teaching - simply vanished
                              * at 1024. It rides under the name instead, exactly
                              * as the year group does on the classes list, and
                              * the email steps aside for it rather than both
                              * competing for one line.
                              */}
                            <span className="mt-0.5 hidden truncate text-[12.5px] text-nevo-near-black/55 max-xl:block">
                              {held === undefined
                                ? t.email ?? ""
                                : held === 0
                                  ? "No classes yet"
                                  : `${held} ${held === 1 ? "class" : "classes"}`}
                            </span>
                          </span>
                        </span>
                        <span className="text-sm text-nevo-near-black/66 max-xl:hidden">
                          {held === undefined && countFailed.has(t.id) ? (
                            // The read failed: unknown, not loading forever.
                            <span
                              className="text-nevo-near-black/40"
                              title="We couldn't read this teacher's classes just now"
                            >
                              &mdash;
                            </span>
                          ) : held === undefined ? (
                            <span
                              aria-hidden="true"
                              className="block h-3.5 w-14 rounded bg-nevo-near-black/[0.07]"
                            />
                          ) : held === 0 ? (
                            "—"
                          ) : (
                            `${held} ${held === 1 ? "class" : "classes"}`
                          )}
                        </span>
                        <span className="flex items-center justify-end gap-3 max-xl:flex-none max-xl:gap-2.5">
                          {canResend(t) ? (
                            <ResendButton
                              name={t.name}
                              state={resending[t.id]}
                              paused={writesPaused}
                              onResend={() => resend(t)}
                            />
                          ) : null}
                          <StatusPill status={t.status} />
                        </span>
                      </div>
                      {handout?.teacherId === t.id ? (
                        <LinkHandout
                          className="mx-6 mb-4 max-xl:mx-[18px]"
                          invites={[handout.invite]}
                          lead={unconfirmedResendLead(
                            handout.invite.deliveryStatus,
                            Boolean(joinLink(handout.invite.token)),
                            t.name,
                          )}
                          noLinkHint="Revoke and invite them again from Invitations to get a fresh link."
                        />
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
            {anyResend ? <PausedNote className="mt-3" /> : null}
          </>
        ) : null}
      </div>

      {toast ? (
        /* D6's toast: navy, bottom centre, a check when it confirms a send. */
        <div
          role="status"
          className="fixed bottom-8 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-3 rounded-xl bg-nevo-navy px-5 py-3.5 text-[14.5px] font-medium text-nevo-cream shadow-[0_8px_32px_rgba(0,0,0,0.32)] motion-safe:animate-nevo-pop"
        >
          {toast.sent ? (
            <span className="flex size-[26px] flex-none items-center justify-center rounded-full bg-nevo-cream/16">
              <CheckIcon size={16} />
            </span>
          ) : null}
          {toast.text}
        </div>
      ) : null}
    </div>
  );
}

/**
 * D6's row button. Long labels at desktop, short at tablet, as the frame has
 * them: "Resend invite" / "Resend", "Sending…", "Invite resent" / "Resent".
 */
function ResendButton({
  name,
  state,
  paused,
  onResend,
}: {
  name: string;
  state: "sending" | "done" | undefined;
  paused: boolean;
  onResend: () => void;
}) {
  const [long, short] =
    state === "sending"
      ? ["Sending…", "Sending…"]
      : state === "done"
        ? ["Invite resent", "Resent"]
        : ["Resend invite", "Resend"];
  return (
    <button
      type="button"
      onClick={onResend}
      disabled={paused || Boolean(state)}
      aria-label={
        state === "sending"
          ? `Sending ${name}'s invite`
          : state === "done"
            ? `${name}'s invite resent`
            : `Resend ${name}'s invite`
      }
      className={cn(
        "relative z-10 inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg border-[1.5px] border-nevo-navy/28 bg-nevo-cream px-3 py-1.5 text-[13px] font-semibold text-nevo-navy transition-colors hover:border-nevo-navy/50 hover:bg-nevo-navy/10 active:border-nevo-navy active:bg-nevo-navy/18 disabled:cursor-default max-xl:gap-[5px] max-xl:px-2.5 max-xl:py-[5px] max-xl:text-[12px]",
        paused && "opacity-45",
      )}
    >
      {state === "sending" ? (
        <span
          aria-hidden="true"
          className="inline-block size-[13px] flex-none animate-spin rounded-full border-2 border-nevo-navy/25 border-t-nevo-navy"
        />
      ) : state === "done" ? (
        <CheckIcon size={13} />
      ) : (
        <RefreshIcon />
      )}
      <span className="max-xl:hidden">{long}</span>
      <span className="hidden max-xl:inline">{short}</span>
    </button>
  );
}

function RefreshIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="flex-none"
    >
      <path d="M4 12a8 8 0 0 1 8-8 8 8 0 0 1 6.7 3.7" />
      <path d="M20 4v4h-4" />
      <path d="M20 12a8 8 0 0 1-8 8 8 8 0 0 1-6.7-3.7" />
      <path d="M4 20v-4h4" />
    </svg>
  );
}

function EmptyState() {
  return (
    /*
     * A DEFINITE HEIGHT, because `flex-1` here is inert: the two wrappers
     * above this are plain blocks with no height and no flex, so there was
     * nothing for a flex child to grow into and `justify-center` centred the
     * panel inside its own content box. It rendered directly under the
     * heading. `min-h` gives the box the height the centring needs without
     * making the whole page a flex column.
     */
    <div className="flex min-h-[52vh] flex-1 flex-col items-center justify-center py-16 text-center">
      <div className="max-w-[440px]">
        <Image
          src="/illustrations/empty-admin-teachers.png"
          alt=""
          width={320}
          height={200}
          className="mx-auto mb-3 h-[200px] w-auto object-contain"
          priority
        />
        <h3 className="m-0 text-xl font-semibold text-nevo-near-black">No teachers yet</h3>
        <p className="mt-2.5 text-[15px] leading-[1.6] text-nevo-near-black/64">
          Invite your teachers one at a time, or upload your staff file and
          Nevo adds them all. Each one gets their own console, and nothing is
          sent until you invite them.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/admin/invitations" className={PRIMARY_BTN}>
            <PlusIcon />
            Invite a teacher
          </Link>
          {/*
            * WAS "Import from SSO" -> the IT surface, which came off the
            * sidebar on 24 Sep. Provider sign-in is deferred and every school
            * is manual, so the route that brings staff in is the roster
            * upload, which takes a teacher file alongside the student one.
            */}
          <Link href="/admin/roster" className={GHOST_BTN}>
            Import a roster
          </Link>
        </div>
      </div>
    </div>
  );
}
