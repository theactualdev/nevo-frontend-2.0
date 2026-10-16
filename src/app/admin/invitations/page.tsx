import type { Metadata } from "next";
import { InvitationsView } from "@/components/admin/Invitations/InvitationsView";

export const metadata: Metadata = {
  title: "Invitations - Nevo",
};

// D19 School Invitations (SCRUM-79) - the single home for inviting teachers.
// D6 defers here. Children are not invited (L2, 14 Oct): they are added on
// Students.
export default function AdminInvitationsPage() {
  return <InvitationsView />;
}
