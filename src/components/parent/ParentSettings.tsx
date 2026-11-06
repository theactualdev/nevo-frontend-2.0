"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { authApi } from "@/lib/api/auth";
import { parentApi, type ParentChild } from "@/lib/api/parent";
import { usersApi, type CurrentUser } from "@/lib/api/users";
import { FeedbackPanel } from "@/components/teacher/Shell/FeedbackPanel";

/*
 * D01f PARENT SETTINGS (design 1397ec4) - "the home the Share feedback row
 * (D23) needed" - built REDUCED to rows a real endpoint stands behind (5 Nov
 * check; raised to the hub, rule 10):
 *
 *  - Your account: name and email from `GET /users/me`, read-only - there is
 *    nothing to edit it with here, so it isn't a link.
 *  - Each child, with their school (`/parents/me/children`). The frame's
 *    class ("JSS 2A") isn't on that read, so it's left out.
 *  - Consent & data -> the existing data page (D01c).
 *  - Sign out (`POST /auth/logout`), with the frame's "Signed in as" line.
 *  - Share feedback at the foot: the shared Nevo Feedback panel in its parent
 *    words (`POST /api/v1/feedback`, any signed-in role).
 *
 * Left out, and why:
 *  - "Email updates from the school": there is no school-to-parent stream to
 *    switch. The only notice a parent gets is a consent action, and the server
 *    emails it whatever a preference says - a toggle here would switch nothing.
 *  - "Help - Contact {child}'s school": nothing gives a signed-in parent the
 *    school's phone or email.
 *  - The desktop line "Your account, your child, and how {school} reaches you":
 *    its last part is the email row that isn't here.
 */

type Read =
  | { kind: "loading" }
  | { kind: "failed" }
  | { kind: "ready"; me: CurrentUser; children: ParentChild[] };

const ROW = "flex items-center justify-between gap-4 px-5 py-4";
const ROW_TITLE = "m-0 text-[15px] font-semibold text-nevo-near-black";
const ROW_SUB = "m-0 mt-0.5 text-[13px] leading-[1.45] text-nevo-near-black/58";

export function ParentSettings() {
  const router = useRouter();
  const [read, setRead] = useState<Read>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [feedback, setFeedback] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([usersApi.me(), parentApi.myChildren()])
      .then(([me, children]) => {
        if (alive) setRead({ kind: "ready", me, children });
      })
      .catch((err: unknown) => {
        if (!alive) return;
        // Signed out, or the session ended: the home is where a parent signs in.
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/parent-portal");
          return;
        }
        setRead({ kind: "failed" });
      });
    return () => {
      alive = false;
    };
  }, [attempt, router]);

  const signOut = () => {
    if (signingOut) return;
    setSigningOut(true);
    void authApi.logout().finally(() => router.replace("/parent-sign-in"));
  };

  return (
    <main className="min-h-dvh bg-nevo-cream text-nevo-near-black">
      <div className="flex h-14 items-center border-b border-nevo-near-black/8 px-5 md:h-16 md:px-10 lg:h-[66px] lg:px-12">
        <Image
          src="/brand/nevo-wordmark.png"
          alt="Nevo"
          width={344}
          height={116}
          priority
          className="h-[15px] w-auto"
        />
      </div>
      <div className="px-4 pt-[22px] pb-7 md:px-12 md:pt-9 md:pb-10 lg:py-10">
        <div className="mx-auto w-full md:max-w-[640px] lg:max-w-[820px]">
          <Link href="/parent-portal" className="text-[14px] font-semibold text-nevo-navy hover:opacity-75">
            &larr; Portal home
          </Link>
          <h1 className="m-0 mt-4 text-[24px] font-semibold tracking-[-0.01em]">Settings</h1>

          {read.kind === "loading" ? <div aria-busy="true" className="mt-6 h-48" /> : null}

          {read.kind === "failed" ? (
            <div className="mt-5 rounded-[14px] bg-nevo-cream-elevated px-[22px] py-5 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
              <p className="m-0 text-[18px] font-semibold">We couldn&rsquo;t load this just now</p>
              <p className="mt-1.5 mb-0 text-[14.5px] leading-[1.55] text-nevo-near-black/68">
                Nothing has changed. Try again in a moment.
              </p>
              <button
                type="button"
                onClick={() => {
                  setRead({ kind: "loading" });
                  setAttempt((a) => a + 1);
                }}
                className="mt-4 cursor-pointer text-[14.5px] font-semibold text-nevo-navy hover:underline"
              >
                Try again
              </button>
            </div>
          ) : null}

          {read.kind === "ready" ? (
            <Rows
              me={read.me}
              kids={read.children}
              signingOut={signingOut}
              onSignOut={signOut}
              onFeedback={() => setFeedback(true)}
            />
          ) : null}
        </div>
      </div>
      {feedback ? <FeedbackPanel role="parent" onClose={() => setFeedback(false)} /> : null}
    </main>
  );
}

