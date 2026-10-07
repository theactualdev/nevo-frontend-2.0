import type { Metadata } from "next";
import { SchoolTransformationView } from "@/components/admin/Reports/SchoolTransformationView";

export const metadata: Metadata = {
  title: "School transformation - Nevo",
};

// D26 School Transformation (SCRUM-163), under Reports. School-wide only - no
// child is named and no per-learner figure exists on this page.
export default function SchoolTransformationPage() {
  return <SchoolTransformationView />;
}
