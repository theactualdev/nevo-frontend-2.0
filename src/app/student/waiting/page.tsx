import type { Metadata } from "next";
import { WaitingOnConsent } from "@/components/student/Entry/WaitingOnConsent";

export const metadata: Metadata = {
  title: "Welcome - Nevo",
};

/**
 * 00d, reachable by address as well as by hand-off, because a child who is
 * held gets sent here from four different doors.
 *
 * **THE ROUTE SAYS NOTHING ABOUT WHY**, and neither does the title. A disputed
 * date of birth and a consent nobody has recorded land on the same screen with
 * the same words - design, 23 Sep - and the reason a child is not told is that
 * telling them makes them the arbiter between their parent and their school.
 * A URL is something a child can read.
 */
export default function StudentWaitingPage() {
  return <WaitingOnConsent />;
}
