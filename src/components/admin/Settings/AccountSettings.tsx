"use client";

import { useCallback, useEffect, useState } from "react";
import { authApi, type AuthSession } from "@/lib/api/auth";
import { permissionsApi } from "@/lib/api/permissions";
import { usersApi, type CurrentUser } from "@/lib/api/users";
import type { PermissionScope } from "@/lib/constants/permissions";
import { cn } from "@/lib/utils";
import { Avatar, CARD } from "../Roster/primitives";
import { scopeName } from "../Team/adminScopes";
import {
  NotBuiltNote,
  S_FIELD,
  S_LABEL,
  SettingsSection,
} from "./SettingsView";

/**
 * D12c Your account.
 *
 * CALLED "TWO-STEP SIGN-IN", NEVER MFA - the frame is explicit, and the reason
 * is the same one that governs every screen in this console: a proprietor is
 * not an IT specialist. The section is not built (no endpoint exists), but the
 * name is used correctly in the note, because whoever builds it will read this
 * file first.
 *
 * NO IP ADDRESSES ANYWHERE. D12c requires it, and it costs nothing to honour
 * because `GET /api/v1/auth/sessions` does not return one. Do not add one if
 * the contract later grows it.
 *
 * WHAT IS ABSENT, AND WHY:
 *
 *   - EMAIL AND ROLE TITLE. `ProfilePatch` is `{firstName, lastName, subjects}`,
 *     so neither has a field. Email is an authentication identifier and needs a
 *     verification flow rather than a silent change; the screen says so.
 *
 *     THIS ENTRY USED TO READ "`GET /api/v1/users/me` is the only route on the
 *     users resource - there is no write anywhere", and it was wrong. `PATCH
 *     /api/v1/users/me` is live, `usersApi.updateMe` has been typed since
 *     1 Sep, and the teacher console consumes it. The NAME is editable here
 *     now; it was withheld on the strength of this sentence.
 *   - TWO-STEP SIGN-IN. No enrolment, no secret, no verify, no recovery codes.
 *     The whole flow - QR, six boxes, ten codes, "I've saved these somewhere
 *     safe" - is drawn in D12c and backed by nothing.
 *
 * Password change and session management ARE live, and they are the two that
 * matter most for account safety.
 */

type Load = "loading" | "ready" | "failed";
type PwPhase = "idle" | "saving" | "done" | "mismatch" | "failed";


