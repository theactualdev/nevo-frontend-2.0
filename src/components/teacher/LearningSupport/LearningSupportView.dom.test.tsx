import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { query, notFound } = vi.hoisted(() => ({
  query: { value: { data: null as unknown, failed: false, loading: true } },
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("@/hooks/useLiveQuery", () => ({ useLiveQuery: () => query.value }));
vi.mock("next/navigation", () => ({ notFound }));

import { LearningSupportView } from "./LearningSupportView";

/**
 * C20's Learning Support page, before its school-wide list can be read. It
 * never draws C20's empty state - "No child in the school has an open flagged
 * concern" is a claim this console cannot make yet.
 */

beforeEach(() => {
  notFound.mockClear();
  query.value = { data: null, failed: false, loading: true };
});

describe("the Learning Support page", () => {
  it("says what it cannot list yet, and the way that works today", () => {
    query.value = { data: { holders: [], viewerHoldsIt: true }, failed: false, loading: false };
    render(<LearningSupportView />);

    expect(screen.getByRole("heading", { level: 1, name: "Learning Support" })).toBeInTheDocument();
    expect(screen.getByText("The school-wide list isn’t ready yet")).toBeInTheDocument();
    expect(screen.queryByText(/Nothing open right now/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to My Classes" })).toHaveAttribute("href", "/teacher/classes");
  });

  it("is nothing for a teacher who does not hold the role", () => {
    query.value = { data: { holders: [], viewerHoldsIt: false }, failed: false, loading: false };

    expect(() => render(<LearningSupportView />)).toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("waits, rather than deciding, while it asks", () => {
    render(<LearningSupportView />);

    expect(notFound).not.toHaveBeenCalled();
    expect(screen.queryByText(/isn’t ready yet/)).not.toBeInTheDocument();
  });
});
