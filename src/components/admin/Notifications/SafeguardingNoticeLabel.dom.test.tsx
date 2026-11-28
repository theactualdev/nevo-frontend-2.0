import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import type { Notification } from "@/lib/api/notifications";
import { NotificationRow } from "./NotificationRow";
import { rowLabel } from "./categories";

/**
 * S16 (backend v43): a new safeguarding flag notifies each Learning Support
 * holder - type "safeguarding_flag", filed under category "attention". This
 * console names that category "Something changed suddenly", so every
 * safeguarding notice arrived under that label: an untrue state. It carries
 * no label until S24 gives it a category of its own; the server's title and
 * body stay exactly as sent.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const note = (over: Partial<Notification> = {}): Notification =>
  ({
    notificationId: "n1",
    recipientId: "u1",
    recipientRole: "senco_admin",
    type: "safeguarding_flag",
    category: "attention",
    title: "A new safeguarding flag needs a look",
    description: "Open Safeguarding to see it.",
    read: false,
    createdAt: "2026-11-26T09:00:00Z",
    navigatesTo: null,
    archived: false,
    archivedAt: null,
    ...over,
  }) as Notification;

const row = (n: Notification) =>
  render(
    <NotificationRow
      notification={n}
      archived={false}
      now={Date.parse("2026-11-26T10:00:00Z")}
      onRead={vi.fn()}
      onArchive={vi.fn()}
      onRestore={vi.fn()}
    />,
  );

describe("a safeguarding notice's label", () => {
  it("is none - never 'Something changed suddenly' - with the server's title and body as sent", () => {
    const { container } = row(note());
    expect(visibleText(container)).not.toMatch(/Something changed suddenly/i);
    expect(screen.getByText("A new safeguarding flag needs a look")).toBeInTheDocument();
    expect(screen.getByText("Open Safeguarding to see it.")).toBeInTheDocument();
  });

  it("leaves every other attention notice its label", () => {
    const { container } = row(note({ type: "attention_summary", title: "A pattern shifted" }));
    expect(visibleText(container)).toMatch(/Something changed suddenly/i);
  });
});

/*
 * L91 (Lydia, 28 Nov): once S24 gives it a category of its own, the small
 * label is "Safeguarding". Named now, so it shows the day the server sends
 * "safeguarding" - and the preferences gain no switch the server can't save.
 */
describe("a safeguarding notice with its own category (S24)", () => {
  // The row's small label, not its body (which may say "Safeguarding" too).
  const label = (c: HTMLElement) => c.querySelector("span.uppercase")?.textContent?.trim() ?? null;

  it("is labelled Safeguarding, with the server's title and body as sent", () => {
    const { container } = row(note({ category: "safeguarding" }));
    expect(label(container)).toBe("Safeguarding");
    expect(visibleText(container)).not.toMatch(/Something changed suddenly/i);
    expect(screen.getByText("A new safeguarding flag needs a look")).toBeInTheDocument();
    expect(rowLabel({ type: "safeguarding_flag", category: "safeguarding" })).toBe("Safeguarding");
  });

  it("is still unlabelled while the server files it under attention", () => {
    const { container } = row(note({ category: "attention" }));
    expect(label(container)).toBeNull();
    expect(rowLabel({ type: "safeguarding_flag", category: "attention" })).toBeNull();
  });
});
