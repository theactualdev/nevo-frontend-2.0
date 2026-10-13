/**
 * Connect mock data (teacher messaging). TODO(api): threads + messages come from
 * the backend; a thread extends to a parent once the teacher adds one.
 */

export type MessageStatus = "none" | "sending" | "delivered" | "failed";

export interface Message {
  id: string;
  who: "me" | "them";
  text: string;
  status: MessageStatus;
}

export interface Thread {
  id: string;
  name: string;
  initials: string;
  /** Avatar tint — navy or violet. */
  accent: "navy" | "violet";
  unread: boolean;
  /**
   * The list row's one-line preview, from the thread list's own
   * `latestPreview`. The list endpoint carries no message bodies, so without
   * this a live row has nothing to show until the thread is opened. Absent on
   * fixtures, which have their messages inline already.
   */
  preview?: string;
  messages: Message[];
  /**
   * Where a LIVE thread's history read stands. Absent until it is first
   * asked for. Without it, a conversation still loading and one that failed
   * both looked like an empty one - "your teacher has never written" - which
   * is a claim we cannot make. Fixtures carry none: their messages are inline.
   */
  history?: "loading" | "loaded" | "failed";
}

export const THREADS: Thread[] = [
  {
    id: "ms-okafor",
    name: "Ms Okafor",
    initials: "MO",
    accent: "navy",
    unread: false,
    messages: [
      { id: "1", who: "them", text: "Hi Ada! How did you find today's lesson?", status: "none" },
      { id: "2", who: "me", text: "The pizza pictures really helped", status: "none" },
      { id: "3", who: "them", text: "Lovely work on your fractions today!", status: "none" },
      { id: "4", who: "me", text: "Thank you! Can we do more tomorrow?", status: "delivered" },
      { id: "5", who: "me", text: "Here's the drawing I made", status: "failed" },
    ],
  },
  {
    id: "mr-bell",
    name: "Mr Bell",
    initials: "MB",
    accent: "violet",
    unread: true,
    messages: [
      { id: "1", who: "them", text: "Great reading in class today, Ada.", status: "none" },
      { id: "2", who: "them", text: "See you in class on Thursday.", status: "none" },
    ],
  },
];
