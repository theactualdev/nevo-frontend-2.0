/**
 * How much of a segment arrives at once.
 *
 * Lifted out of `TextSegment` on 17 Sep so two callers can share one
 * definition. The renderer needs the parts; the player needs to know whether
 * there would be more than one BEFORE it offers the control, and an offer that
 * re-renders identical prose is the player telling a child it adapted when it
 * did not.
 *
 * This is presentation, not content. It regroups sentences the lesson already
 * has and invents nothing, which is why a child can reach it on live parsed
 * content where no authored reshape exists.
 */

/** Split into sentences, grouped into at most three short parts. */
export function chunkBody(body: string): string[] {
  const sentences = body.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length < 2) return [body];
  const parts = Math.min(3, sentences.length);
  const per = Math.ceil(sentences.length / parts);
  const out: string[] = [];
  for (let i = 0; i < sentences.length; i += per)
    out.push(sentences.slice(i, i + per).join(" "));
  return out;
}

/**
 * The parts a body arrives in, a part at a time.
 *
 * THE SERVER'S READING CHUNKS WIN WHERE IT SENT THEM (SCRUM-234). Where the
 * breaks fall is the backend's now (SCRUM-236), so the on-device split above
 * - backend's own B23 rule, from before it chunked anything - is only for a
 * body that came with none. `chunks` must describe this `body`: the server's
 * chunks are of the default body, never of a reshape.
 */
export function bodyParts(
  body: string,
  chunks?: readonly { text: string }[],
): string[] {
  return chunks && chunks.length > 0
    ? chunks.map((c) => c.text)
    : chunkBody(body);
}

/**
 * Would chunking this body actually change anything?
 *
 * The gate on offering Slower. A one-sentence segment chunks to itself, and
 * offering a control that does nothing is worse than not offering it: the
 * child asked for less at a time, got the same screen, and learns the control
 * is a lie. The same holds for a body the server sent as ONE chunk.
 */
export function isChunkable(
  body: string | undefined | null,
  chunks?: readonly { text: string }[],
): boolean {
  return Boolean(body) && bodyParts(body!, chunks).length > 1;
}
