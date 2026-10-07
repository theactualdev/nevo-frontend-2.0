"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  notificationPrefsApi,
  type NotificationPreference,
} from "@/lib/api/settings";
import type { PermissionScope } from "@/lib/constants/permissions";
import { cn } from "@/lib/utils";
import { CARD, PRIMARY_BTN, ROW_DIVIDER } from "../Roster/primitives";
import { categoriesForScopes, preferencesIntro, type CategoryMeta } from "./categories";

/**
 * D13.4 Preferences - per category, per channel, per admin.
 *
 * The point of this screen, in the spec's own words, is that NOBODY SILENCES
 * EVERYTHING OUT OF FRUSTRATION. A bursar who can turn off the five streams
 * that are not theirs will keep the one that is; a bursar facing an
 * all-or-nothing switch turns the lot off.
 *
 * SAVE IS PER TOGGLE AND IMMEDIATE, with a quiet "Saved" flash beside the row
 * and no spinner. This is the one place in settings where autosave is right,
 * because a toggle is its own confirmation. A refused save puts the toggle
 * BACK where it was and says nothing changed - it never leaves a switch
 * showing a state the server did not accept.
 *
 * FIXED EMAIL IS PRESSABLE, NEVER GREYED. Pressing it reveals a violet line
 * explaining why it stays on; the toggle does not move and no route is
 * offered, because there is nothing for the admin to do about it. And fixed is
 * per CHANNEL: the in-app toggle of a fixed category stays writable, which is
 * the correct asymmetry - the email is the obligation, the in-app row is a
 * convenience.
 *
 * Scope filtering makes rows ABSENT, not disabled, matching the sidebar rule.
 *
 * See `categories.ts` for the larger problem: three of SCRUM-100's six
 * categories have no value in the backend enum and so cannot appear at all.
 *
 * THE TABLET VARIANTS ARE KEYED `max-xl:`, NOT `max-lg:`, AND THAT IS THE
 * CONSOLE'S RULE RATHER THAN THIS FILE'S TASTE. The admin shell collapses its
 * rail at `(min-width: 1280px)` - `AdminSidebar` reads exactly that media
 * query - so 1280 is where this console becomes a tablet, and the frames are
 * drawn at 1440 and 1024. A `max-lg:` variant fires below 1024 and so never
 * fires at the tablet size anything here is designed for: the stacked form
 * below was written, shipped, and could not be reached at either drawn width.
 * Tailwind's `lg` is a general-purpose default; this product's boundary is one
 * step up, and the same re-key is owed by every `max-lg:` still in this tree.
 */

type Phase = "loading" | "ready" | "failed";
type Channel = "inApp" | "email";

function Toggle({
  on,
  disabled,
  label,
  onClick,
}: {
  on: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "relative h-[26px] w-[46px] flex-none cursor-pointer rounded-full transition-colors",
        on ? "bg-nevo-navy" : "bg-nevo-navy/25",
        // Deliberately NOT `disabled` and NOT greyed - a locked email toggle
        // is pressable so it can explain itself.
        disabled && "opacity-100",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-[3px] size-5 rounded-full bg-nevo-cream transition-[left]",
          on ? "left-[23px]" : "left-[3px]",
        )}
      />
    </button>
  );
}

