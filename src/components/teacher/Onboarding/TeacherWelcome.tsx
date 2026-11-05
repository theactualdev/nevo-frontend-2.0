"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useHasSession } from "@/hooks/useHasSession";
import { useHydrated } from "@/hooks/useHydrated";
import { useTeacherClasses } from "@/hooks/useTeacherClasses";
import { useTeacherHome } from "@/hooks/useTeacherHome";
import { publishIdentity, uploadPhoto, useCurrentUser } from "@/hooks/useCurrentUser";
import { usersApi } from "@/lib/api/users";
import { AvatarDisc } from "@/components/shared/AvatarDisc";
import { cn } from "@/lib/utils";

/**
 * C01, the steps after a teacher's password: the join confirmation and the
 * light profile, then a brief hold into the console (backlog, 2 Nov: built
 * at last - CONSOLE_INVENTORY has carried them as unbuilt since 21 Sep).
 *
 * THE FRAME'S OWN WORDS throughout. Two lines are ours, for states it does
 * not draw: a teacher with no class yet, and a class read that failed.
 *
 * Nothing here is a gate. The classes are the school's to set and are only
 * shown; the profile is optional apart from a name, and the photo is
 * optional in the frame's own words.
 */

const DASHBOARD = "/teacher/dashboard";
const DONE_HOLD_MS = 1600;

const H1 = "text-[32px] leading-[1.15] font-semibold tracking-[-0.02em] text-nevo-near-black max-md:text-[26px]";
const SUB = "mt-3 text-[16px] leading-[1.55] text-nevo-near-black/70";
const PRIMARY =
  "flex h-[54px] w-full cursor-pointer items-center justify-center rounded-[10px] border-none bg-nevo-navy text-[16px] font-semibold text-nevo-cream transition-[filter] hover:brightness-93 disabled:cursor-default disabled:opacity-55";
const LABEL = "text-[13.5px] font-semibold text-nevo-near-black/70";
const FIELD =
  "w-full rounded-[10px] border-[1.5px] border-nevo-near-black/16 bg-nevo-cream-elevated text-[16px] text-nevo-near-black outline-none focus-within:border-nevo-navy";

const WORDS = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];

/** "Three classes are set up and waiting for you." - the frame's sentence. */
function readyLine(n: number): string {
  const count = n < WORDS.length ? WORDS[n] : String(n);
  return n === 1
    ? `${count} class is set up and waiting for you.`
    : `${count} classes are set up and waiting for you.`;
}

interface JoinCard {
  classId: string;
  name: string;
  subjects: string[];
  count: number | null;
}

export function TeacherWelcome() {
  const router = useRouter();
  const hydrated = useHydrated();
  const signedIn = useHasSession();
  const [step, setStep] = useState<"join" | "profile" | "done">("join");

  // These steps follow a password; with no session there is nobody to welcome.
  useEffect(() => {
    if (hydrated && !signedIn) router.replace("/auth/teacher");
  }, [hydrated, signedIn, router]);

  if (!hydrated || !signedIn) return null;

  return (
    <div className="relative flex min-h-dvh flex-col bg-nevo-cream text-nevo-near-black">
      {step !== "done" && (
        <span className="absolute top-9 left-11 block h-[18px] w-[62px] overflow-hidden max-md:top-6 max-md:left-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/logo-wordmark-purple.png"
            alt="Nevo"
            className="absolute block h-[181px] w-[181px] max-w-none -translate-x-[66px] -translate-y-[87px]"
          />
        </span>
      )}
      <div className="flex flex-1 items-center justify-center px-6 py-20">
        {step === "join" && <JoinStep onNext={() => setStep("profile")} />}
        {step === "profile" && <ProfileStep onDone={() => setStep("done")} />}
        {step === "done" && <DoneStep onGo={() => router.push(DASHBOARD)} />}
      </div>
    </div>
  );
}

