import type { Metadata } from "next";
import { ConsentWithdrawn } from "@/components/student/Entry/ConsentWithdrawn";

// The same tab title as 00d: the tab says nothing about why either.
export const metadata: Metadata = {
  title: "Welcome - Nevo",
};

/**
 * 00e, reachable by address as well as by hand-off, because a child whose
 * consent was withdrawn is sent here from a refused request and from the
 * sign-in doors (D117).
 *
 * **THE ROUTE SAYS NOTHING ABOUT WHY**, for the reason 00d's does not: a URL
 * is something a child can read, and 00e "never uses the word consent, never
 * mentions a parent, never mentions withdrawal".
 */
export default function StudentUnavailablePage() {
  return <ConsentWithdrawn />;
}
