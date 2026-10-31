import { api } from "./client";

/**
 * The safeguarding list (SCRUM-260, D29): what Nevo's safety check recorded
 * when a child's Ask Nevo question tripped it.
 *
 * AN ENTRY IS THE CHILD, WHEN, AND THE CATEGORY - AND THAT IS THE WHOLE OF IT
 * (Lydia, 20 Oct): "Nobody sees the chat questions or the conversations." The
 * server never sends the words, and nothing here has a field, a link or a
 * space for them.
 *
 * WHO CAN READ IT: Learning Support holders, school-wide. The server gates
 * both routes on the role itself since fc058d4 (21 Oct), and a refusal is
 * shown as it stands.
 *
 * THE NAMES ARE THE SERVER'S (fc058d4): `studentName`, and `acknowledgedByName`
 * once someone has recorded it as seen. The list used to look both up in other
 * reads; it reads them off the entry now (Olayinka, via the Hub, 28 Oct).
 */

export interface SafetyEvent {
  id: string;
  /** Null when the check ran on something no child sent - a teacher's lesson. */
  studentId: string | null;
  phase: string;
  /** "block" or "safeguard" on this list; the server leaves "allow" out. */
  action: string;
  /** The safety check's own category values - see `categoryLabel`. */
  categories: string[];
  policyVersion: string;
  createdAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  /** The child's name, as the school has it. */
  studentName?: string | null;
  /** Who recorded it as seen. Null until someone has. */
  acknowledgedByName?: string | null;
}

export const safetyApi = {
  /**
   * GET /api/v1/safety/events. `pending_only` defaults to true on the server;
   * the list asks for everything, because an acknowledged entry stays on it
   * (D29) showing who saw it and when. Newest first; `before` pages back.
   */
  events: (options: { limit?: number; before?: string } = {}) =>
    api.get<SafetyEvent[]>("/api/v1/safety/events", {
      params: { pending_only: false, limit: options.limit ?? 100, before: options.before },
    }),

  /** POST /api/v1/safety/events/{id}/acknowledge - records that it was seen. Never resolves it. */
  acknowledge: (eventId: string) =>
    api.post<SafetyEvent>(`/api/v1/safety/events/${encodeURIComponent(eventId)}/acknowledge`),
};

/**
 * An entry is about a child. The server's list also carries checks run on a
 * teacher's lesson material, which name no child and are not disclosures, so
 * they are not entries here (asked of the backend to scope the route).
 */
export function aboutAChild(event: SafetyEvent): event is SafetyEvent & { studentId: string } {
  return Boolean(event.studentId);
}

/**
 * The safety check's eight categories (`child-safety-2026-10-v1`), in plain
 * words. PROPOSED, NOT YET RULED: D29 marks its labels as placeholders until
 * the backend values are wired in, and copy goes through Lydia. A value the
 * policy adds later is shown in its own words rather than dropped.
 */
const CATEGORY_LABEL: Record<string, string> = {
  sexual_exploitation: "Sexual exploitation",
  sexual_content: "Sexual content",
  self_harm: "Self-harm",
  violence: "Violence",
  hate_abuse: "Hate or abuse",
  dangerous_instructions: "Dangerous instructions",
  grooming: "Grooming",
  privacy_abuse: "Misuse of personal information",
};

export function categoryLabel(category: string): string {
  const known = CATEGORY_LABEL[category];
  if (known) return known;
  const words = category.replace(/[_-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : category;
}
