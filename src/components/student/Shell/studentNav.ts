import { BookOpen, Download, House, MessageCircle, Sprout } from "lucide-react";
import type { NavItem } from "@/components/shared";

/**
 * Student App primary navigation (Product Arch B.5) — sidebar + bottom nav.
 *
 * FIVE TABS, NOT SIX. `Nevo Bottom Nav` and `Nevo Sidebar Rail` both draw
 * Home, Lessons, Progress, Downloads and Connect, and nothing else. Profile is
 * reached from the child's own disc: the row at the foot of the sidebar, and
 * the top-bar avatar on a phone. A sixth "Profile" tab put two ways into the
 * same screen side by side, and squeezed every tab on a 375px bar.
 */
export const STUDENT_NAV: NavItem[] = [
  { label: "Home", href: "/student/dashboard", icon: House },
  { label: "Lessons", href: "/student/lessons", icon: BookOpen },
  // Growth, not scores — a sprout rather than a chart.
  { label: "Progress", href: "/student/progress", icon: Sprout },
  { label: "Downloads", href: "/student/downloads", icon: Download },
  { label: "Connect", href: "/student/connect", icon: MessageCircle },
];

/** Where the child's own disc leads, in the sidebar and the phone's top bar. */
export const STUDENT_PROFILE_HREF = "/student/profile";

/**
 * The fixture student, for the signed-out designed screens only - a live
 * session reads its name through `useDisplayName`, which prefers the
 * device-chosen name, then `users/me`. `subtitle` still has no live source
 * (users/me carries no year group) and ProfilingFlow's band selection reads
 * it - flagged.
 */
export const MOCK_STUDENT = {
  name: "Ada",
  subtitle: "Year 4",
  initials: "AK",
};
