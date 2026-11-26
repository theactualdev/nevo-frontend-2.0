import { helpSeekingLine } from "@/hooks/useStudentProfile";
import type { ConversationEvidence } from "@/lib/api/students";

/**
 * D08b'S RANKED TOPICS (SC-01), now the server floors each topic (S10, backend
 * v44, 25 Nov: a topic asked about fewer than the minimum is dropped from
 * `categories`). So every topic it sends is one it says may be shown, and the
 * device keeps no floor of its own - it only puts them in order and names
 * them in the server's words.
 *
 * NAMES ONLY. The frame draws a count and a bar beside each topic; neither is
 * drawn, so nothing here reads as a score (the hub's line, 25 Nov). How often
 * orders the list and is never shown.
 *
 * A key the server sends no words for is a code (`lesson_help`), never
 * printed - the same rule the line keeps (T142).
 */
export function helpTopics(ev: ConversationEvidence | null): string[] {
  if (!ev || ev.privacy !== "aggregate_only") return [];
  return Object.entries(ev.categories ?? {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => ev.categoryLabels?.[key]?.trim() ?? "")
    .filter(Boolean);
}

/**
 * The sentence over the list, in D08b's words: "Amara asked Nevo for help 14
 * times this fortnight, most often about these topics." It is the ratified
 * line's how-often with the frame's ending in place of "mostly about {one}".
 * Empty when the line itself is (nothing asked, or withheld).
 */
export function helpTopicsLead(ev: ConversationEvidence | null): string {
  const line = helpSeekingLine(ev);
  if (!line) return "";
  const howOften = line.replace(/\.$/, "").replace(/, mostly about .*$/, "");
  return `${howOften}, most often about these topics.`;
}
