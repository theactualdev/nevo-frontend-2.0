/**
 * A text's paragraphs, as it was written.
 *
 * A body, a depth variant, a chunk or a transcript that leaves a blank line
 * between paragraphs was drawn as one block, because HTML folds the break
 * away. Frame 17 draws Expand as two paragraphs, and 17c's "No boundaries"
 * passage as paragraphs too, so each becomes its own `<p>`.
 *
 * Presentation only: the words are untouched and in their order, and nothing
 * numbers or counts the paragraphs. A text with no blank line in it comes
 * back whole, exactly as it was.
 */
export function paragraphsOf(text: string): string[] {
  const paragraphs = text
    .split(/\n[^\S\n]*\n\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  return paragraphs.length > 1 ? paragraphs : [text];
}

/**
 * The space between two of them: frame 17's Expand, and 17c's under reading
 * support (14px).
 */
export const PARAGRAPH_GAP = "mt-3.5";
