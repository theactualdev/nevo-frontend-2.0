/**
 * The last-active line on an Admin Team row, in SCRUM-39's neutral words:
 * "Active states read neutrally ('Active today', '2 days ago') ... No green,
 * no red, no 'inactive' shaming."
 *
 * Calendar days, not 24-hour blocks: an admin seen at 23:50 last night was
 * active yesterday, not "today". Null when the server sent no timestamp, or
 * one we cannot read - then the row says nothing rather than "never".
 */
export function activeLine(iso: string | null | undefined, now: number): string | null {
  if (!iso) return null;
  const seen = new Date(iso);
  if (Number.isNaN(seen.getTime())) return null;
  const day = (t: Date) => new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  const days = Math.round((day(new Date(now)) - day(seen)) / 864e5);
  if (days <= 0) return "Active today";
  if (days === 1) return "Active yesterday";
  return `${days} days ago`;
}

/**
 * D06's "Last active" card: "Today" over the time, or how many days ago over
 * the date. Null when there is no timestamp - then the card is not drawn.
 */
export function lastActiveCard(
  iso: string | null | undefined,
  now: number,
): { value: string; sub: string } | null {
  if (!iso) return null;
  const seen = new Date(iso);
  if (Number.isNaN(seen.getTime())) return null;
  const day = (t: Date) => new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  const days = Math.round((day(new Date(now)) - day(seen)) / 864e5);
  const time = seen.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true });
  if (days <= 0) return { value: "Today", sub: time };
  if (days === 1) return { value: "Yesterday", sub: time };
  return {
    value: `${days} days ago`,
    sub: seen.toLocaleDateString("en-GB", { day: "numeric", month: "long" }),
  };
}
