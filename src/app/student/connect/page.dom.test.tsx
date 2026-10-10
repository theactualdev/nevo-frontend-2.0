import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

vi.mock("@/components/student/Connect/ConnectTab", () => ({
  ConnectTab: () => null,
}));

import StudentConnectPage from "./page";

/**
 * D109: Ask Nevo's "Message my teacher" arrives as `?to=teacher`, and the page
 * is what turns it into Connect opening on the teacher's conversation.
 */

const propsFor = async (searchParams: { thread?: string; to?: string }) =>
  ((await StudentConnectPage({ searchParams: Promise.resolve(searchParams) })) as ReactElement<{
    threadId?: string;
    toTeacher?: boolean;
  }>).props;

describe("the Connect page's link parameters", () => {
  it("hands ?to=teacher on to the tab", async () => {
    expect(await propsFor({ to: "teacher" })).toMatchObject({ toTeacher: true });
  });

  it("asks for no teacher's conversation otherwise", async () => {
    expect(await propsFor({})).toMatchObject({ toTeacher: false });
    expect(await propsFor({ to: "class" })).toMatchObject({ toTeacher: false });
  });

  it("still hands ?thread= on", async () => {
    expect(await propsFor({ thread: "t-1" })).toMatchObject({ threadId: "t-1" });
  });
});
