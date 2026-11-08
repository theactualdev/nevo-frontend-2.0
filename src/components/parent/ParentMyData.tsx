"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { TryAgain } from "./TryAgain";
import { ApiError, apiErrorCode } from "@/lib/api/client";
import {
  parentApi,
  type ChildConsents,
  type ParentChild,
  type ParentRightType,
} from "@/lib/api/parent";
import { ParentDataManagement, type DataSubject } from "./ParentDataManagement";

/**
 * D01c for a SIGNED-IN parent (Lydia, 14 Oct, L6): "a signed-in parent
 * currently has no route from their home to the data page. That is a product
 * gap regardless of what the page ends up saying. Add the route now."
 *
 * The page itself is the same component, word for word - who answers and in
 * what time is counsel's, and the promise is held exactly as counsel last
 * worded it. What differs is only where its facts come from and where its
 * three actions go: the signed-in parent's own routes
 * (`/parents/me/consents`, `.../withdraw`, `/objections`, `/data-requests`),
 * per child, instead of a tokenised link.
 *
 * Which child: `?child=` from the home's link, or the first linked child.
 */

type Read =
  | { kind: "loading" }
  | { kind: "failed" }
  | { kind: "none" }
  | { kind: "ready"; child: ParentChild; consents: ChildConsents | null };

/** The page's facts, from a signed-in parent's reads. */
export function subjectFor(child: ParentChild, consents: ChildConsents | null): DataSubject {
  const held = consents?.consents ?? [];
  // Suspended on arrival, as on the link: a consent withdrawn that stops access.
  const withdrawn = held.find((c) => c.status === "withdrawn" && c.stopsAccess);
  const withdrawnAll = held.filter((c) => c.status === "withdrawn");
  return {
    studentFirstName: child.firstName?.trim() || consents?.studentFirstName?.trim() || "your child",
    schoolName: child.schoolName,
    schoolPhone: null,
    schoolEmail: null,
    parentName: null,
    status: withdrawn ? "withdrawn" : "confirmed",
    decidedAt: withdrawn?.decidedAt ?? null,
    // SCRUM-306: withdrawing takes every consent held, and the server refuses
    // it if any one isn't this parent's. So the control is theirs only when
    // every one is - the server's `canWithdraw`, never a rule of our own.
    // None held: nothing the server has said yes to, so no control.
    canWithdraw: held.length > 0 && held.every((c) => c.canWithdraw === true),
    // The restore route asks the same question of the withdrawn ones.
    canRestore: withdrawnAll.length > 0 && withdrawnAll.every((c) => c.canWithdraw === true),
  };
}

export function ParentMyData() {
  const params = useSearchParams();
  const wanted = params.get("child");
  const [read, setRead] = useState<Read>({ kind: "loading" });
  /** Bumped by Try again, to read the children and consents again. */
  const [attempt, setAttempt] = useState(0);
  /** The server's words after a restore, shown once on the page read again. */
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([parentApi.myChildren(), parentApi.myConsents()])
      .then(([children, consents]) => {
        if (!alive) return;
        const child = children.find((c) => c.studentId === wanted) ?? children[0];
        if (!child) {
          setRead({ kind: "none" });
          return;
        }
        setRead({
          kind: "ready",
          child,
          consents: consents.find((c) => c.studentId === child.studentId) ?? null,
        });
      })
      .catch(() => {
        if (alive) setRead({ kind: "failed" });
      });
    return () => {
      alive = false;
    };
  }, [wanted, attempt]);

  if (read.kind === "loading") {
    return <main className="min-h-dvh bg-nevo-cream" aria-busy="true" />;
  }
  if (read.kind !== "ready") {
    return (
      <main className="min-h-dvh bg-nevo-cream px-5 py-8 text-nevo-near-black">
        <div className="mx-auto w-full max-w-[560px] rounded-[14px] bg-nevo-cream-elevated px-[22px] py-5 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
          <h1 className="m-0 text-[18px] font-semibold">
            {read.kind === "none" ? "Your account isn’t linked to a child yet" : "We couldn’t load this just now"}
          </h1>
          <p className="mt-1.5 text-[14.5px] leading-[1.55] text-nevo-near-black/68">
            {read.kind === "none"
              ? "Your child’s school can link your account to them."
              : "Nothing has changed. Try again in a moment."}
          </p>
          {read.kind === "failed" ? (
            <TryAgain
              onClick={() => {
                setRead({ kind: "loading" });
                setAttempt((a) => a + 1);
              }}
            />
          ) : null}
          {/* The way home this screen didn't have (backlog 59). */}
          <Link
            href="/parent-portal"
            className="mt-4 block w-fit cursor-pointer text-[14.5px] font-semibold text-nevo-navy hover:underline"
          >
            Back to home
          </Link>
        </div>
      </main>
    );
  }

  const studentId = read.child.studentId;
  const act = async (right: ParentRightType, reason?: string) => {
    const note = reason?.trim() || undefined;
    const res =
      right === "withdraw_consent"
        ? await parentApi.myWithdraw(studentId, note)
        : right === "object"
          ? await parentApi.myObjection(studentId, note)
          : await parentApi.myDataRequest(studentId);
    // The signed-in routes store the note with the request, and answer only
    // once it is stored - so a note that was sent was kept.
    return { requestId: res.requestId, reasonRecorded: Boolean(note) };
  };

  /*
   * The way back (SCRUM-321): the parent's own, from their account. The page
   * is then read again from the server, so what it shows is what is now true
   * - not a state this page decided.
   */
  const restore = async () => {
    try {
      const res = await parentApi.myRestore(studentId);
      setNotice(res.effect);
    } catch (e) {
      // Nothing withdrawn to give back: the page was out of date. Read it again.
      if (!(e instanceof ApiError && apiErrorCode(e.detail) === "nothing_to_restore")) throw e;
    }
    setRead({ kind: "loading" });
    setAttempt((a) => a + 1);
  };

  return (
    <ParentDataManagement
      invitation={subjectFor(read.child, read.consents)}
      act={act}
      restore={restore}
      notice={notice}
    />
  );
}
