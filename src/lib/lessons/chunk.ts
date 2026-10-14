/**
 * How much of a segment arrives at once.
 *
 * Lifted out of `TextSegment` on 17 Sep so two callers can share one
 * definition. The renderer needs the parts; the player needs to know whether
 * there would be more than one BEFORE it offers the control, and an offer that
 * re-renders identical prose is the player telling a child it adapted when it
 * did not.
 *
 * THE PARTS ARE THE SERVER'S READING CHUNKS, AND NOTHING ELSE (B114, 13 Oct):
 * "The client must not split text. The server supplies stable readingChunks."
 * This used to cut a body with none into sentences, three parts at most -
 * backend's own B23 rule, from before it chunked anything. Those parts had no
 * ids, fell differently from one device to the next, and were the client
 * deciding where a passage breaks. A body with no chunks of its own is read
 * whole: "A lesson without chunks falls back to its body."
 */

/** Whether two texts carry the same words, whatever the spacing between. */
export function sameWords(a: string, b: string): boolean {
  const words = (s: string) => s.split(/\s+/).filter(Boolean).join(" ");
  return words(a) === words(b);
}

/**
 * The server's chunks, only if they are THIS body's words - else none.
 *
 * The chunks describe the standard body they were cut from. Asked of the text
 * actually on screen, so they are never drawn, never drive the parts and
 * never report a reading over different words: a reshape (Simplify, Expand),
 * or a session that shows a segment's simpler text in place of its standard
 * one. Those read whole.
 */
export function chunksForBody<T extends { text: string }>(
  body: string,
  chunks: readonly T[] | undefined,
): readonly T[] | undefined {
  if (!chunks || chunks.length === 0) return undefined;
  return sameWords(chunks.map((c) => c.text).join(" "), body)
    ? chunks
    : undefined;
}

/**
 * Would taking this body a part at a time actually change anything?
 *
 * The gate on offering Slower. A body the server sent as one chunk, or as
 * none, is one part, and offering a control that does nothing is worse than
 * not offering it: the child asked for less at a time, got the same screen,
 * and learns the control is a lie.
 */
export function isChunkable(
  body: string | undefined | null,
  chunks?: readonly { text: string }[],
): boolean {
  return Boolean(body) && (chunksForBody(body!, chunks)?.length ?? 0) > 1;
}
