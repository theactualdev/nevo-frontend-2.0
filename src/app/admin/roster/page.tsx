import type { Metadata } from "next";
import { RosterImportView } from "@/components/admin/Roster/RosterImportView";

export const metadata: Metadata = {
  title: "Add your roster - Nevo",
};

/**
 * D24 OB-01 / OB-02, at their own route.
 *
 * NOT part of `/admin/onboarding`, which is the PRE-AUTH wizard that creates
 * the school. This is a signed-in console screen and the frame says it is a
 * permanent one: *"The same screen a school returns to later to add students
 * mid-term."*
 */
export default function AdminRosterPage() {
  return <RosterImportView />;
}
