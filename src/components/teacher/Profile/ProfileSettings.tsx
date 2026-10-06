"use client";

import { useState } from "react";
import { useSystemMessages } from "@/components/shared/SystemMessages";
import { Toggle } from "@/components/teacher/shared/Toggle";
import { useAccessibility } from "@/context/AccessibilityContext";
import {
  ACCESSIBILITY_SETTINGS,
  NOTIFICATION_SETTINGS,
  TEACHER_PROFILE,
  type TeacherProfile,
} from "@/lib/mocks/teacherProfile";
import { cn } from "@/lib/utils";
import { publishIdentity, uploadPhoto } from "@/hooks/useCurrentUser";
import { usersApi } from "@/lib/api/users";
import { useHasSession } from "@/hooks/useHasSession";
import { useCurrentUserStatus } from "@/hooks/useCurrentUser";
import { useTeacherSettings } from "@/hooks/useTeacherSettings";
import { AvatarDisc } from "@/components/shared/AvatarDisc";
import { EditProfileModal } from "./EditProfileModal";
import { SignOutModal } from "./SignOutModal";

/**
 * C11 Profile & account - the teacher's own details, notification choices and
 * accessibility preferences.
 *
 * The save model comes from C14 B6, which C11 itself never draws: a "Save
 * changes" button sits in the header, stays disabled until something is
 * actually dirty, and on save the shared bar confirms while the page stays
 * exactly where it was. Flagged - C11's header is a bare heading. (C14 drew a
 * NevoToast; frame 43 made it the one shared bar, so this screen's own toast
 * went - including a failed save that cleared itself after three seconds,
 * where SM-03 says a failure stays until dismissed.)
 *
 * The Accessibility rows drive the app-wide AccessibilityContext, so they do
 * what their own sub-copy promises - "across Nevo", "across the console" -
 * and persist. They apply on tap and stay out of the dirty/Save cycle:
 * preferences that live on this device take effect now, while the
 * Notifications rows (server-persisted) keep the C14 B6 save model.
 *
 * Two flagged divergences from C11: the frame draws "Reduce motion" ON by
 * default, but the toggle now reflects the real stored preference, which
 * starts OFF and is shared with the student app; and "Larger text" uses the
 * shared text-size scale (1.1) rather than the frame's one-off zoom 1.15.
 */

const SECTION_H3 =
  "mt-7 text-[13.5px] font-semibold tracking-[0.04em] text-nevo-near-black/55 uppercase xl:mt-8 xl:text-sm";

const CARD =
  "mt-3.5 overflow-hidden rounded-xl bg-nevo-cream-elevated shadow-[0_2px_8px_rgba(0,0,0,0.06)]";


