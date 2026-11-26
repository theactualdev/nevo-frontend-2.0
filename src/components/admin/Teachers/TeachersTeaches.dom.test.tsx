import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TeachersView } from "./TeachersView";

/**
 * D06's Teaches column (backlog 29; S7, backend v44, 25 Nov). The list carries
 * each teacher's subjects by name now, so the column the frame draws - Teacher
 * / Teaches / Classes / Status - is built, and below 1280 the subjects ride
 * under the name with the class count: "{teaches} · {classes}".
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
}));
vi.mock("@/lib/api/teachers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/teachers")>();
  return {
    ...actual,
    teachersApi: {
      ...actual.teachersApi,
      list: async () => [
        {
          id: "t1",
          name: "Ngozi Obi",
          email: "n.obi@school.edu.ng",
          status: "active",
          classCount: 2,
          subjects: ["Basic Science", "Biology"],
          // The class names - never shown as what they teach.
          teaches: ["JSS 2A", "JSS 2B"],
        },
        { id: "t2", name: "Grace Ade", email: "g.ade@school.edu.ng", status: "active", classCount: 1, subjects: [] },
        // An older answer, without subjects: unknown, so nothing is drawn.
        { id: "t3", name: "Emeka Nwankwo", email: "e.n@school.edu.ng", status: "active", classCount: 3 },
      ],
    },
  };
});

const row = (name: string) => screen.getByRole("link", { name }).closest("div.relative") as HTMLElement;
const teachesCell = (name: string) => row(name).querySelector("[data-teaches]") as HTMLElement;

describe("D06's Teaches column", () => {
  it("has its heading between Teacher and Classes", async () => {
    render(<TeachersView />);
    await screen.findByText("Ngozi Obi");
    const head = screen.getByText("Teaches").parentElement as HTMLElement;
    expect([...head.children].map((c) => c.textContent)).toEqual(["Teacher", "Teaches", "Classes", "Status"]);
  });

  it("names each teacher's subjects, joined as the frame writes them - never their classes", async () => {
    render(<TeachersView />);
    await screen.findByText("Ngozi Obi");
    expect(teachesCell("Ngozi Obi")).toHaveTextContent(/^Basic Science, Biology$/);
    expect(teachesCell("Ngozi Obi")).not.toHaveTextContent(/JSS/);
  });

  it("draws the Classes column's dash for none, and nothing for an answer that didn't say", async () => {
    render(<TeachersView />);
    await screen.findByText("Grace Ade");
    expect(teachesCell("Grace Ade")).toHaveTextContent(/^—$/);
    expect(teachesCell("Emeka Nwankwo")).toHaveTextContent(/^$/);
  });

  it("rides under the name below 1280 as '{teaches} · {classes}'", async () => {
    render(<TeachersView />);
    await screen.findByText("Ngozi Obi");
    expect(row("Ngozi Obi")).toHaveTextContent("Basic Science, Biology · 2 classes");
    // None, or unknown: the class count alone, as before.
    expect(row("Grace Ade")).toHaveTextContent("1 class");
    expect(row("Grace Ade")).not.toHaveTextContent(/·/);
    expect(row("Emeka Nwankwo")).not.toHaveTextContent(/·/);
  });
});
