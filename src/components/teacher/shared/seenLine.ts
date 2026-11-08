/**
 * C08's "A flag Learning Support has acknowledged": plain text under the flag,
 * "Adaora from learning support saw this on 12 October." Where no name is
 * sent, "Learning support saw this on 12 October." The name is the server's
 * as sent (their chosen name, else their full name). With no date we can
 * read, the line says only that it was seen.
 *
 * C20 draws the same line under a seen concern on the Learning Support list
 * ("exactly as settled in C08"), so both screens take it from here.
 */
export function seenLine(seen: { by: string | null; on: string | null }): string {
  const who = seen.by ? `${seen.by} from learning support` : "Learning support";
  const at = seen.on ? new Date(seen.on) : null;
  return at && !Number.isNaN(at.getTime())
    ? `${who} saw this on ${at.toLocaleDateString("en-GB", { day: "numeric", month: "long" })}.`
    : `${who} has seen this.`;
}
