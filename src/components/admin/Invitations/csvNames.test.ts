import { describe, expect, it } from "vitest";
import type { AdminClass } from "@/lib/api/classes";
import { TEMPLATE, parseInviteCsv, toDraft } from "./csv";

/**
 * BACKLOG 18: D19's staff file, and the server's own teacher template, name a
 * teacher in two columns - first_name and last_name. Only a single "name"
 * column was read, so both were refused: "We couldn't find a 'name' column."
 */

const classes = [{ id: "c1", name: "JSS 2A" } as AdminClass];

describe("the teacher import's name columns", () => {
  it("reads first_name and last_name, and sends them as the file has them - never re-split", () => {
    const { rows, fatal } = parseInviteCsv(
      "first_name,last_name,email,class\nMary Ann,Okafor-Bello,m@school.edu.ng,JSS 2A\n",
      classes,
    );
    expect(fatal).toBeNull();
    expect(rows[0]).toMatchObject({ name: "Mary Ann Okafor-Bello", error: null, classId: "c1" });
    expect(toDraft(rows[0])).toEqual({
      role: "teacher",
      firstName: "Mary Ann",
      lastName: "Okafor-Bello",
      email: "m@school.edu.ng",
      classId: "c1",
    });
  });

  it("takes the server's own teacher template header (first_name, last_name, email, subject, class)", () => {
    const { rows, fatal } = parseInviteCsv(
      "first_name,last_name,email,subject,class\nFolake,Adeyemi,f@school.edu.ng,Mathematics,JSS 2A\n",
      classes,
    );
    expect(fatal).toBeNull();
    expect(rows[0]).toMatchObject({ firstName: "Folake", lastName: "Adeyemi", error: null });
  });

  it("still reads a file with one 'name' column", () => {
    const { rows, fatal } = parseInviteCsv("name,email,class\nFolake Adeyemi,f@school.edu.ng,JSS 2A\n", classes);
    expect(fatal).toBeNull();
    expect(toDraft(rows[0])).toMatchObject({ firstName: "Folake", lastName: "Adeyemi" });
  });

  it("says which column it couldn't find when there's no name at all", () => {
    expect(parseInviteCsv("email,class\nf@school.edu.ng,JSS 2A\n", classes).fatal).toMatch(
      /couldn't find a 'first_name' column/,
    );
  });

  it("offers the two-column template", () => {
    expect(TEMPLATE.split("\n")[0]).toBe("first_name,last_name,email,class");
    expect(parseInviteCsv(TEMPLATE, classes).fatal).toBeNull();
  });
});