function Rows({
  me,
  kids,
  signingOut,
  onSignOut,
  onFeedback,
}: {
  me: CurrentUser;
  kids: ParentChild[];
  signingOut: boolean;
  onSignOut: () => void;
  onFeedback: () => void;
}) {
  const name = me.displayName?.trim() || [me.firstName, me.lastName].filter(Boolean).join(" ");
  const email = me.email?.trim() || null;
  // One school for every child is the common case; with more than one, the
  // sign-out line names none rather than picking.
  const schools = [...new Set(kids.map((k) => k.schoolName).filter(Boolean))];
  const school = schools.length === 1 ? schools[0] : null;
  const only = kids.length === 1 ? kids[0] : null;
  const dataHref = `/parent-portal/data${only ? `?child=${encodeURIComponent(only.studentId)}` : ""}`;

  return (
    <>
      <div className="mt-5 overflow-hidden rounded-[14px] bg-nevo-cream-elevated shadow-[0_2px_8px_rgba(0,0,0,0.06)] [&>*+*]:border-t [&>*+*]:border-nevo-near-black/7">
        <div className={ROW}>
          <div className="min-w-0">
            <p className={ROW_TITLE}>Your account</p>
            <p className={ROW_SUB}>{email ? `${name} · ${email}` : name}</p>
          </div>
        </div>
        {kids.map((k) => (
          <div key={k.studentId} className={ROW}>
            <div className="min-w-0">
              <p className={ROW_TITLE}>{k.firstName?.trim() || "Your child"}</p>
              {k.schoolName ? <p className={ROW_SUB}>{k.schoolName}</p> : null}
            </div>
          </div>
        ))}
        <Link href={dataHref} className={`${ROW} cursor-pointer hover:bg-nevo-navy/[0.04]`}>
          <div className="min-w-0">
            <p className={ROW_TITLE}>Consent &amp; data</p>
            <p className={ROW_SUB}>See, manage or withdraw your consent</p>
          </div>
          <span aria-hidden className="text-nevo-navy">
            &rarr;
          </span>
        </Link>
      </div>

      <div className="mt-4 overflow-hidden rounded-[14px] bg-nevo-cream-elevated shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
        <button
          type="button"
          onClick={onSignOut}
          disabled={signingOut}
          className={`${ROW} w-full cursor-pointer text-left hover:bg-nevo-navy/[0.04] disabled:cursor-default`}
        >
          <div className="min-w-0">
            <p className={ROW_TITLE}>{signingOut ? "Signing out…" : "Sign out"}</p>
            <p className={ROW_SUB}>
              Signed in as {name}
              {school ? ` · ${school}` : ""}.
            </p>
          </div>
        </button>
      </div>

      {/* D23: the trigger is a quiet row at the foot of settings - never a
          floating button, never a nag. */}
      <button
        type="button"
        onClick={onFeedback}
        className="mt-6 cursor-pointer text-[14.5px] font-semibold text-nevo-navy hover:underline"
      >
        Share feedback
      </button>
    </>
  );
}
