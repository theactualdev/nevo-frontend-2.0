import { describe, expect, it } from "vitest";
import { readReviewBack, reviewSessionHref } from "./reviewHref";

/**
 * A review opened from Subject Detail goes back there when it ends (Olayinka,
 * 14 Oct). The address arrives in the URL, so it is read as untrusted: only
 * Subject Detail's own is honoured, and anything else leaves the review going
 * Home, as it always has.
 */

describe("reviewSessionHref", () => {
  it("carries the concept and where the review was opened from", () => {
    const href = reviewSessionHref("lesson-42", "c-frac", "/student/progress/maths");
    const url = new URL(href, "http://x");

    expect(url.pathname).toBe("/student/lessons/lesson-42/review-session");
    expect(url.searchParams.get("concept")).toBe("c-frac");
    expect(url.searchParams.get("back")).toBe("/student/progress/maths");
  });

  it("keeps an encoded subject intact, so it decodes to the same address", () => {
    const back = "/student/progress/Basic%20Science";
    const url = new URL(reviewSessionHref("l-1", "c-1", back), "http://x");

    expect(url.searchParams.get("back")).toBe(back);
    expect(readReviewBack(url.searchParams.get("back"))).toBe(back);
  });

  it("carries no back it would not honour, and none when it was not given one", () => {
    expect(reviewSessionHref("l-1", "c-1", "https://evil.test")).toBe(
      "/student/lessons/l-1/review-session?concept=c-1",
    );
    expect(reviewSessionHref("l-1", "c-1")).toBe(
      "/student/lessons/l-1/review-session?concept=c-1",
    );
  });
});

describe("readReviewBack", () => {
  it("takes Subject Detail's own address", () => {
    expect(readReviewBack("/student/progress/maths")).toBe("/student/progress/maths");
    expect(readReviewBack("/student/progress/Yor%C3%B9b%C3%A1")).toBe(
      "/student/progress/Yor%C3%B9b%C3%A1",
    );
  });

  it.each([
    ["another site", "https://x"],
    ["a protocol-relative host", "//x"],
    ["a climb out of the subject", "/student/progress/../profile"],
    ["an encoded climb", "/student/progress/%2e%2e"],
    ["a dot segment", "/student/progress/."],
    ["another console", "/admin"],
    ["Progress itself", "/student/progress/"],
    ["somewhere else in the student app", "/student/dashboard"],
    ["two segments", "/student/progress/maths/extra"],
    ["a backslash", "/student/progress/maths\\..\\x"],
    ["an encoded slash", "/student/progress/Science%2F..%2F..%2Fadmin"],
    ["an encoded backslash", "/student/progress/%5C%5Cexample.com"],
    ["a query", "/student/progress/maths?x=1"],
    ["a script", "javascript:alert(1)"],
    ["a broken escape", "/student/progress/%E0%A4%A"],
    ["empty", ""],
  ])("refuses %s", (_, back) => {
    expect(readReviewBack(back)).toBeNull();
  });

  it("refuses a missing or repeated parameter", () => {
    expect(readReviewBack(undefined)).toBeNull();
    expect(readReviewBack(null)).toBeNull();
    expect(
      readReviewBack(["/student/progress/maths", "/student/progress/maths"]),
    ).toBeNull();
  });
});