export function NotificationPreferences({ scopes }: { scopes: PermissionScope[] }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [prefs, setPrefs] = useState<Record<string, NotificationPreference>>({});
  const [savedFlash, setSavedFlash] = useState<string | null>(null);
  const [explaining, setExplaining] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const visible = useMemo(() => categoriesForScopes(scopes), [scopes]);

  const load = useCallback(() => {
    notificationPrefsApi
      .list()
      .then((rows) => {
        setPrefs(Object.fromEntries(rows.map((r) => [r.category, r])));
        setPhase("ready");
      })
      .catch(() => setPhase("failed"));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Defaults, per SCRUM-100: in-app on for everything; email on for the three
   * that need action outside a Nevo session. Used only where the server has
   * no row for a category yet, so the screen never shows a switch as off when
   * the truth is "not set".
   */
  const current = (c: CategoryMeta): NotificationPreference =>
    prefs[c.key] ?? {
      category: c.key,
      inApp: true,
      email: c.fixedEmail,
    };

  const flip = (c: CategoryMeta, channel: Channel) => {
    if (channel === "email" && c.fixedEmail) {
      setExplaining(explaining === c.key ? null : c.key);
      return;
    }

    const before = current(c);
    const after = { ...before, [channel]: !before[channel] };

    setFailed(null);
    setPrefs((prev) => ({ ...prev, [c.key]: after }));

    notificationPrefsApi
      .update([after])
      .then((res) => {
        // A 200 can still refuse the row: `rejected` is the server saying
        // this one did not take. That is not "Saved".
        if (res?.rejected && res.rejected.length > 0) {
          setPrefs((prev) => ({ ...prev, [c.key]: before }));
          setFailed(c.key);
          return;
        }
        setSavedFlash(c.key);
        setTimeout(() => setSavedFlash((k) => (k === c.key ? null : k)), 1600);
      })
      .catch(() => {
        // Back where it was, and say so. A toggle must never sit in a state
        // the server refused.
        setPrefs((prev) => ({ ...prev, [c.key]: before }));
        setFailed(c.key);
      });
  };

  if (phase === "loading") {
    return <div className={cn(CARD, "mt-6 h-[360px] animate-pulse")} />;
  }

  if (phase === "failed") {
    return (
      <div className={cn(CARD, "mt-6 px-[26px] py-7")}>
        <h3 className="text-[17px] font-semibold text-nevo-near-black">
          We couldn&rsquo;t load your preferences
        </h3>
        <p className="mt-2 max-w-[52ch] text-sm leading-[1.55] text-nevo-near-black/62">
          Nothing has changed. Try again in a moment.
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
    );
  }

  return (
    <>
      <p className="mt-2 max-w-[60ch] text-[14.5px] leading-[1.6] text-nevo-near-black/62">
        {preferencesIntro(visible, scopes)}
      </p>

      <div className={cn(CARD, "mt-6")}>
        <div className="flex items-center gap-12 border-b border-nevo-near-black/8 bg-nevo-near-black/[0.03] px-[22px] py-3 max-xl:hidden">
          <span className="flex-1" />
          <span className="w-[46px] text-center text-[11.5px] font-semibold uppercase tracking-[0.05em] text-nevo-near-black/50">
            In Nevo
          </span>
          <span className="w-[46px] text-center text-[11.5px] font-semibold uppercase tracking-[0.05em] text-nevo-near-black/50">
            Email
          </span>
        </div>

        {visible.map((c, i) => {
          const pref = current(c);
          return (
            <div
              key={c.key}
              className={cn("px-[22px] py-[18px]", i < visible.length - 1 && ROW_DIVIDER)}
            >
              <div className="flex items-center gap-12 max-xl:flex-col max-xl:items-start max-xl:gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2.5">
                    <span className="text-[15px] font-semibold text-nevo-near-black">
                      {c.name}
                    </span>
                    {savedFlash === c.key ? (
                      <span className="text-[12px] font-semibold text-nevo-navy motion-safe:animate-nevo-reveal">
                        Saved
                      </span>
                    ) : null}
                  </div>
                  <p className="m-0 mt-1 text-[13px] leading-[1.5] text-nevo-near-black/60">
                    {c.description}
                  </p>
                </div>

                <div className="flex items-center gap-12 max-xl:gap-8">
                  <span className="flex flex-col items-center gap-1.5">
                    <span className="hidden text-[11.5px] font-semibold uppercase tracking-[0.05em] text-nevo-near-black/50 max-xl:block">
                      In Nevo
                    </span>
                    <Toggle
                      on={pref.inApp}
                      label={`${c.name} in Nevo`}
                      onClick={() => flip(c, "inApp")}
                    />
                  </span>
                  <span className="flex flex-col items-center gap-1.5">
                    <span className="hidden text-[11.5px] font-semibold uppercase tracking-[0.05em] text-nevo-near-black/50 max-xl:block">
                      Email
                    </span>
                    <Toggle
                      on={pref.email}
                      disabled={c.fixedEmail}
                      label={`${c.name} by email`}
                      onClick={() => flip(c, "email")}
                    />
                  </span>
                </div>
              </div>

              {explaining === c.key ? (
                <p className="m-0 mt-3 rounded-[10px] bg-nevo-violet/[0.18] px-4 py-3 text-[13.5px] leading-[1.5] text-nevo-navy">
                  This one stays on. It&rsquo;s how we tell you about things
                  that affect your account or the law.
                </p>
              ) : null}

              {failed === c.key ? (
                <p className="m-0 mt-3 rounded-[10px] bg-nevo-violet/[0.18] px-4 py-3 text-[13.5px] leading-[1.5] text-nevo-navy">
                  That didn&rsquo;t save, so nothing has changed. We&rsquo;re on
                  it.
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-[13px] leading-[1.55] text-nevo-near-black/55">
        You only see the areas your access covers. Tap a locked switch to see
        why it stays on.
      </p>
    </>
  );
}