export function ProfileSettings() {
  const a11y = useAccessibility();
  const [profile, setProfile] = useState<TeacherProfile>(TEACHER_PROFILE);
  const notifications = useTeacherSettings();
  const [dirty, setDirty] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  // This is the page where a teacher would most reasonably read these as their
  // own account details - a fabricated email worst of all, since it looks like
  // where their notifications go. So a live session shows only what the
  // profile call returned, and the fixture is reserved for the signed-out
  // preview of the frame.
  const signedIn = useHasSession();
  // Name, email, school and subjects - all of it real, all from one call.
  const { identity, status: identityStatus } = useCurrentUserStatus();
  const [signOutOpen, setSignOutOpen] = useState(false);
  const say = useSystemMessages();

  const flip = (id: string) => {
    notifications.set(
      id as keyof typeof notifications.values,
      !notifications.values[id as keyof typeof notifications.values],
    );
    setDirty(true);
  };

  // Accessibility rows read and write the global preference directly.
  const valueOf = (id: string): boolean =>
    id === "reduceMotion"
      ? a11y.reducedMotion
      : id === "largerText"
        ? a11y.textSize !== "m"
        : notifications.values[id as keyof typeof notifications.values];

  const toggle = (id: string) => {
    if (id === "reduceMotion") {
      a11y.setReducedMotion(!a11y.reducedMotion);
      return;
    }
    if (id === "largerText") {
      a11y.setTextSize(a11y.textSize === "m" ? "l" : "m");
      return;
    }
    flip(id);
  };

  /**
   * The message follows the save's real outcome, not the click. A failed write
   * that says "Settings saved" is the one thing this button must never do,
   * and the row stays dirty so the teacher can try again.
   */
  const save = () => {
    if (!dirty || notifications.saveState === "saving") return;
    void notifications.save().then((ok) => {
      if (ok) setDirty(false);
      say.show(
        ok
          ? { kind: "confirm", message: "Settings saved" }
          : { kind: "failed", message: "We couldn’t save that. Try again" },
      );
    });
  };

  const rows = (list: typeof NOTIFICATION_SETTINGS) =>
    list.map((r, i) => (
      <div
        key={r.id}
        className={cn(
          "flex items-center justify-between gap-3.5 px-[18px] py-3.5 xl:gap-4 xl:px-5 xl:py-4",
          i < list.length - 1 && "border-b border-nevo-near-black/7",
        )}
      >
        <div className="min-w-0">
          <span className="text-[15px] font-medium text-nevo-near-black">
            {r.label}
          </span>
          <div className="mt-0.5 text-[13px] text-nevo-near-black/58">
            {r.sub}
          </div>
        </div>
        <Toggle
          on={valueOf(r.id)}
          onChange={() => toggle(r.id)}
          label={r.label}
        />
      </div>
    ));

  return (
    <div className="relative mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
      <div className="mx-auto max-w-[680px]">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-[23px] font-semibold tracking-[-0.015em] text-nevo-near-black xl:text-[26px]">
            Profile &amp; account
          </h2>
          {/* C14 B6: disabled until something is actually dirty. */}
          <button
            type="button"
            onClick={save}
            disabled={!dirty}
            className={cn(
              "inline-flex h-11 shrink-0 items-center rounded-[10px] px-[22px] text-[14.5px] font-semibold",
              dirty
                ? "cursor-pointer bg-nevo-navy text-nevo-cream transition-[filter] hover:brightness-93"
                : "cursor-default bg-nevo-navy/16 text-nevo-navy/50",
            )}
          >
            Save changes
          </button>
        </div>

        {/* Identity */}
        <div className="mt-5 flex items-center gap-4 rounded-xl bg-nevo-cream-elevated px-[22px] py-5 shadow-[0_2px_8px_rgba(0,0,0,0.06)] xl:mt-6 xl:gap-[18px] xl:px-[26px] xl:py-6">
          <AvatarDisc
            photoUrl={signedIn ? identity?.photoUrl : null}
            className="size-14 text-xl font-semibold xl:size-16 xl:text-[22px]"
          >
            {signedIn && identity?.initials ? (
              identity.initials
            ) : signedIn ? (
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="8" r="4" />
                <path d="M4 20a8 8 0 0 1 16 0" />
              </svg>
            ) : (
              profile.initials
            )}
          </AvatarDisc>
          <div className="min-w-0 flex-1">
            {signedIn && identityStatus === "loading" ? (
              /* Not "Teacher" and not "not connected" - neither is known
                 yet. A name-shaped bar until the read answers. */
              <span
                aria-busy="true"
                aria-label="Loading your details"
                className="block h-5 w-[180px] animate-pulse rounded-[6px] bg-nevo-near-black/9"
              />
            ) : signedIn && identityStatus === "failed" ? (
              <span className="block text-[15px] leading-[1.5] text-nevo-near-black/68">
                We couldn&rsquo;t load your details just now. Try again in a
                moment.
              </span>
            ) : (
            <span className="text-[17px] font-semibold text-nevo-near-black xl:text-[19px]">
              {signedIn ? (identity?.name ?? "Teacher") : profile.name}
            </span>
            )}
            {signedIn && identityStatus !== "ready" ? null : signedIn ? (
              <>
                {(identity?.subjects.length || identity?.school) && (
                  <div className="mt-[3px] text-sm text-nevo-near-black/60">
                    <span className="xl:hidden">
                      {identity.subjects.join(" & ") || identity.school}
                    </span>
                    <span className="hidden xl:inline">
                      {[identity.subjects.join(" & "), identity.school]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                )}
                {identity?.email && (
                  <div className="mt-[3px] truncate text-[13.5px] text-nevo-near-black/50">
                    {identity.email}
                  </div>
                )}
                {!identity?.name && (
                  <div className="mt-[3px] max-w-[420px] text-sm leading-[1.5] text-nevo-near-black/60">
                    Your details aren’t connected yet. Your name and contact
                    details come from your school.
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="mt-[3px] text-sm text-nevo-near-black/60">
                  <span className="xl:hidden">{profile.subjects}</span>
                  <span className="hidden xl:inline">
                    {`${profile.subjects} · ${profile.school}`}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-[13.5px] text-nevo-near-black/50">
                  {profile.email}
                </div>
              </>
            )}
          </div>
          {/* `PATCH /api/v1/users/me` shipped 1 Sep, so Edit is real for a
              signed-in teacher now - it was hidden because `users/me` was
              GET-only and there was nowhere to save to. Still hidden while
              the identity is unresolved: there is nothing to edit until we
              know what we are editing. */}
          {(!signedIn || identity) && (
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="inline-flex h-10 shrink-0 cursor-pointer items-center rounded-[10px] border-[1.5px] border-nevo-navy/35 px-4 text-sm font-medium text-nevo-navy transition-colors hover:bg-nevo-navy/6"
            >
              Edit
            </button>
          )}
        </div>

        <h3 className={SECTION_H3}>Notifications</h3>
        {notifications.failed ? (
          /* The toggles below are frame defaults until the stored values are
             read. Showing them as the teacher's saved choices would be a
             claim, and saving over them would overwrite the two categories
             they never touched - so the card says so instead. */
          <div className={CARD}>
            <div className="px-[22px] py-5">
              <p className="text-[15px] font-medium text-nevo-near-black">
                We couldn&rsquo;t load your notification choices.
              </p>
              <p className="mt-1.5 text-sm leading-[1.5] text-nevo-near-black/62">
                We&rsquo;re not showing them rather than guessing. Nothing has
                changed. Try again in a moment.
              </p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="mt-4 h-[42px] cursor-pointer rounded-[10px] border-[1.5px] border-nevo-navy/35 px-4 text-sm font-semibold text-nevo-navy transition-colors hover:bg-nevo-navy/6"
              >
                Try again
              </button>
            </div>
          </div>
        ) : !notifications.ready ? (
          <div className={CARD}>
            <div className="space-y-3 px-[22px] py-5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-[38px] animate-pulse rounded-[10px] bg-nevo-cream-inset"
                />
              ))}
            </div>
          </div>
        ) : (
          <div className={CARD}>{rows(NOTIFICATION_SETTINGS)}</div>
        )}

        <h3 className={SECTION_H3}>Accessibility</h3>
        <div className={CARD}>{rows(ACCESSIBILITY_SETTINGS)}</div>

        <button
          type="button"
          onClick={() => setSignOutOpen(true)}
          className="mt-7 inline-flex cursor-pointer items-center gap-2.5 text-[15px] font-medium text-nevo-navy transition-colors hover:text-nevo-navy/80 xl:mt-8"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <path d="M16 17l5-5-5-5" />
            <path d="M21 12H9" />
          </svg>
          Sign out
        </button>
      </div>

      {editOpen && (
        <EditProfileModal
          /* A signed-in teacher edits THEIR details. Seeding this from the
             fixture would open the form on someone else's name, email and
             subjects - and then save them. */
          profile={
            signedIn && identity
              ? {
                  ...profile,
                  name: identity.name ?? "",
                  email: identity.email ?? "",
                  subjects: identity.subjects.join(", "),
                  // The fixture's "MA" stood on the avatar of every teacher
                  // without a photo. Theirs, or nothing.
                  initials: identity.initials ?? "",
                }
              : profile
          }
          photoUrl={signedIn ? identity?.photoUrl : null}
          /* Signed out there is no account to put a photo on, so there is no
             control - rather than one that opens a picker and drops the file.
             The upload is here because this screen owns the session; the
             dialog owns the picker and what a teacher sees while it runs. */
          onPhotoPicked={signedIn ? uploadPhoto : undefined}
          onCancel={() => setEditOpen(false)}
          onSave={async (next) => {
            setProfile(next);
            if (!signedIn) {
              setEditOpen(false);
              setDirty(true);
              return true;
            }
            // One name field, two API fields: everything before the last
            // space is the first name. Imperfect for some names, and better
            // than refusing to save one.
            const trimmed = next.name.trim();
            const cut = trimmed.lastIndexOf(" ");
            const firstName = cut === -1 ? trimmed : trimmed.slice(0, cut);
            const lastName = cut === -1 ? "" : trimmed.slice(cut + 1);
            try {
              const saved = await usersApi.updateMe({
                firstName,
                lastName,
                subjects: next.subjects
                  .split(",")
                  .map((x) => x.trim())
                  .filter(Boolean),
              });
              // The rail renders the same identity, so it follows this write
              // rather than showing the old name until a reload.
              publishIdentity(saved);
              setEditOpen(false);
              say.show({ kind: "confirm", message: "Profile updated" });
              return true;
            } catch {
              return false;
            }
          }}
        />
      )}

      {signOutOpen && <SignOutModal onStay={() => setSignOutOpen(false)} />}

    </div>
  );
}
