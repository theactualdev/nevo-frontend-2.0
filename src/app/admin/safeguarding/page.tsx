import type { Metadata } from "next";
import { SafeguardingView } from "@/components/admin/Safeguarding/SafeguardingView";

export const metadata: Metadata = {
  title: "Safeguarding - Nevo",
};

// D29 Safeguarding (SCRUM-260) - Learning Support holders only.
export default function AdminSafeguardingPage() {
  return <SafeguardingView />;
}
