import type { Metadata } from "next";
import { LearningSupportView } from "@/components/teacher/LearningSupport/LearningSupportView";

export const metadata: Metadata = {
  title: "Learning Support - Nevo",
};

// C20 (design, 12 Oct): the Learning Support item's page, for a teacher who
// holds the role. Fetched client-side, like every teacher read.
export default function TeacherLearningSupportPage() {
  return <LearningSupportView />;
}
