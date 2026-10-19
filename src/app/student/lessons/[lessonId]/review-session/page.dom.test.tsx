import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

vi.mock("@/components/student/Lesson/LessonRoute", () => ({
  LessonRoute: () => null,
}));

import ReviewSessionPage from "./page";

/**
 * Olayinka, 14 Oct: a review goes back to the Subject Detail page it was
 * opened from. `?back=` arrives in the URL, so the page hands on only Subject
 * Detail's own address - anything else, and the review goes Home as before.
 */

const propsFor = async (searchParams: { concept?: string; back?: string | string[] }) =>
  (
    (await ReviewSessionPage({
      params: Promise.resolve({ lessonId: "les-1" }),
      searchParams: Promise.resolve(searchParams),
    })) as ReactElement<{
      lessonId: string;
      review?: boolean;
      reviewConceptId?: string;
      reviewBack?: string;
    }>
  ).props;

describe("the review session page's link parameters", () => {
  it("hands on the Subject Detail page the review was opened from", async () => {
    expect(
      await propsFor({ concept: "c-1", back: "/student/progress/maths" }),
    ).toMatchObject({
      lessonId: "les-1",
      review: true,
      reviewConceptId: "c-1",
      reviewBack: "/student/progress/maths",
    });
  });

  it.each([
    "https://x",
    "//x",
    "/student/progress/../profile",
    "/admin",
    "",
  ])("hands on nowhere for %j", async (back) => {
    expect((await propsFor({ concept: "c-1", back })).reviewBack).toBeUndefined();
  });

  it("hands on nowhere when it was not said", async () => {
    const props = await propsFor({ concept: "c-1" });
    expect(props.reviewBack).toBeUndefined();
    expect(props.reviewConceptId).toBe("c-1");
  });
});
