import { describe, expect, it } from "vitest";
import type { AssignedClass } from "@/lib/api/classes";
import { classesOnce } from "./classesOnce";

const a = (
  classId: string,
  subject: string | null,
  role: AssignedClass["role"] = "primary",
): AssignedClass => ({
  assignmentId: `${classId}-${subject}-${role}`,
  classId,
  className: classId.toUpperCase(),
  classCode: null,
  role,
  assignedAt: "2026-10-08T09:00:00Z",
  subject,
});

describe("classesOnce", () => {
  it("folds a class taught for two subjects into one entry, subjects in order", () => {
    const out = classesOnce([a("jss-2a", "Mathematics"), a("sss-1", "Biology"), a("jss-2a", "English")]);

    expect(out.map((c) => c.classId)).toEqual(["jss-2a", "sss-1"]);
    expect(out[0].subjects).toEqual(["Mathematics", "English"]);
  });

  it("keeps a class with no subject, and doesn't repeat one that arrives twice", () => {
    const out = classesOnce([a("jss-2a", null), a("jss-2a", "English"), a("jss-2a", " English ")]);

    expect(out).toHaveLength(1);
    expect(out[0].subjects).toEqual(["English"]);
  });

  it("is primary when any of the assignments is", () => {
    const out = classesOnce([a("jss-2a", "Mathematics", "co_teacher"), a("jss-2a", "English", "primary")]);

    expect(out[0].role).toBe("primary");
  });
});
