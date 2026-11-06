/**
 * Notifications mock (C13). Time-relevant events, never disruptive - each
 * line is one brief sentence, reverse-chronological, and unread carries a
 * soft tint rather than bold shouting.
 *
 * Superseded for a signed-in teacher: the bell runs on `/api/notifications`.
 * These back the signed-out designed panel only - a failed feed shows nothing
 * rather than these, because each line names a real child.
 */

export type NotificationKind =
  | "flag"
  | "message"
  | "done"
  | "support"
  | "klass"
  /** A type the bell has no mark for: a plain dot, claiming nothing. */
  | "other";

export interface TeacherNotification {
  id: string;
  kind: NotificationKind;
  text: string;
  /** The sentence under the label. Empty when there is only a label. */
  detail?: string;
  /** Where tapping the row goes. Absent when the row has no destination. */
  href?: string;
  time: string;
  unread: boolean;
}

export const TEACHER_NOTIFICATIONS: TeacherNotification[] = [
  {
    id: "n1",
    kind: "flag",
    text: "Tunde stopped partway through a lesson again - that's three this week.",
    time: "10 min ago",
    unread: true,
  },
  {
    id: "n2",
    kind: "message",
    text: "Mrs Okonkwo replied in Amara's thread.",
    time: "1 hour ago",
    unread: true,
  },
  {
    id: "n3",
    kind: "done",
    text: "JSS 1 Gold have all finished Place Value to 1000.",
    time: "2 hours ago",
    unread: false,
  },
  {
    id: "n4",
    kind: "support",
    text: "Your note about Amara reached Learning Support.",
    time: "Yesterday",
    unread: false,
  },
  {
    id: "n5",
    kind: "klass",
    text: "JSS 3 Red was added to your classes.",
    time: "Yesterday",
    unread: false,
  },
  {
    id: "n6",
    kind: "done",
    text: "Grace finished the Fractions extension task.",
    time: "2 days ago",
    unread: false,
  },
];
