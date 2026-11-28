import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import type { Notification } from "@/lib/api/notifications";
import { NotificationRow, areaOf, relative } from "./NotificationRow";

/**
 * Backlog 72: D13's rows carry their AREA's own glyph - Roster, Learning
 * support, IT & SSO, Billing - by the category map the hub approved (27 Nov),
 * and say when in D13's words, not "2h ago". The panel (D13) and the page
 * (D13b) word older times differently, and each keeps its own.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const NOW = Date.parse("2026-11-28T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const H = 3_600_000;

describe("the area a row's icon draws", () => {
  it("follows the approved map, and keeps the bell for anything else", () => {
    expect(areaOf("consent")).toBe("roster");
    expect(areaOf("billing")).toBe("billing");
    expect(areaOf("account")).toBe("it");
    expect(areaOf("attention")).toBe("senco");
    expect(areaOf("messages")).toBe("bell");
    expect(areaOf(null)).toBe("bell");
  });

  it("is drawn on the row's tile", () => {
    const note = {
      notificationId: "n1",
      recipientId: "u1",
      recipientRole: "senco_admin",
      type: "invoice_issued",
      category: "billing",
      title: "Invoice issued",
      description: "",
      read: false,
      createdAt: ago(2 * H),
      navigatesTo: null,
      archived: false,
      archivedAt: null,
    } as Notification;
    const { container } = render(
      <NotificationRow notification={note} archived={false} now={NOW} onRead={vi.fn()} />,
    );
    expect(container.querySelector("[data-area]")).toHaveAttribute("data-area", "billing");
  });
});

describe("when, in D13's words", () => {
  it("counts minutes and hours in words, never '2h ago'", () => {
    expect(relative(ago(20_000), NOW)).toBe("just now");
    expect(relative(ago(60_000), NOW)).toBe("1 minute ago");
    expect(relative(ago(25 * 60_000), NOW)).toBe("25 minutes ago");
    expect(relative(ago(H), NOW)).toBe("1 hour ago");
    expect(relative(ago(6 * H), NOW, true)).toBe("6 hours ago");
  });

  it("says Yesterday in the panel, and Yesterday with the time on the page", () => {
    expect(relative(ago(24 * H), NOW, true)).toBe("Yesterday");
    expect(relative(ago(24 * H), NOW)).toMatch(/^Yesterday, \d{1,2}:\d{2} (AM|PM)$/);
  });

  it("says N days ago in the panel, and the date on the page", () => {
    expect(relative(ago(2 * 24 * H), NOW, true)).toBe("2 days ago");
    expect(relative(ago(2 * 24 * H), NOW)).toBe("26 November");
    expect(relative(ago(9 * 24 * H), NOW, true)).toBe("19 November");
  });
});
