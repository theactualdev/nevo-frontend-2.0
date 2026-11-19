import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { ComplianceView } from "./ComplianceView";

/**
 * D22'S HERO, BUILT AS DRAWN (Lydia, 16 Nov, SCRUM-347: "Admin BUILDS the
 * drawn two-column layouts"): a navy row, the shield tile beside the figure,
 * 88 / 52 from 1280 and 64 / 40 below.
 *
 * Zero only. D22 draws nothing else, and a shield over a count above zero
 * would assure what the count denies - so a non-zero count keeps the plain
 * card, with no shield.
 */

let labels = 0;

vi.mock("@/lib/api/schoolIntelligence", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/schoolIntelligence")>();
  return {
    ...actual,
    schoolIntelligenceApi: {
      ...actual.schoolIntelligenceApi,
      complianceAudit: async () => ({
        schoolId: "sch1",
        schoolName: "Brightgate Academy",
        generatedAt: "2026-09-29T08:00:00Z",
        studentsProfiled: 240,
        adaptationEventsLogged: 1240,
        diagnosticLabelsStored: labels,
        compliant: labels === 0,
        findings: [],
      }),
    },
  };
});
vi.mock("@/lib/api/students", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/students")>();
  return { ...actual, studentsApi: { ...actual.studentsApi, list: async () => [] } };
});
vi.mock("@/lib/api/school", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/school")>();
  return {
    ...actual,
    schoolApi: {
      ...actual.schoolApi,
      get: async () => ({ retentionPolicy: "contract", retentionDays: 365 }),
    },
  };
});
vi.mock("@/lib/api/consents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/consents")>();
  return {
    ...actual,
    consentsApi: {
      ...actual.consentsApi,
      rightsLog: async () => ({ entries: [], total: 0, limit: 20, offset: 0 }),
    },
  };
});

describe("the compliance hero (D22)", () => {
  it("at zero: the navy row, the shield tile beside the figure, at D22's two sizes", async () => {
    labels = 0;
    const { container } = render(<ComplianceView />);
    await waitFor(() => expect(container.querySelector('[data-hero="clear"]')).not.toBeNull());
    const hero = container.querySelector('[data-hero="clear"]') as HTMLElement;
    expect(hero.className).toMatch(/(^|\s)bg-nevo-navy(\s|$)/);
    expect(hero.className).toMatch(/(^|\s)flex(\s|$)/);
    const [tile, words] = [...hero.children] as HTMLElement[];
    // Tile: 64 below 1280, 88 from 1280, holding the shield.
    expect(tile.className).toMatch(/(^|\s)size-16(\s|$)/);
    expect(tile.className).toMatch(/xl:size-\[88px\]/);
    expect(tile.querySelector("svg")).not.toBeNull();
    // Figure: 40 below 1280, 52 from 1280.
    const figure = words.querySelector("span") as HTMLElement;
    expect(figure.textContent).toBe("0");
    expect(figure.className).toMatch(/(^|\s)text-\[40px\]/);
    expect(figure.className).toMatch(/xl:text-\[52px\]/);
    expect(words.textContent).toMatch(/diagnostic labels stored/);
  });

  it("above zero: the plain card, and no shield", async () => {
    labels = 3;
    const { container } = render(<ComplianceView />);
    await waitFor(() => expect(container.querySelector('[data-hero="found"]')).not.toBeNull());
    expect(container.querySelector('[data-hero="clear"]')).toBeNull();
    const card = container.querySelector('[data-hero="found"]') as HTMLElement;
    expect(card.className).not.toMatch(/bg-nevo-navy/);
    expect(card.querySelector("svg")).toBeNull();
    expect(card.textContent).toMatch(/3/);
    labels = 0;
  });
});
