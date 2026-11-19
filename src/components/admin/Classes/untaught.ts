/**
 * D05's "No teacher yet · {subjects nobody teaches} · Assign" row on class
 * detail (backlog 27): the class's subjects that no current assignment
 * teaches, in the class's own order and spelling.
 *
 * NULL WHEN IT CAN'T BE KNOWN, and then the row is left out - never a guess.
 * Two cases:
 *  - An assignment carries no subject (older assignments, before 8 Oct): it
 *    may teach any of them.
 *  - An assignment's subject matches none of the class's own names: a spelling
 *    the class doesn't hold, so which subject it covers isn't certain.
 * An untrue "No teacher yet" over a subject someone teaches would be worse
 * than no row (Lydia, 4 Nov).
 *
 * Nothing here is a score or a threshold: it is set difference over two lists
 * the server sent.
 */
export function untaughtSubjects(
  classSubjects: readonly string[],
  assignments: readonly { subject?: string | null }[],
): string[] | null {
  const taught = new Set<string>();
  const own = new Set(classSubjects.map(fold));
  for (const a of assignments) {
    const s = a.subject?.trim();
    if (!s) return null;
    if (!own.has(fold(s))) return null;
    taught.add(fold(s));
  }
  return classSubjects.filter((s) => !taught.has(fold(s)));
}

function fold(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}
