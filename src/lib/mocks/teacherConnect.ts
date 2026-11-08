import { studentSlug } from "./teacherStudents";
import { avatarLookOf, type AvatarLook } from "@/lib/profile/avatarLook";

/**
 * Connect mock data (C10 + C10b). Individual threads with students. Parents
 * were removed from the teacher side in the 25 Aug design drop - they have
 * their own portal now - so there is no parent sender, no include toggle and
 * no parent-contact state here. No class-wide broadcast in v1.
 *
 * Superseded for a signed-in teacher: Connect runs on `/api/messages/*`.
 * These back the designed screens and the failure fallback only.
 */

export type Sender = "student" | "teacher";

export interface Message {
  id: string;
  from: Sender;
  /** Shown above student bubbles; the teacher's own are unlabelled. */
  label?: string;
  text: string;
  /** The frame rewrites several messages shorter on tablet. */
  textTablet?: string;
  time?: string;
}

export interface Thread {
  id: string;
  studentName: string;
  /** The child's avatar, drawn beside their name (SCRUM-317). A sample here. */
  look: AvatarLook;
  className: string;
  /** List-row preview; "You: " marks a message the teacher sent. */
  preview: string;
  time: string;
  messages: Message[];
}

export const THREADS: Thread[] = [
  {
    id: studentSlug("Amara Okafor"),
    studentName: "Amara Okafor",
    look: avatarLookOf("star", "navy"),
    className: "JSS 2A",
    preview: "Well done for finishing, Amara.",
    time: "2m",
    messages: [
      {
        id: "m1",
        from: "student",
        label: "Amara",
        text: "Good afternoon ma. I finished the equations lesson but the last two questions were hard.",
        textTablet: "I finished but the last two questions were hard.",
      },
      {
        id: "m2",
        from: "teacher",
        text: "Well done for finishing, Amara. Let's look at those two together tomorrow morning - bring your working.",
        textTablet: "Let's look at those two together tomorrow - bring your working.",
      },
    ],
  },
  {
    id: studentSlug("Tunde Adeyemi"),
    studentName: "Tunde Adeyemi",
    look: avatarLookOf("square", "near_black"),
    className: "JSS 2A",
    preview: "Sorry ma, I wasn't feeling well that day.",
    time: "1h",
    messages: [
      {
        id: "m1",
        from: "teacher",
        text: "Morning Tunde - I noticed you didn't finish Tuesday's lesson. All well? No rush, just checking in.",
      },
      {
        id: "m2",
        from: "student",
        label: "Tunde",
        text: "Sorry ma, I wasn't feeling well that day. I'll finish it today.",
      },
    ],
  },
  // The frame gives these three only as list previews, so each opens on the
  // single message that preview quotes rather than an invented history.
  {
    id: studentSlug("Chisom Eze"),
    studentName: "Chisom Eze",
    look: avatarLookOf("triangle", "near_black"),
    className: "JSS 2A",
    preview: "You: Lovely work on the comprehension!",
    time: "3h",
    messages: [
      { id: "m1", from: "teacher", text: "Lovely work on the comprehension!" },
    ],
  },
  {
    id: studentSlug("Damilola Akinwande"),
    studentName: "Damilola Akinwande",
    look: avatarLookOf("hexagon", "navy"),
    className: "JSS 2A",
    preview: "Thank you ma, I understand now.",
    time: "Yest",
    messages: [
      {
        id: "m1",
        from: "student",
        label: "Damilola",
        text: "Thank you ma, I understand now.",
      },
    ],
  },
  {
    id: studentSlug("Fatima Musa"),
    studentName: "Fatima Musa",
    look: avatarLookOf("circle", "near_black"),
    className: "JSS 2A",
    preview: "See you in class tomorrow.",
    time: "Yest",
    messages: [
      {
        id: "m1",
        from: "student",
        label: "Fatima",
        text: "See you in class tomorrow.",
      },
    ],
  },
];

/** C10b's picker: every student the teacher can start a thread with. */
export interface ComposeStudent {
  name: string;
  className: string;
  /** The avatar the child chose, drawn beside their name (SCRUM-317). */
  look: AvatarLook;
  /** Present for real students; absent on the fixtures, which cannot be sent to. */
  studentId?: string;
}

/** The signed-out walkthrough's sample children, each with a sample look. */
export const COMPOSE_STUDENTS: ComposeStudent[] = [
  { name: "Amara Okafor", className: "JSS 2A", look: avatarLookOf("star", "navy") },
  { name: "Bello Ibrahim", className: "JSS 2B", look: avatarLookOf("square", "cream_elevated") },
  { name: "Chisom Eze", className: "JSS 2A", look: avatarLookOf("triangle", "near_black") },
  { name: "Damilola Akinwande", className: "JSS 2A", look: avatarLookOf("hexagon", "navy") },
  { name: "Emeka Nwachukwu", className: "JSS 2B", look: avatarLookOf("diamond", "cream_elevated") },
  { name: "Fatima Musa", className: "JSS 2A", look: avatarLookOf("circle", "near_black") },
  { name: "Kolade Fashola", className: "SSS 1 Sciences", look: avatarLookOf("triangle", "cream_elevated") },
  { name: "Ngozi Obi", className: "JSS 2B", look: avatarLookOf("star", "near_black") },
];

export const COMPOSE_CLASS_FILTERS = [
  "All classes",
  "JSS 2A",
  "JSS 2B",
  "SSS 1 Sciences",
];
