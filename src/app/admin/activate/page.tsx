import type { Metadata } from "next";
import { ActivationView } from "@/components/admin/Roster/ActivationView";

export const metadata: Metadata = {
  title: "Getting to active - Nevo",
};

/** D24 OB-03 headcount and cost, OB-04 payment, OB-05 activation. */
export default function AdminActivatePage() {
  return <ActivationView />;
}
