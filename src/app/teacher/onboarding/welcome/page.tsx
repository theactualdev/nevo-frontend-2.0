import type { Metadata } from "next";
import { TeacherWelcome } from "@/components/teacher/Onboarding/TeacherWelcome";

export const metadata: Metadata = {
  title: "Welcome - Nevo",
};

/**
 * C01's steps after the password: the join confirmation, the light profile,
 * and a brief hold into the console. The activation screen sends a teacher
 * here once their account is active and signed in.
 */
export default function TeacherWelcomePage() {
  return <TeacherWelcome />;
}
