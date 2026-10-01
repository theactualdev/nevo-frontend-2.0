"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, LogOut, MessageCircle } from "lucide-react";
import { NevoKeyboard, Switch } from "@/components/shared";
import { MaybeSample } from "@/components/shared/SampleRegion";
import { useAuth } from "@/hooks";
import { useHasSession } from "@/hooks/useHasSession";
import { useHydrated } from "@/hooks/useHydrated";
import { useDisplayName } from "@/components/student/Shell/useDisplayName";
import { useAvatarTone } from "@/components/student/Shell/useAvatarTone";
import { setStoredDisplayName } from "@/lib/auth/session";
import { settingsApi } from "@/lib/api/settings";
import { useAccessibility } from "@/context/AccessibilityContext";
import { cn } from "@/lib/utils";
import { AvatarPickerSheet } from "./AvatarPickerSheet";
import { SignOutSheet } from "./SignOutSheet";

const TEXT_SIZES = [
  { id: "s", label: "S" },
  { id: "m", label: "M" },
  { id: "l", label: "L" },
  { id: "xl", label: "XL" },
] as const;

/**
 * Profile & Settings (screen 27). Read-only learning preferences (observed, not
 * self-reported), accessibility controls, break preference, and account. Every
 * change is acknowledged with a quiet "Saved" pill.
 *
 * The accessibility controls (Reduced Motion / Text Size / High Contrast) are the
 * global, persisted preferences from `AccessibilityContext` — changing one here
 * takes effect across the whole app immediately.
 */
