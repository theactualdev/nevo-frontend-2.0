/**
 * A line with a capital first letter, ON RENDER ONLY - for the activity's
 * safety line (Lydia, 25 Oct: "The parser keeps the authored words exactly as
 * written"). The parser keeps the words after "Safety:", so a line can start
 * lowercase - "let an adult do the cutting". Only a lowercase letter at the
 * very start changes; a line that opens with a number or a quote is left as
 * it is, and nothing else in it is touched.
 */
export function asSentence(line: string): string {
  return line.replace(
    /^(\s*)(\p{Ll})/u,
    (_, space: string, first: string) => `${space}${first.toLocaleUpperCase()}`,
  );
}
