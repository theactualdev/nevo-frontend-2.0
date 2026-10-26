/**
 * My Classes mock data (C05 / `Nevo Teacher Classes` frame). JSS 2A carries
 * the frame's exact roster; the other classes carry calm representative
 * rosters (the frame renders subsets, never all N students).
 * Superseded for a signed-in teacher: classes come from
 * `/api/v1/teachers/me/classes` and rosters from
 * `/api/v1/classes/{id}/students`. The observations, lessons and summaries
 * here have no endpoint, which is why a live class renders its own screen
 * rather than borrowing one of these.
 */

export type StudentStatus = "ok" | "glance" | "flag";

export interface RosterStudent {
  name: string;
  status: StudentStatus;
  /** Sudden change - navy drop glyph beside the name. */
  isSudden: boolean;
}

export interface TeacherClass {
  id: string;
  name: string;
  subjects: string;
  count: number;
  /** Six-character code students type, or scan via the C12 QR. */
  joinCode: string;
  /** List-card summary line + dot tone. */
  summary: string;
  summaryTone: "glance" | "ok";
  roster: RosterStudent[];
  lessons: { title: string; meta: string; status: string; href: string }[];
  activitySummary: string;
}

const s = (
  name: string,
  status: StudentStatus = "ok",
  isSudden = false,
): RosterStudent => ({ name, status, isSudden });

export const TEACHER_CLASSES: TeacherClass[] = [
  {
    id: "jss-2a",
    name: "JSS 2A",
    subjects: "Mathematics · English",
    count: 28,
    joinCode: "MAP4KZ",
    summary: "2 worth a glance, 1 flagged",
    summaryTone: "glance",
    roster: [
      s("Adaeze Ifeanyi"),
      s("Aisha Abdullahi"),
      s("Amara Okafor", "glance"),
      s("Bello Ibrahim"),
      s("Chisom Eze", "glance"),
      s("Chukwuemeka Nwosu"),
      s("Damilola Akinwande"),
      s("Emeka Nwachukwu"),
      s("Fatima Musa"),
      s("Kolade Fashola"),
      s("Ngozi Obi"),
      s("Sade Olawale"),
      s("Taiwo Ogundimu"),
      s("Tobi Adeleke"),
      s("Tunde Adeyemi", "flag", true),
      s("Zainab Yusuf"),
    ],
    lessons: [
      { title: "Solving Linear Equations", meta: "Assigned Mon · Mathematics", status: "18 of 28 done", href: "/teacher/lessons/solving-linear-equations" },
      { title: "Simplifying Fractions", meta: "Assigned last week · Mathematics", status: "26 of 28 done", href: "/teacher/lessons/simplifying-fractions" },
      { title: "Things Fall Apart: Chapters 1-3", meta: "Assigned last week · English", status: "24 of 28 done", href: "/teacher/lessons/things-fall-apart" },
    ],
    activitySummary:
      "The class worked through three lessons this week. Most moved at a steady pace; the one place several slowed was turning algebraic fractions into a common denominator. Worth a few minutes together next session.",
  },
  {
    id: "jss-2b",
    name: "JSS 2B",
    subjects: "Mathematics · English",
    count: 30,
    joinCode: "TQ7RN2",
    summary: "Everyone on track",
    summaryTone: "ok",
    roster: [
      s("Adanna Okoye"),
      s("Bashir Lawal"),
      s("Chiamaka Udo"),
      s("Efe Oghenekaro"),
      s("Halima Sani"),
      s("Ikenna Eze"),
      s("Lola Adebayo"),
      s("Nnamdi Okafor"),
      s("Rukayat Balogun"),
      s("Segun Adewale"),
      s("Uche Nnaji"),
      s("Yemi Oladipo"),
    ],
    lessons: [
      { title: "Reading Comprehension: Things Fall Apart", meta: "Assigned Mon · English", status: "25 of 30 done", href: "/teacher/lessons/things-fall-apart" },
      { title: "Simplifying Fractions", meta: "Assigned last week · Mathematics", status: "28 of 30 done", href: "/teacher/lessons/simplifying-fractions" },
    ],
    activitySummary:
      "A steady week - both lessons moved along without anything worth flagging. Completion is high and nobody's pace stood out.",
  },
  {
    id: "sss-1-sciences",
    name: "SSS 1 Sciences",
    subjects: "Biology · Chemistry · Physics",
    count: 31,
    joinCode: "VH3KD9",
    summary: "Everyone on track",
    summaryTone: "ok",
    roster: [
      s("Abiola Ogunleye"),
      s("Chidera Anyanwu"),
      s("Dabira Oyelaran"),
      s("Emmanuella Bassey"),
      s("Femi Alade"),
      s("Ifeoma Chukwu"),
      s("Kamsi Obiora"),
      s("Micheal Etim"),
      s("Nafisa Garba"),
      s("Olamide Shittu"),
      s("Tari Briggs"),
      s("Zara Mohammed"),
    ],
    lessons: [
      { title: "Cell Structure & Function", meta: "Assigned last week · Biology", status: "22 of 31 done", href: "/teacher/lessons/cell-structure" },
    ],
    activitySummary:
      "One lesson in flight and moving well. Nothing slowed the group; a handful are still to finish and all are within their usual pace.",
  },
];

export function getTeacherClass(id: string): TeacherClass | null {
  return TEACHER_CLASSES.find((c) => c.id === id) ?? null;
}

export const SCHOOL_LINE = "Brightgate Academy · Second term";

/** Status presentation (frame): label, label colour, dot. */
export const STATUS_LABEL: Record<StudentStatus, string> = {
  ok: "On track",
  glance: "Worth a glance",
  flag: "Flagged",
};
