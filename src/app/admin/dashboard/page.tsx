import type { Metadata } from "next";
import { AdminDashboard } from "@/components/admin/Overview/AdminDashboard";

export const metadata: Metadata = {
  title: "Overview - Nevo",
};

// D04 Overview Dashboard - the general-oversight admin's landing. A school that
// is not active yet gets D24 OB-00 in its place; `AdminDashboard` decides.
export default function AdminOverviewPage() {
  return <AdminDashboard />;
}
