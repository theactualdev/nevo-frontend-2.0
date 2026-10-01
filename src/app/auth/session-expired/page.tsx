import type { Metadata } from "next";
import { SessionEndScreen } from "@/components/student/Auth/SessionEndScreen";
import { AccountOnPauseScreen } from "@/components/student/Auth/AccountOnPauseScreen";
import { safeNextPath } from "@/lib/auth/nextPath";
import { sessionEndReason } from "@/lib/auth/sessionEndReason";

type Params = Promise<{ reason?: string; next?: string }>;

/**
 * The tab says what the screen says. It read "Session expired" over the
 * paused screen too, which contradicts the ruling the screen itself carries:
 * a pause is an account state, not a session that ended.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Params;
}): Promise<Metadata> {
  const { reason } = await searchParams;
  return {
    title:
      sessionEndReason(reason) === "paused"
        ? "Account on pause - Nevo"
        : "Session expired - Nevo",
  };
}

/**
 * The child's session-end door (board 28).
 *
 * The reason arrives as `?reason=`, put there by `sessionExpiredDoor` (#422)
 * because the redirect is a full page load and the session it came from has
 * already been cleared - there is nowhere else left to read it from.
 *
 * Until this read it, every one of the five codes rendered "You've been away
 * for a while", which is a statement about the child's behaviour and untrue
 * for four of them. A child whose account a school closed mid-lesson was told
 * they had been idle, and tried again.
 *
 * `sessionEndReason` is shared with the console rather than re-derived, so the
 * ruling about which codes collapse into which screen lives in one place and
 * an unknown code under-claims here exactly as it does there.
 *
 * `?next=` is where the child was, and the way back in carries it - IA 31's
 * "lesson position preserved". Untrusted like every URL value, so it goes
 * through `safeNextPath` first.
 *
 * A PAUSED CHILD MOSTLY NO LONGER COMES HERE. Inside the student app the pause
 * is shown over the lesson in place (28b, `AccountPauseHost`); this branch is
 * what is left for a child whose token was spent somewhere nothing could draw
 * that card.
 *
 * Next.js 16: `searchParams` is a Promise and must be awaited.
 */
export default async function SessionExpiredPage({
  searchParams,
}: {
  searchParams: Params;
}) {
  const { reason, next } = await searchParams;
  const ended = sessionEndReason(reason);

  // An account state, not a session one, and the child has their own frame for
  // it. It offers no retry, because retrying is the one thing that cannot work.
  if (ended === "paused") return <AccountOnPauseScreen />;

  return <SessionEndScreen variant={ended} next={safeNextPath(next)} />;
}
