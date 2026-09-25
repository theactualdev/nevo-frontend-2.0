import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { ApiError } from "@/lib/api/client";
import type { AdditionQuote } from "@/lib/api/onboarding";
import { AddStudentSheet } from "./AddStudentSheet";

/**
 * D24b "Add a student", and the sentence the frame draws that is not true.
 *
 * The frame says "Charged now ₦59,125" and "Add Zainab & charge ₦59,125".
 * Backend, 25 Sep: enrolling has no billing side effect and nothing charges an
 * addition - it reaches the school as a bigger next invoice. A school reading
 * "& charge" would reasonably believe money had left the account.
 */

const list = vi.fn();
const quote = vi.fn();
const enroll = vi.fn();

vi.mock("@/lib/api/classes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/classes")>();
  return { ...actual, classesApi: { ...actual.classesApi, list: () => list() } };
});
vi.mock("@/lib/api/onboarding", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/onboarding")>();
  return {
    ...actual,
    onboardingApi: { ...actual.onboardingApi, quoteAddition: (c: unknown) => quote(c) },
  };
});
vi.mock("@/lib/api/students", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/students")>();
  return {
    ...actual,
    studentsApi: { ...actual.studentsApi, enroll: (b: unknown) => enroll(b) },
  };
});

const QUOTE: AdditionQuote = {
  students: 1,
  teachers: 0,
  perStudentRate: "55000.00",
  amount: "59125.00",
  totalBeforeVat: "55000.00",
  vatRate: "7.50",
  vatAmount: "4125.00",
  totalWithVat: "59125.00",
  currency: "NGN",
  appliesTo: "Term 2 · 2026/2027",
  billed: "next_invoice",
  message: "x",
};

const CLASS = {
  id: "c1",
  name: "JSS 2A",
  code: null,
  yearGroup: "jss2",
  source: null,
  subjects: [],
  studentCount: 0,
  section: null,
  academicSession: null,
  capacity: null,
  teacherCount: 0,
  teachers: [],
  archivedAt: null,
};

const onAdded = vi.fn();

const mount = () =>
  render(<AddStudentSheet onClose={vi.fn()} onAdded={onAdded} />);

const fill = async (first = "Zainab") => {
  fireEvent.change(screen.getByLabelText("First name"), { target: { value: first } });
  fireEvent.change(screen.getByLabelText("Surname"), { target: { value: "Bello" } });
  await waitFor(() =>
    expect(screen.getByRole("option", { name: "JSS 2A" })).toBeInTheDocument(),
  );
  fireEvent.change(screen.getByLabelText("Class"), { target: { value: "c1" } });
};

beforeEach(() => {
  vi.clearAllMocks();
  list.mockResolvedValue([CLASS]);
  quote.mockResolvedValue(QUOTE);
  enroll.mockResolvedValue({ id: "s-new", loginIdentifier: "zainab.bello" });
});

describe("AddStudentSheet", () => {
  it("never says the school is being charged", async () => {
    /*
     * THE ONE THAT MATTERS. Nothing charges an addition; it appears on the
     * next invoice. "Charge" and "charged now" must appear nowhere.
     */
    const { container } = mount();
    await fill();
    await waitFor(() => expect(visibleText(container)).toMatch(/₦59,125/));

    expect(visibleText(container)).not.toMatch(/\bcharge\b|charged now/i);
  });

  it("puts the amount on the button as next-invoice, in backend's words", async () => {
    mount();
    await fill();

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Add Zainab — ₦59,125 on your next invoice/ }),
      ).toBeEnabled(),
    );
  });

  it("shows the server's VAT split without computing any of it", async () => {
    const { container } = mount();
    await waitFor(() => expect(visibleText(container)).toMatch(/₦4,125/));
    const text = visibleText(container);

    expect(text).toMatch(/1 student × ₦55,000/);
    expect(text).toMatch(/VAT at 7\.5%/);
    expect(text).toMatch(/Added to your next invoice/);
  });

  it("names the term in full, and names none when there is none", async () => {
    const withTerm = mount();
    await waitFor(() =>
      expect(visibleText(withTerm.container)).toMatch(/Joins in Term 2 · 2026\/2027/),
    );
    withTerm.unmount();

    // Null when the school has not configured term dates. An invented term on
    // a price is worse than none.
    quote.mockResolvedValue({ ...QUOTE, appliesTo: null });
    const without = mount();
    await waitFor(() => expect(visibleText(without.container)).toMatch(/₦59,125/));
    expect(visibleText(without.container)).not.toMatch(/Joins in|Term \d/);
  });

  it("still lets a school add a student when the quote fails", async () => {
    // Adding charges nothing, and the next invoice will state the cost; the
    // panel just cannot say so in advance.
    quote.mockRejectedValue(new Error("500"));
    const { container } = mount();
    await fill();

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/couldn.t load the cost/i),
    );
    const btn = screen.getByRole("button", { name: /^Add Zainab$/ });
    expect(btn).toBeEnabled();
    expect(visibleText(container)).toMatch(/nothing is taken today/i);
  });

  it("sends no parent email, and sends the date of birth only when given", async () => {
    mount();
    await fill();
    fireEvent.click(await screen.findByRole("button", { name: /Add Zainab/ }));

    await waitFor(() => expect(enroll).toHaveBeenCalled());
    const body = enroll.mock.calls[0][0] as Record<string, unknown>;
    expect(body).toMatchObject({ firstName: "Zainab", lastName: "Bello", classId: "c1" });
    expect(body.dateOfBirth).toBeNull();
    expect(Object.keys(body).join()).not.toMatch(/parent/i);
  });

  it("does not offer a parent email field at all", () => {
    mount();
    expect(screen.queryByLabelText(/parent/i)).toBeNull();
  });

  it("shows the server's reason when an enrolment is refused", async () => {
    // A future date of birth is a 422 the school can fix in two seconds.
    enroll.mockRejectedValue(
      new ApiError(422, "no", {
        detail: {
          code: "validation_error",
          message: "Date of birth can't be in the future.",
          errors: [],
        },
      }),
    );
    const { container } = mount();
    await fill();
    fireEvent.click(await screen.findByRole("button", { name: /Add Zainab/ }));

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/can.t be in the future/i),
    );
  });

  it("will not add a student without a name and a class", async () => {
    mount();
    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Zainab" } });
    expect(screen.getByRole("button", { name: /^Add Zainab/ })).toBeDisabled();
  });
});
