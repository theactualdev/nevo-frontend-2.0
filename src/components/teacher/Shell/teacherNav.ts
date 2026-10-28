/**
 * Teacher console navigation model (flow index; `Nevo Teacher Sidebar`).
 * Five tabs, in the frame's order; hrefs map onto the scaffolded routes.
 */

export interface TeacherNavItem {
  /** Frame label - also the sidebar `active` key. */
  name: "Home" | "Classes" | "Library" | "Insights" | "Connect" | "Learning Support";
  href: string;
}

export const TEACHER_NAV: TeacherNavItem[] = [
  { name: "Home", href: "/teacher/dashboard" },
  { name: "Classes", href: "/teacher/classes" },
  { name: "Library", href: "/teacher/lessons" },
  { name: "Insights", href: "/teacher/insights" },
  { name: "Connect", href: "/teacher/connect" },
];

/**
 * C20 (design, 12 Oct): a sixth item for a teacher who holds Learning
 * Support, LAST after Connect "so the core five never move". Nobody else gets
 * it - and not a greyed one either.
 */
export const LEARNING_SUPPORT_NAV: TeacherNavItem = {
  name: "Learning Support",
  href: "/teacher/learning-support",
};

/** The tabs this teacher sees, in the rail's order. */
export function teacherNav(holdsLearningSupport: boolean): TeacherNavItem[] {
  return holdsLearningSupport ? [...TEACHER_NAV, LEARNING_SUPPORT_NAV] : TEACHER_NAV;
}

/**
 * The C-screen docs' teacher persona, for the signed-out preview of the
 * frames only. A live session reads its identity from `useCurrentUser`.
 */
export const MOCK_TEACHER = {
  name: "Ms. Adeyemi",
  role: "Teacher",
  initials: "MA",
  /** Ask Nevo's header carries the school, hardcoded in the frame. */
  school: "Brightgate Academy",
};
