import { describe, expect, it } from "vitest";
import type { Invitation } from "@/lib/api/invites";
import type { TeacherSummary } from "@/lib/api/teachers";
import { openInviteFor } from "./openInvite";

const NOW = Date.parse("2026-09-30T12:00:00Z");

const teacher: TeacherSummary = {
  id: "t2",
  name: "Tunde Bello",
  email: "T@School.edu.ng ",
  status: "invited",
};

const inv = (id: string, over: Partial<Invitation>): Invitation =>
  ({
    id,
    token: null,
    role: "teacher",
    email: "t@school.edu.ng",
    name: null,
    status: "pending",
    expiresAt: "2026-10-30T00:00:00Z",
    deliveryStatus: null,
    ...over,
  }) as Invitation;

describe("openInviteFor", () => {
  it("matches on email whatever its case or spacing", () => {
    expect(openInviteFor(teacher, [inv("a", {})], NOW)?.id).toBe("a");
  });

  it("prefers a live invitation to an expired one", () => {
    const rows = [
      inv("old", { expiresAt: "2026-09-01T00:00:00Z" }),
      inv("live", {}),
    ];
    expect(openInviteFor(teacher, rows, NOW)?.id).toBe("live");
  });

  it("falls back to an expired one, which Invitations also resends", () => {
    expect(openInviteFor(teacher, [inv("old", { status: "expired" })], NOW)?.id).toBe("old");
  });

  it("never picks a joined or revoked invitation, or somebody else's", () => {
    const rows = [
      inv("joined", { status: "accepted" }),
      inv("revoked", { status: "revoked" }),
      inv("student", { role: "student" }),
      inv("other", { email: "someone@school.edu.ng" }),
    ];
    expect(openInviteFor(teacher, rows, NOW)).toBeNull();
  });

  it("has nothing to match for a teacher with no email", () => {
    expect(openInviteFor({ ...teacher, email: null }, [inv("a", {})], NOW)).toBeNull();
  });
});
