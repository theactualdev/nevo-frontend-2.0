import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import type { SchoolSubject } from "@/lib/api/subjects";

const canonical = vi.fn();

vi.mock("@/lib/api/subjects", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/subjects")>();
  return { ...actual, subjectsApi: { canonical: () => canonical() } };
});

import { SubjectPicker } from "./SubjectPicker";

/**
 * The subject picker (design's "Nevo Admin Subject Picker", 28 Sep). It used
 * to offer only the school's own list, so a subject the school's files never
 * mentioned could not go on a class at all. Nothing is written from here: the
 * names it picks or adds are saved with the class or teacher, and the server
 * settles each one.
 */

const own = (id: string, name: string, displayName = name): SchoolSubject => ({
  id,
  name,
  displayName,
  origin: "canonical",
  reviewState: "merged",
});

const SCHOOL = [own("s-maths", "Mathematics"), own("s-eng", "English", "English Language")];
const NEVO = [
  { id: "n-maths", slug: "mathematics", displayName: "Mathematics" },
  { id: "n-eng", slug: "english-language", displayName: "English Language" },
  { id: "n-fm", slug: "further-mathematics", displayName: "Further Mathematics" },
  { id: "n-bio", slug: "biology", displayName: "Biology" },
];

function Harness({ start = [] as string[], subjects = SCHOOL as SchoolSubject[] | null, onChange = vi.fn() }) {
  const [value, setValue] = useState(start);
  return (
    <>
      <SubjectPicker
        id="t"
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange(next);
        }}
        subjects={subjects}
      />
      <output data-testid="value">{value.join("|")}</output>
    </>
  );
}

const field = () => screen.getByRole("combobox", { name: "Add a subject" });
const value = () => screen.getByTestId("value").textContent;

beforeEach(() => {
  canonical.mockReset();
  canonical.mockResolvedValue(NEVO);
});

describe("what it offers", () => {
  it("lists the school's own subjects and Nevo's together, once each, with ticks for the chosen", async () => {
    render(<Harness start={["English"]} />);
    fireEvent.focus(field());

    expect(await screen.findByRole("checkbox", { name: "Further Mathematics" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Biology" })).not.toBeChecked();
    // The school spells it "English"; it is ticked, under the school's display name.
    expect(screen.getByRole("checkbox", { name: "English Language" })).toBeChecked();
    // Nevo's Mathematics is the school's Mathematics - one row, not two.
    expect(screen.getAllByRole("checkbox", { name: "Mathematics" })).toHaveLength(1);
    expect(screen.getByText("All subjects")).toBeInTheDocument();
    expect(screen.getByText("1 selected")).toBeInTheDocument();
  });

  it("offers the school's own list alone when Nevo's can't be read", async () => {
    canonical.mockRejectedValue(new Error("down"));
    render(<Harness />);
    fireEvent.focus(field());
    expect(await screen.findByRole("checkbox", { name: "Mathematics" })).toBeInTheDocument();
    await waitFor(() => expect(canonical).toHaveBeenCalled());
    expect(screen.queryByRole("checkbox", { name: "Biology" })).toBeNull();
  });

  it("offers nothing to add while the school's list is unread", () => {
    render(<Harness subjects={null} start={["Mathematics"]} />);
    expect(screen.queryByRole("combobox", { name: "Add a subject" })).toBeNull();
    expect(screen.getByRole("button", { name: "Remove Mathematics" })).toBeInTheDocument();
  });
});

describe("picking", () => {
  it("adds one of Nevo's subjects the school doesn't hold yet, by name", async () => {
    render(<Harness />);
    fireEvent.focus(field());
    fireEvent.click(await screen.findByRole("checkbox", { name: "Further Mathematics" }));
    expect(value()).toBe("Further Mathematics");
    expect(screen.getByRole("button", { name: "Remove Further Mathematics" })).toBeInTheDocument();
  });

  it("takes a subject off again from its row, whichever spelling the value holds", async () => {
    render(<Harness start={["English", "Mathematics"]} />);
    fireEvent.focus(field());
    fireEvent.click(await screen.findByRole("checkbox", { name: "English Language" }));
    expect(value()).toBe("Mathematics");
  });

  it("narrows as you type", async () => {
    render(<Harness />);
    fireEvent.change(field(), { target: { value: "math" } });
    expect(await screen.findByRole("checkbox", { name: "Further Mathematics" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Mathematics" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Biology" })).toBeNull();
    expect(screen.getByText("Matching subjects")).toBeInTheDocument();
  });
});

describe("a subject nobody has", () => {
  it("can be added as written", async () => {
    render(<Harness />);
    fireEvent.change(field(), { target: { value: "  Yoruba  Language " } });
    expect(await screen.findByText("Subjects matching “Yoruba Language”")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add Yoruba Language" }));
    expect(value()).toBe("Yoruba Language");
    expect(field()).toHaveValue("");
  });

  it("is added with Enter too, without submitting a form round it", async () => {
    const submit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    render(
      <form onSubmit={submit}>
        <Harness />
      </form>,
    );
    fireEvent.change(field(), { target: { value: "Yoruba" } });
    await screen.findByRole("button", { name: "Add Yoruba" });
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(value()).toBe("Yoruba");
    expect(submit).not.toHaveBeenCalled();
  });

  it("isn't offered for a name the list already holds", async () => {
    render(<Harness />);
    fireEvent.change(field(), { target: { value: "biology" } });
    expect(await screen.findByRole("checkbox", { name: "Biology" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Add / })).toBeNull();
  });
});

describe("closing", () => {
  it("closes on Done and on Escape", async () => {
    render(<Harness />);
    fireEvent.focus(field());
    fireEvent.click(await screen.findByRole("button", { name: "Done" }));
    expect(screen.queryByRole("checkbox", { name: "Mathematics" })).toBeNull();

    fireEvent.focus(field());
    await screen.findByRole("checkbox", { name: "Mathematics" });
    fireEvent.keyDown(field(), { key: "Escape" });
    expect(screen.queryByRole("checkbox", { name: "Mathematics" })).toBeNull();
  });
});