function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AccountSettings() {
  const [load, setLoad] = useState<Load>("loading");
  const [me, setMe] = useState<CurrentUser | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [nameFailed, setNameFailed] = useState(false);
  const [scopes, setScopes] = useState<PermissionScope[]>([]);
  const [sessions, setSessions] = useState<AuthSession[]>([]);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  /** D12.7: "A single 'Show' text action per field" - one toggle revealed all three. */
  const [reveal, setReveal] = useState({ current: false, next: false, confirm: false });
  /** The mismatch line is D12.7's "On blur" - not only after pressing Change. */
  const [confirmBlurred, setConfirmBlurred] = useState(false);
  const [languageNote, setLanguageNote] = useState(false);
  const [pw, setPw] = useState<PwPhase>("idle");
  const [ended, setEnded] = useState(0);
  /** Which session's sign-out is being confirmed. "" for none. */
  const [asking, setAsking] = useState("");
  /*
   * Both session writes ended `.catch(() => undefined)`: a refused sign-out
   * closed its confirm and changed nothing, which reads exactly like success -
   * on the one control an admin reaches for when a device may be in the wrong
   * hands. The session in flight, the one that failed, and the phase of
   * "everywhere else" are held so each can say what happened.
   */
  const [ending, setEnding] = useState("");
  const [endFailed, setEndFailed] = useState("");
  const [othersPhase, setOthersPhase] = useState<"idle" | "working" | "done" | "failed">("idle");

  const loadSessions = useCallback(() => {
    authApi
      .sessions()
      .then(setSessions)
      .catch(() => setSessions([]));
  }, []);

  useEffect(() => {
    Promise.all([usersApi.me(), permissionsApi.me()])
      .then(([u, p]) => {
        setMe(u);
        setFirstName(u.firstName ?? "");
        setLastName(u.lastName ?? "");
        setScopes(p.scopes);
        setLoad("ready");
        loadSessions();
      })
      .catch(() => setLoad("failed"));
  }, [loadSessions]);

  if (load === "loading") {
    return <div className={cn(CARD, "mt-5 h-[380px] animate-pulse")} />;
  }

  if (load === "failed" || !me) {
    return (
      <SettingsSection title="We couldn't load your account">
        <p className="m-0 text-sm leading-[1.55] text-nevo-near-black/62">
          Nothing has changed - this is only about showing it to you. Try again
          in a moment.
        </p>
      </SettingsSection>
    );
  }

  const changePassword = () => {
    if (next !== confirm) {
      setPw("mismatch");
      return;
    }
    if (next.length < 10) return;
    setPw("saving");
    const others = sessions.filter((s) => !s.current && s.active).length;
    authApi
      .changePassword({
        currentPassword: current,
        newPassword: next,
        // The screen promises this, so it is sent rather than assumed.
        endOtherSessions: true,
      })
      .then(() => {
        setPw("done");
        setEnded(others);
        setCurrent("");
        setNext("");
        setConfirm("");
        loadSessions();
      })
      .catch(() => setPw("failed"));
  };

  const others = sessions.filter((s) => !s.current);

  const nameChanged =
    firstName.trim() !== (me?.firstName ?? "") ||
    lastName.trim() !== (me?.lastName ?? "");

  const saveName = () => {
    if (savingName || !nameChanged) return;
    setSavingName(true);
    setNameSaved(false);
    setNameFailed(false);
    usersApi
      .updateMe({ firstName: firstName.trim(), lastName: lastName.trim() })
      .then((updated) => {
        // Read the record BACK rather than trusting what we sent - the
        // response is the authority on what was stored.
        setMe(updated);
        setFirstName(updated.firstName ?? "");
        setLastName(updated.lastName ?? "");
        setNameSaved(true);
      })
      .catch(() => setNameFailed(true))
      .finally(() => setSavingName(false));
  };

  return (
    <>
      {/* ------------------------------------------------------------ PROFILE */}
      <SettingsSection id="settings-profile" title="Your profile">
        <div className="flex items-center gap-4">
          <Avatar name={me.displayName} email={me.email} size={56} />
          <div className="min-w-0">
            <div className="text-[17px] font-semibold text-nevo-near-black">
              {me.displayName}
            </div>
            {me.email ? (
              <div className="truncate text-sm text-nevo-near-black/62">{me.email}</div>
            ) : null}
          </div>
        </div>

        {/*
          * THE NAME IS WRITABLE, AND THIS SAID IT WAS NOT.
          *
          * The note here read "there's no way for the app to save them at the
          * moment", and the file's own header called `GET /users/me` "the only
          * route on the users resource". `PATCH /api/v1/users/me` is live,
          * takes `ProfilePatch {firstName, lastName, subjects}`, and
          * `usersApi.updateMe` has been typed and consumed by the teacher
          * console since 1 Sep.
          *
          * EMAIL genuinely is not writable, and that half stays: `ProfilePatch`
          * has no email field, because it is an authentication identifier and
          * needs a verification flow rather than a silent change.
          */}
        <div className="mt-5 flex flex-col gap-4">
          <div className="flex gap-4">
            <label className="flex-1">
              <span className={S_LABEL}>First name</span>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={savingName}
                className={S_FIELD}
              />
            </label>
            <label className="flex-1">
              <span className={S_LABEL}>Last name</span>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={savingName}
                className={S_FIELD}
              />
            </label>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={saveName}
              disabled={savingName || !nameChanged}
              className="h-[42px] cursor-pointer rounded-[10px] bg-nevo-navy px-5 text-[14px] font-semibold text-nevo-cream transition-[filter] hover:brightness-110 active:brightness-93 disabled:cursor-not-allowed disabled:opacity-55"
            >
              {savingName ? "Saving…" : "Save changes"}
            </button>
            {nameSaved ? (
              <span role="status" className="text-[13px] text-nevo-near-black/62">
                Saved just now
              </span>
            ) : null}
            {nameChanged && !savingName && !nameSaved ? (
              <span role="status" className="text-[13px] text-nevo-near-black/62">
                You&rsquo;ve changed something here that isn&rsquo;t saved yet.
              </span>
            ) : null}
            {nameFailed ? (
              <span role="status" className="text-[13px] text-nevo-navy">
                That didn&rsquo;t save, so nothing has changed.
              </span>
            ) : null}
          </div>
          <NotBuiltNote>
            Your email is changed by asking us. It&rsquo;s how you sign in, so
            it needs verifying rather than editing here.
          </NotBuiltNote>

          {/*
            * D12.6's Language. "Only one language available: render the select
            * as a read-only field naming English rather than a one-option
            * menu." Pressing it explains why there is nothing to choose.
            */}
          <div>
            <span className={S_LABEL}>Language</span>
            <button
              type="button"
              onClick={() => setLanguageNote((v) => !v)}
              aria-expanded={languageNote}
              className={cn(S_FIELD, "cursor-pointer text-left")}
            >
              English
            </button>
            <p className="m-0 mt-2 text-[12.5px] leading-[1.5] text-nevo-near-black/55">
              {languageNote
                ? "English is the only language available today. When we add more, they'll appear here, and it will change Nevo for you only."
                : "This changes Nevo for you only. Your teachers and students keep their own setting."}
            </p>
          </div>
        </div>
      </SettingsSection>

      {/* ------------------------------------------------------------ ACCESS */}
      <SettingsSection
        id="settings-access"
        title="Your access"
        note="Your access areas are set by your school's founding admin."
      >
        {scopes.length === 0 ? (
          <p className="m-0 text-sm text-nevo-near-black/62">No access yet.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {scopes.map((s) => (
              <li key={s} className="flex items-start gap-2.5 text-sm text-nevo-near-black/78">
                <span
                  aria-hidden="true"
                  className="mt-[7px] size-[6px] flex-none rounded-full bg-nevo-violet"
                />
                {/* D12c lists each area by its NAME ("Billing"), the same
                    words the invite sheet and sidebar use - SCRUM-39's
                    byte-identical rule. This had its own table, mixing
                    names and descriptions. */}
                {scopeName(s)}
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>

      {/* ---------------------------------------------------------- PASSWORD */}
      <SettingsSection id="settings-password" title="Password">
        <div className="flex flex-col gap-4">
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor="pw-current" className={S_LABEL}>
                Current password
              </label>
              <button
                type="button"
                onClick={() => setReveal((r) => ({ ...r, current: !r.current }))}
                aria-label={`${reveal.current ? "Hide" : "Show"} current password`}
                className="cursor-pointer text-[12.5px] font-semibold text-nevo-navy hover:opacity-75"
              >
                {reveal.current ? "Hide" : "Show"}
              </button>
            </div>
            <input
              id="pw-current"
              type={reveal.current ? "text" : "password"}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              className={S_FIELD}
            />
          </div>
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor="pw-new" className={S_LABEL}>
                New password
              </label>
              <button
                type="button"
                onClick={() => setReveal((r) => ({ ...r, next: !r.next }))}
                aria-label={`${reveal.next ? "Hide" : "Show"} new password`}
                className="cursor-pointer text-[12.5px] font-semibold text-nevo-navy hover:opacity-75"
              >
                {reveal.next ? "Hide" : "Show"}
              </button>
            </div>
            <input
              id="pw-new"
              type={reveal.next ? "text" : "password"}
              value={next}
              onChange={(e) => {
                setNext(e.target.value);
                if (pw === "mismatch") setPw("idle");
              }}
              autoComplete="new-password"
              className={S_FIELD}
            />
            {/* D12.7's requirement, before typing rather than as a failure
                after; then the frame's own running count. No meter, no colour. */}
            <p className="mt-2 text-[12.5px] text-nevo-near-black/50">
              {next.length === 0
                ? "At least 10 characters. A phrase you'll remember is stronger than a short jumble."
                : next.length >= 10
                  ? "That's long enough."
                  : `A few more characters: ${10 - next.length} to go.`}
            </p>
          </div>
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor="pw-confirm" className={S_LABEL}>
                Confirm new password
              </label>
              <button
                type="button"
                onClick={() => setReveal((r) => ({ ...r, confirm: !r.confirm }))}
                aria-label={`${reveal.confirm ? "Hide" : "Show"} confirm new password`}
                className="cursor-pointer text-[12.5px] font-semibold text-nevo-navy hover:opacity-75"
              >
                {reveal.confirm ? "Hide" : "Show"}
              </button>
            </div>
            <input
              id="pw-confirm"
              type={reveal.confirm ? "text" : "password"}
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value);
                if (pw === "mismatch") setPw("idle");
              }}
              onBlur={() => setConfirmBlurred(true)}
              autoComplete="new-password"
              className={S_FIELD}
            />
            {pw === "mismatch" || (confirmBlurred && confirm.length > 0 && confirm !== next) ? (
              <p className="mt-2 text-[12.5px] text-nevo-navy">
                These two don&rsquo;t match yet.
              </p>
            ) : null}
          </div>

        </div>

        <p className="m-0 mt-4 text-[13px] leading-[1.55] text-nevo-near-black/60">
          Changing this signs you out everywhere else. You&rsquo;ll stay signed
          in here.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={changePassword}
            // D12.7 Idle: disabled "until all three fields are complete and
            // the two new ones match".
            disabled={
              !current || next.length < 10 || confirm !== next || pw === "saving"
            }
            className="cursor-pointer rounded-[10px] bg-nevo-navy px-5 py-3 text-sm font-semibold text-nevo-cream transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:brightness-100"
          >
            {pw === "saving" ? "Changing it…" : "Change password"}
          </button>
          {pw === "done" ? (
            <span className="text-[13px] font-semibold text-nevo-navy motion-safe:animate-nevo-reveal">
              Password changed
              {ended > 0
                ? `. ${ended} other ${ended === 1 ? "session" : "sessions"} ended.`
                : "."}
            </span>
          ) : null}
          {pw === "failed" ? (
            <span className="text-[13px] text-nevo-navy">
              That didn&rsquo;t go through. Your password is unchanged - check
              the current one and try again.
            </span>
          ) : null}
        </div>
      </SettingsSection>

      {/* ----------------------------------------------------------- TWO-STEP */}
      <SettingsSection id="settings-two-step" title="Two-step sign-in">
        <NotBuiltNote>
          Two-step sign-in isn&rsquo;t available yet. When it is, you&rsquo;ll
          enter a six-digit code from your phone as well as your password.
          There&rsquo;s nothing to switch on for now.
        </NotBuiltNote>
      </SettingsSection>

      {/* ----------------------------------------------------------- SESSIONS */}
      <SettingsSection
        id="settings-sessions"
        title="Where you're signed in"
        note="Sign out anywhere that isn't you."
      >
        {sessions.length === 0 ? (
          <p className="m-0 text-sm text-nevo-near-black/62">
            We couldn&rsquo;t list your sessions just now.
          </p>
        ) : others.length === 0 ? (
          /*
           * THE SINGLE-SESSION STATE, which rendered as a one-row list with
           * nothing to do on it. An admin signed in on one device does not
           * need a list; they need the answer, which is that there is nowhere
           * else signed in as them. This is the reassuring reading of this
           * section and it looked like an unfinished table.
           */
          <p className="m-0 max-w-[58ch] text-sm leading-[1.6] text-nevo-near-black/70">
            This is the only device signed in as you
            {sessions[0] ? `, last active ${when(sessions[0].lastSeenAt)}` : ""}.
            If you sign in somewhere else, it will appear here.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {sessions.map((s) => (
              <div
                key={s.id}
                className="rounded-[10px] border border-nevo-near-black/12 px-4 py-3.5"
              >
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-nevo-near-black">
                      {s.current ? "This device" : "Another device"}
                    </div>
                    <div className="text-[12.5px] text-nevo-near-black/58">
                      Last active {when(s.lastSeenAt)}
                    </div>
                  </div>
                  {!s.current ? (
                    <button
                      type="button"
                      onClick={() => setAsking(asking === s.id ? "" : s.id)}
                      aria-expanded={asking === s.id}
                      className="flex-none cursor-pointer text-[13px] font-semibold text-nevo-navy hover:opacity-75"
                    >
                      End it
                    </button>
                  ) : null}
                </div>

                {/*
                  * INLINE CONFIRM, WITH THE CONSEQUENCE SAID OUT LOUD.
                  *
                  * Signing a device out fired on the first press and named
                  * nothing - and every row here reads "Another device",
                  * because the contract carries no device name at all. One
                  * misread row and an admin ends the session they are working
                  * in on another machine, mid-task, with no undo.
                  */}
                {asking === s.id ? (
                  <div className="mt-3 rounded-[10px] bg-nevo-violet/[0.18] px-4 py-3">
                    <p className="m-0 text-[13.5px] leading-[1.5] text-nevo-navy">
                      Whoever is using that device will be signed out and will
                      need to sign in again. Nothing of theirs is lost.
                    </p>
                    <div className="mt-3 flex gap-2.5">
                      <button
                        type="button"
                        disabled={ending === s.id}
                        onClick={() => {
                          setEnding(s.id);
                          setEndFailed("");
                          authApi
                            .endSession(s.id)
                            .then(() => {
                              setAsking("");
                              loadSessions();
                            })
                            // The confirm stays open and says so: closing it
                            // is what success looks like.
                            .catch(() => setEndFailed(s.id))
                            .finally(() => setEnding(""));
                        }}
                        className="cursor-pointer rounded-[8px] bg-nevo-navy px-3.5 py-2 text-[13px] font-semibold text-nevo-cream transition-[filter] hover:brightness-110 disabled:cursor-default disabled:opacity-60"
                      >
                        {ending === s.id ? "Signing out…" : "Sign it out"}
                      </button>
                      <button
                        type="button"
                        disabled={ending === s.id}
                        onClick={() => {
                          setAsking("");
                          setEndFailed("");
                        }}
                        className="cursor-pointer px-2 text-[13px] font-semibold text-nevo-navy hover:opacity-75 disabled:cursor-default disabled:opacity-50"
                      >
                        Keep it
                      </button>
                    </div>
                    {endFailed === s.id ? (
                      <p className="m-0 mt-2.5 text-[13px] leading-[1.5] text-nevo-navy">
                        That didn&rsquo;t sign it out, and nothing has changed.
                        Try again in a moment.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}

        {others.length > 0 ? (
          <button
            type="button"
            disabled={othersPhase === "working"}
            onClick={() => {
              setOthersPhase("working");
              authApi
                .endOtherSessions()
                .then(() => {
                  setOthersPhase("done");
                  loadSessions();
                })
                .catch(() => setOthersPhase("failed"));
            }}
            className="mt-4 cursor-pointer text-sm font-semibold text-nevo-navy hover:opacity-75 disabled:cursor-default disabled:opacity-50"
          >
            {othersPhase === "working" ? "Signing out…" : "Sign out everywhere else"}
          </button>
        ) : null}
        {/*
          * NO COUNT, deliberately. D12c says "N devices signed out", and the
          * endpoint returns no body: the only number to hand is the list this
          * screen read, and a session opened after that read was ended too. So
          * it states the fact, and the part an admin needs to hear - this
          * device is not one of them.
          */}
        {othersPhase === "done" ? (
          <p role="status" className="m-0 mt-3 text-[13px] leading-[1.5] text-nevo-navy">
            Every other session is signed out. You&rsquo;re still signed in
            here, and nothing else has changed.
          </p>
        ) : othersPhase === "failed" ? (
          <p role="status" className="m-0 mt-3 text-[13px] leading-[1.5] text-nevo-navy">
            That didn&rsquo;t sign anything out, and nothing has changed. Try
            again in a moment.
          </p>
        ) : null}

        {/* The contract has no device name, so every other row reads the same.
            Said out loud, because a list of identical rows otherwise looks
            like a bug. */}
        {others.length > 0 ? (
          <p className="m-0 mt-3 text-[12.5px] leading-[1.5] text-nevo-near-black/50">
            We can tell you when each session was last active, but not what
            device it is on - so if you don&rsquo;t recognise one, sign it out.
          </p>
        ) : null}
      </SettingsSection>
    </>
  );
}
