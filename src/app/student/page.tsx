import { redirect } from "next/navigation";

// `/student` is the console's root and had no page at all, so it fell through
// to the global not-found. Nothing in-app links to it - it is the address a
// child types or bookmarks, and the one a parent or teacher would write down.
// It is already declared a product surface in `PRIVATE_PATHS`, so it was
// treated as a real route everywhere except in having one.
//
// The same defect was fixed for `/teacher` on 5 Sep; this is that fix.
//
// Home is `/student/dashboard` per `STUDENT_NAV`, so the root sends there.
// Unconditional, because `proxy.ts` guards `/student` now: a signed-out
// visitor never reaches this and is sent to the PIN door with `?next=`. It is
// also the installed app's `start_url`, for that reason.
export default function StudentRootPage() {
  redirect("/student/dashboard");
}