/** Step 2 · Join confirmation: the classes the school set up, as they are. */
function JoinStep({ onNext }: { onNext: () => void }) {
  const { liveClasses, loading, sample } = useTeacherClasses();
  const { pulse } = useTeacherHome();
  const cards = useMemo<JoinCard[]>(() => {
    const byClass = new Map<string, JoinCard>();
    for (const a of liveClasses) {
      // One card per class: an assignment is teacher + class + subject, so a
      // teacher of two subjects in one class would otherwise see it twice.
      const card = byClass.get(a.classId) ?? {
        classId: a.classId,
        name: a.className,
        subjects: [],
        count: pulse.find((p) => p.classId === a.classId)?.studentCount ?? null,
      };
      if (a.subject && !card.subjects.includes(a.subject)) card.subjects.push(a.subject);
      byClass.set(a.classId, card);
    }
    return [...byClass.values()];
  }, [liveClasses, pulse]);

  return (
    <div className="flex w-full max-w-[520px] flex-col items-start">
      <span className="flex size-[52px] items-center justify-center rounded-full bg-nevo-navy text-nevo-cream">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </span>
      <h1 className={cn(H1, "mt-[22px]")}>You&rsquo;re in. Here&rsquo;s what you&rsquo;re teaching:</h1>
      {loading ? (
        <div aria-busy="true" aria-label="Loading your classes" className="mt-7 flex w-full flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[74px] animate-pulse rounded-[12px] bg-nevo-cream-elevated" />
          ))}
        </div>
      ) : sample ? (
        <p className={SUB}>
          We couldn&rsquo;t load your classes just now. They&rsquo;ll be on
          your home page.
        </p>
      ) : cards.length === 0 ? (
        <p className={SUB}>
          Your school hasn&rsquo;t given you a class yet. When it does,
          it&rsquo;ll be on your home page.
        </p>
      ) : (
        <>
          <p className={SUB}>{readyLine(cards.length)}</p>
          <ul className="mt-7 flex w-full list-none flex-col gap-3 p-0">
            {cards.map((c) => (
              <li
                key={c.classId}
                className="flex items-center justify-between gap-4 rounded-[12px] bg-nevo-cream-elevated px-[22px] py-[18px] shadow-elevation-1"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="text-[16.5px] font-semibold">{c.name}</span>
                  {c.subjects.length > 0 && (
                    <span className="mt-[3px] text-[14px] text-nevo-near-black/60">
                      {c.subjects.join(" · ")}
                    </span>
                  )}
                </span>
                {c.count !== null && (
                  <span className="shrink-0 text-[14.5px] text-nevo-near-black/62">
                    {`${c.count} ${c.count === 1 ? "student" : "students"}`}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      <button type="button" onClick={onNext} className={cn(PRIMARY, "mt-8")}>
        Set up my profile
      </button>
    </div>
  );
}

/** Step 3 · Profile setup: a photo (optional), a name, the subjects. */
function ProfileStep({ onDone }: { onDone: () => void }) {
  const identity = useCurrentUser();
  // The teacher's own edits, over what the school set up - null until touched.
  const [name, setName] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<string[] | null>(null);
  const [adding, setAdding] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoState, setPhotoState] = useState<"idle" | "sending" | "failed">("idle");
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const shownName = name ?? identity?.name ?? "";
  const shownSubjects = subjects ?? identity?.subjects ?? [];
  const shownPhoto = photo ?? identity?.photoUrl ?? null;

  const addSubject = () => {
    const next = adding.trim().replace(/,$/, "").trim();
    setAdding("");
    if (!next || shownSubjects.some((s) => s.toLowerCase() === next.toLowerCase())) return;
    setSubjects([...shownSubjects, next]);
  };

  const pickPhoto = async (file: File | undefined) => {
    if (!file || photoState === "sending") return;
    setPhotoState("sending");
    const url = await uploadPhoto(file);
    setPhotoState(url ? "idle" : "failed");
    if (url) setPhoto(url);
  };

  const save = async () => {
    const trimmed = shownName.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setFailed(false);
    // One name field, two API fields, as the profile settings split it.
    const cut = trimmed.lastIndexOf(" ");
    try {
      const saved = await usersApi.updateMe({
        firstName: cut === -1 ? trimmed : trimmed.slice(0, cut),
        lastName: cut === -1 ? "" : trimmed.slice(cut + 1),
        subjects: [...shownSubjects, ...(adding.trim() ? [adding.trim()] : [])],
      });
      publishIdentity(saved);
      onDone();
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="flex w-full max-w-[480px] flex-col items-start"
    >
      <h1 className={H1}>A little about you</h1>
      <p className={SUB}>This is just so your students and colleagues recognise you.</p>

      <button
        type="button"
        onClick={() => fileInput.current?.click()}
        disabled={photoState === "sending"}
        className="mt-[30px] flex cursor-pointer items-center gap-[18px] border-none bg-transparent p-0 text-left"
      >
        {shownPhoto ? (
          <AvatarDisc
            photoUrl={shownPhoto}
            className="size-[76px] shrink-0 bg-nevo-cream-elevated text-[22px] font-semibold text-nevo-navy"
          >
            {identity?.initials ?? ""}
          </AvatarDisc>
        ) : (
          <span className="flex size-[76px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-dashed border-nevo-navy/30 bg-nevo-cream-elevated text-nevo-navy">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 8a2 2 0 0 1 2-2h1l1.5-2h5L16 6h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
              <circle cx="12" cy="12.5" r="3.2" />
            </svg>
          </span>
        )}
        <span className="flex flex-col">
          <span className="text-[15px] font-medium text-nevo-near-black">
            {photoState === "sending" ? "Adding your photo…" : shownPhoto ? "Change photo" : "Add a photo"}
          </span>
          <span className="mt-[3px] text-[13.5px] text-nevo-near-black/55">
            {photoState === "failed" ? "That photo didn’t upload. Try another." : "Optional"}
          </span>
        </span>
      </button>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void pickPhoto(e.target.files?.[0])}
      />

      <label htmlFor="welcome-name" className={cn(LABEL, "mt-[26px]")}>
        Your name
      </label>
      <input
        id="welcome-name"
        value={shownName}
        onChange={(e) => setName(e.target.value)}
        autoComplete="name"
        className={cn(FIELD, "mt-2 h-[52px] px-4")}
      />

      <label htmlFor="welcome-subject" className={cn(LABEL, "mt-[22px]")}>
        Subject area(s)
      </label>
      <div className={cn(FIELD, "mt-2 flex min-h-[52px] flex-wrap items-center gap-2 px-3 py-[9px]")}>
        {shownSubjects.map((s) => (
          <span
            key={s}
            className="inline-flex items-center gap-[7px] rounded-full bg-nevo-violet/22 px-3 py-1.5 text-[13.5px] font-medium text-nevo-navy"
          >
            {s}
            <button
              type="button"
              aria-label={`Remove ${s}`}
              onClick={() => setSubjects(shownSubjects.filter((x) => x !== s))}
              className="cursor-pointer border-none bg-transparent p-0 text-[15px] leading-none text-nevo-navy/55 hover:text-nevo-navy"
            >
              ×
            </button>
          </span>
        ))}
        <input
          id="welcome-subject"
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addSubject();
            }
          }}
          onBlur={addSubject}
          placeholder="Add another…"
          className="min-w-[120px] flex-1 border-none bg-transparent px-1 py-0.5 text-[14.5px] outline-none placeholder:text-nevo-near-black/40"
        />
      </div>

      {failed && (
        <p role="alert" className="mt-4 text-[14px] leading-[1.5] text-nevo-navy">
          That didn&rsquo;t save just now. Try again in a moment.
        </p>
      )}

      <button type="submit" disabled={!shownName.trim() || saving} className={cn(PRIMARY, "mt-[34px]")}>
        {saving ? "Saving…" : "Continue to my dashboard"}
      </button>
    </form>
  );
}

/** Complete: a brief hold, then the console. */
function DoneStep({ onGo }: { onGo: () => void }) {
  const identity = useCurrentUser();
  const first = identity?.chosenName?.trim() || identity?.name?.trim().split(/\s+/)[0] || "";
  useEffect(() => {
    const t = setTimeout(onGo, DONE_HOLD_MS);
    return () => clearTimeout(t);
  }, [onGo]);
  return (
    <div className="flex flex-col items-center text-center">
      <span className="flex size-[72px] items-center justify-center rounded-full bg-nevo-navy text-nevo-cream motion-safe:animate-nevo-pop">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </span>
      <h1 className="mt-[26px] text-[30px] font-semibold tracking-[-0.015em] text-nevo-near-black">
        {first ? `All set, ${first}.` : "All set."}
      </h1>
      <p className="mt-3 max-w-[400px] text-[17px] leading-[1.55] text-nevo-near-black/70">
        Taking you to your dashboard.
      </p>
    </div>
  );
}
