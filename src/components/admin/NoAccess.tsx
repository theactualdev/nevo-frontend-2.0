"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { homeName } from "./Shell/adminNav";
import { useAdminHome } from "./Shell/useCanOpen";

/**
 * What a scope-gated screen shows when the admin is refused.
 *
 * A 403 is not a failure. The token was accepted as identity and the ACTION was
 * refused - a scope this admin does not hold - and the two want different words
 * and different affordances. Every admin screen used to render the same "We
 * couldn't load X ... try again in a moment" card for both, which is wrong twice
 * over: it blames the system for a permission decision, and it offers a retry
 * that cannot possibly succeed. An admin would sit there pressing it.
 *
 * Scope filtering is client-side only (`proxy.ts` checks role, never scope), so
 * a bookmarked or deep-linked route reaches a 403-able endpoint routinely -
 * this is a normal day-one path in any school with more than one admin, not an
 * edge case. Backend confirmed on 7 Sep that scopes ARE enforced: an admin token
 * without `oversight` gets 403 from `GET /api/v1/admin/team`.
 *
 * DESIGN LAW: no red. Being refused a screen is not an alarm, and the person
 * reading this has done nothing wrong.
 */

/** How a read failed, in the only two ways a screen needs to tell apart. */
export type FailureKind = "denied" | "failed";

/**
 * `denied` ONLY for a 403.
 *
 * Not 401: that is a dead token, and the API client already ends the session and
 * sends the admin to their door before any screen sees it. Anything else - a
 * 500, a network drop, the API proxy's cold-start 502 - is a failure the admin
 * can sensibly retry.
 */
export function failureKind(err: unknown): FailureKind {
  return err instanceof ApiError && err.status === 403 ? "denied" : "failed";
}

const CARD = "rounded-xl bg-nevo-cream-elevated shadow-[0_2px_8px_rgba(0,0,0,0.06)]";

export function NoAccess({
  /** What they tried to open, in their words: "the admin team". */
  what,
  className,
}: {
  what: string;
  className?: string;
}) {
  /*
   * THE WAY BACK. No retry - but a refusal used to be a dead end too, and the
   * audit asked for "return to Overview". Not the Overview for everyone: it is
   * this admin's own home (`adminHomeForScopes`), which is somewhere they can
   * open, and nothing at all when they are already on it.
   */
  const home = useAdminHome();
  const here = usePathname();
  const back = home && home !== here ? home : null;
  return (
    <div className={cn(CARD, "px-[26px] py-7", className)}>
      <h3 className="m-0 text-[17px] font-semibold text-nevo-near-black">
        You don&rsquo;t have access to {what}
      </h3>
      <p className="m-0 mt-2 max-w-[52ch] text-sm leading-[1.55] text-nevo-near-black/62">
        Your account doesn&rsquo;t include this part of the console. Whoever
        manages permissions for your school can change that.
      </p>
      {/* Deliberately NO retry. A refused scope does not become granted by
          asking again, and a button that cannot work is worse than none. */}
      {back ? (
        <Link
          href={back}
          className="mt-4 inline-block text-[13.5px] font-semibold text-nevo-navy hover:underline"
        >
          Go to {homeName(back) ?? "your console"}
        </Link>
      ) : null}
    </div>
  );
}
