/** "4", "4 and 7", "3 to 5, 9, 11 and 12" - the server's pages, in its order. */
export function pageList(pages: number[]): string {
  /*
   * A run of three or more pages in a row is said as a range: "Pages 1 to
   * 27", not twenty-seven numbers (upload test, 15 Oct). Only runs the server
   * sent in order are joined - these are its page numbers, not ours to sort.
   */
  const items: string[] = [];
  for (let i = 0; i < pages.length; ) {
    let j = i;
    while (j + 1 < pages.length && pages[j + 1] === pages[j] + 1) j += 1;
    if (j - i >= 2) {
      items.push(`${pages[i]} to ${pages[j]}`);
    } else {
      for (let k = i; k <= j; k += 1) items.push(String(pages[k]));
    }
    i = j + 1;
  }
  return items.length > 1
    ? `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`
    : (items[0] ?? "");
}