export function ProfileSettings() {
  const router = useRouter();
  const { signOut } = useAuth();
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [lookOpen, setLookOpen] = useState(false);
  const { tone, choose: chooseTone } = useAvatarTone();

  // Editable display name (product frame: tap Change → inline input; initials
  // derive from the name). TODO(api): persist via the profile endpoint.
  const stored = useDisplayName();
  // Signed out, the name and initials are the fixture child's ("Ada"), so the
  // row is marked - the same gate the shell's identity uses.
  const signedIn = useHasSession();
  const hydrated = useHydrated();
  const showingFixtureIdentity = hydrated && !signedIn;
  const [name, setName] = useState(stored.name);
  const [editingName, setEditingName] = useState(false);
  const [nameKbOpen, setNameKbOpen] = useState(false);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || stored.initials;

  const {
    reducedMotion,
    highContrast,
    textSize,
    setReducedMotion,
    setHighContrast,
    setTextSize,
  } = useAccessibility();
  // Was local, unpersisted state that nothing read - flipping it off left
  // the 20-minute prompt firing exactly as before.
  const { suggestBreaks, setSuggestBreaks } = useAccessibility();

  // Transient "Saved" confirmation.
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    },
    [],
  );
  const flashSaved = useCallback(() => {
    setSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 1700);
  }, []);

  return (
    <div className="mx-auto w-full max-w-[600px] px-5 py-2 pb-8 sm:px-8 sm:py-6">
      <h1 className="text-2xl font-semibold tracking-[-0.01em] text-nevo-near-black sm:text-[30px] lg:text-[32px]">
        Profile &amp; Settings
      </h1>

      {/* VARK retirement (round 3): the product describes what it is DOING for
          a student, never what kind of learner they are. Fixed copy only - no
          channel statements, no learning-style attribution. */}
      <SectionHeading>Your learning space</SectionHeading>
      <p className="text-[15px] leading-[1.55] text-nevo-near-black/70">
        Your learning space is set up for you. Nevo adjusts your lessons based
        on how you&apos;re doing.
      </p>

      {/* Accessibility */}
      <SectionHeading>Accessibility</SectionHeading>
      <SettingRow label="Reduced motion">
        <Switch
          checked={reducedMotion}
          onCheckedChange={(v) => {
            setReducedMotion(v);
            flashSaved();
          }}
          aria-label="Reduced motion"
        />
      </SettingRow>

      <div className="py-3.5">
        <div className="flex items-center justify-between">
          <span className="text-[15px] text-nevo-near-black">Text size</span>
          <div className="flex gap-1 rounded-full bg-nevo-near-black/6 p-[3px]">
            {TEXT_SIZES.map((size) => (
              <button
                key={size.id}
                type="button"
                aria-pressed={textSize === size.id}
                onClick={() => {
                  setTextSize(size.id);
                  flashSaved();
                }}
                className={cn(
                  "min-w-8 cursor-pointer rounded-full px-2.5 py-1.5 text-[13px] font-medium transition-colors",
                  textSize === size.id
                    ? "bg-nevo-navy text-nevo-cream"
                    : "text-nevo-near-black",
                )}
              >
                {size.label}
              </button>
            ))}
          </div>
        </div>
        {/* A live sample — scales with the whole app via the content zoom. */}
        <p className="mt-3 text-[15px] text-nevo-near-black/72">
          The quick brown fox
        </p>
      </div>

      <SettingRow label="High contrast">
        <Switch
          checked={highContrast}
          onCheckedChange={(v) => {
            setHighContrast(v);
            flashSaved();
          }}
          aria-label="High contrast"
        />
      </SettingRow>

      {/* Breaks */}
      <SectionHeading>Breaks</SectionHeading>
      <div className="flex items-center justify-between py-1.5">
        <span className="text-[15px] text-nevo-near-black">
          Suggest breaks automatically
        </span>
        <Switch
          checked={suggestBreaks}
          onCheckedChange={(v) => {
            setSuggestBreaks(v);
            flashSaved();
          }}
          aria-label="Suggest breaks automatically"
        />
      </div>
      <p className="mt-1 text-[13px] text-nevo-near-black/60">
        Nevo will still check in during moments that really call for a break
      </p>

      {/* Account */}
      <SectionHeading>Account</SectionHeading>
      <MaybeSample showing={showingFixtureIdentity} kind="student:identity">
      <div className="flex items-center gap-3.5 py-3">
        {/* The disc opens "Choose your look" (frame 27). */}
        <button
          type="button"
          aria-label="Choose your look"
          onClick={() => setLookOpen(true)}
          style={{ background: tone.background, color: tone.text }}
          className="flex size-14 shrink-0 cursor-pointer items-center justify-center rounded-full text-xl font-semibold transition-[filter] hover:brightness-110"
        >
          {initials}
        </button>
        {editingName ? (
          <input
            ref={nameInputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onFocus={() => setNameKbOpen(true)}
            onBlur={() => {
              setNameKbOpen(false);
              setEditingName(false);
              if (!name.trim()) {
                setName(stored.name);
                return;
              }
              // "Saved" now means it: the name persists to the device and
              // the rest of the app follows it.
              setStoredDisplayName(name, initials);
              // Also against the account, so the name they chose for
              // themselves follows them to another device. Best-effort: the
              // device copy is what this screen reads back either way.
              void settingsApi
                .update({ displayName: name.trim() })
                .catch(() => {});
              flashSaved();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            // A.12: the Nevo Keyboard drives entry on touch; hardware keyboard
            // still types on desktop, where the on-screen one is hidden.
            inputMode="none"
            autoFocus
            aria-label="Your name"
            className="h-[42px] min-w-0 flex-1 rounded-[10px] border-[1.5px] border-nevo-navy bg-nevo-cream-elevated px-3.5 text-[15px] text-nevo-near-black outline-none"
          />
        ) : (
          <>
            <span className="min-w-0 flex-1 truncate text-[15px] text-nevo-near-black">
              {name || stored.name}
            </span>
            <button
              type="button"
              onClick={() => {
                // The local field seeds once at mount, which can predate the
                // server name arriving - so entering edit re-seeds from
                // whatever the hook now says.
                setName((n) => n || stored.name);
                setEditingName(true);
              }}
              className="cursor-pointer text-[15px] font-medium text-nevo-navy"
            >
              Change
            </button>
          </>
        )}
      </div>
      </MaybeSample>
      <button
        type="button"
        onClick={() => router.push("/student/profile/feedback")}
        className="flex w-full cursor-pointer items-center justify-between border-t border-nevo-near-black/8 py-4 text-left"
      >
        <span className="flex items-center gap-2.5">
          <MessageCircle
            className="size-[18px] text-nevo-navy/70"
            strokeWidth={1.9}
          />
          <span className="text-[15px] text-nevo-near-black">
            Tell us something
          </span>
        </span>
        <ChevronRight
          className="size-5 text-nevo-near-black/40"
          strokeWidth={2}
        />
      </button>
      <button
        type="button"
        onClick={() => router.push("/student/profile/pin")}
        className="flex w-full cursor-pointer items-center justify-between border-t border-nevo-near-black/8 py-4 text-left"
      >
        <span className="text-[15px] text-nevo-near-black">Change PIN</span>
        <ChevronRight
          className="size-5 text-nevo-near-black/40"
          strokeWidth={2}
        />
      </button>
      <button
        type="button"
        onClick={() => setSignOutOpen(true)}
        className="flex w-full cursor-pointer items-center justify-between border-t border-nevo-near-black/8 py-4 text-left"
      >
        <span className="flex items-center gap-2.5">
          <LogOut className="size-[18px] text-nevo-navy/70" strokeWidth={1.9} />
          <span className="text-[15px] text-nevo-near-black">Sign out</span>
        </span>
        <ChevronRight
          className="size-5 text-nevo-near-black/40"
          strokeWidth={2}
        />
      </button>

      <MaybeSample showing={showingFixtureIdentity} kind="student:identity">
      <AvatarPickerSheet
        open={lookOpen}
        onOpenChange={setLookOpen}
        initials={initials}
        current={tone}
        onChoose={(next) => {
          setLookOpen(false);
          // "Saved" only once the account holds it. The disc changes at once
          // either way; on a failed write it quietly goes back, which is the
          // truth about what was kept.
          chooseTone(next.id).then(flashSaved, () => {});
        }}
      />
      </MaybeSample>

      <SignOutSheet
        open={signOutOpen}
        onOpenChange={setSignOutOpen}
        onSignOut={() => {
          setSignOutOpen(false);
          signOut();
          // The sheet promises "you can come back anytime with your PIN", and
          // the PIN door is where every child goes - ALWAYS. This read the
          // legacy one-child profile key and sent a device it did not name to
          // onboarding, which cannot sign anyone in: on a shared tablet that
          // is the second-account trap. `/auth/login` handles a device that
          // remembers nobody itself (28c-2).
          const door = "/auth/login";
          // A HARD navigation, not router.push - the same race the teacher
          // console hit in #176. The route guard reads the `nevo.role` cookie
          // and a client-side push runs before the clear settles, so the guard
          // still saw a student, bounced them back into the console, and the
          // token dropped underneath them a moment later. Signing out landed
          // you where you started and then quietly logged you out.
          window.location.assign(door);
        }}
      />

      {/* Name entry on touch - the branded keyboard, focus-gated (A.12). */}
      {nameKbOpen && (
        <NevoKeyboard
          layout="qwerty"
          onKey={(c) => setName((n) => n + c)}
          onBackspace={() => setName((n) => n.slice(0, -1))}
          onReturn={() => nameInputRef.current?.blur()}
          className="fixed inset-x-0 bottom-0 z-40"
        />
      )}

      {/* Saved confirmation — quiet, transient, non-blocking */}
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "pointer-events-none fixed bottom-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-nevo-cream-elevated px-4 py-2 shadow-elevation-3 transition-all duration-200",
          saved ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
        )}
      >
        <span className="flex size-5 items-center justify-center rounded-full bg-nevo-navy">
          <Check className="size-3 text-nevo-cream" strokeWidth={2.8} />
        </span>
        <span className="text-sm font-medium text-nevo-near-black">Saved</span>
      </div>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-8 mb-3 text-base font-semibold text-nevo-near-black">
      {children}
    </h2>
  );
}

function SettingRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-3.5">
      <span className="text-[15px] text-nevo-near-black">{label}</span>
      {children}
    </div>
  );
}
