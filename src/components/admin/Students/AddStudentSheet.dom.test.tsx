import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { ApiError } from "@/lib/api/client";
import type { AdditionQuote } from "@/lib/api/onboarding";
import { AddStudentSheet } from "./AddStudentSheet";
import { clearSession, setSession } from "@/lib/auth/session";

/*
 * Signed in as a SENCo admin: the consent request is SENCo-admin only
 * (`SencoDependency`), and these tests pin what that admin can do. What other
 * admins see is pinned in `ConsentRole.dom.test.tsx`.
 */
beforeEach(() =>
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    userId: "a1",
    role: "senco_admin",
  }),
);
afterEach(() => clearSession());

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
const addGuardian = vi.fn();
vi.mock("@/lib/api/consents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/consents")>();
  return {
    ...actual,
    consentsApi: {
      ...actual.consentsApi,
      addGuardian: (id: string, g: unknown) => addGuardian(id, g),
    },
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

  it("carries no guardian address when none is given, and the date of birth only when given", async () => {
    // Was "never puts a guardian on the enrol body". SCRUM-189 restored
    // `parentEmail` to enrolment - see the guardian tests below.
    mount();
    await fill();
    fireEvent.click(await screen.findByRole("button", { name: /Add Zainab/ }));

    await waitFor(() => expect(enroll).toHaveBeenCalled());
    const body = enroll.mock.calls[0][0] as Record<string, unknown>;
    expect(body).toMatchObject({ firstName: "Zainab", lastName: "Bello", classId: "c1" });
    expect(body.dateOfBirth).toBeNull();
    expect(body.parentEmail ?? null).toBeNull();
    // No guardian given, so nobody is asked.
    expect(addGuardian).not.toHaveBeenCalled();
  });
});

describe("AddStudentSheet guardian", () => {
  /*
   * Consent is a gate: a child added here with nobody on record could never
   * start. The guardian fields came back as name and email together, which is
   * how design said they would.
   */
  const guardian = (name: string, email: string) => {
    fireEvent.change(screen.getByLabelText("Their name"), { target: { value: name } });
    fireEvent.change(screen.getByLabelText("Their email"), { target: { value: email } });
  };

  it("adds the student, then the guardian with the consent request", async () => {
    addGuardian.mockResolvedValue({ deliveryStatus: "queued" });
    mount();
    await fill();
    guardian("Mrs. Bello", "bello@example.com");
    fireEvent.click(await screen.findByRole("button", { name: /Add Zainab/ }));

    await waitFor(() =>
      expect(addGuardian).toHaveBeenCalledWith("s-new", {
        name: "Mrs. Bello",
        email: "bello@example.com",
      }),
    );
    expect(onAdded).toHaveBeenCalledWith("s-new");
  });

  it("wants both or neither", async () => {
    const { container } = mount();
    await fill();
    guardian("Mrs. Bello", "");

    expect(screen.getByRole("button", { name: /Add Zainab/ })).toBeDisabled();
    expect(visibleText(container)).toMatch(/both their name and a working email, or leave both empty/);
  });

  it("records the guardian's email on the child itself, so a failed request still leaves them on record", async () => {
    // Two calls, and the second can drop. The address rides on the FIRST,
    // which records the guardian and sends nothing; the request follows.
    addGuardian.mockResolvedValue({ deliveryStatus: "queued" });
    mount();
    await fill();
    guardian("Mrs. Bello", "bello@example.com");
    fireEvent.click(await screen.findByRole("button", { name: /Add Zainab/ }));

    await waitFor(() => expect(addGuardian).toHaveBeenCalled());
    const body = enroll.mock.calls[0][0] as Record<string, unknown>;
    expect(body.parentEmail).toBe("bello@example.com");
    // Enrolment has nowhere to keep a name; the request carries it.
    expect(Object.keys(body).join()).not.toMatch(/parentName/);
  });

  it("says the student is added when only the guardian step fails - and never enrols twice", async () => {
    addGuardian.mockRejectedValue(new Error("500"));
    const { container } = mount();
    await fill();
    guardian("Mrs. Bello", "bello@example.com");
    fireEvent.click(await screen.findByRole("button", { name: /Add Zainab/ }));

    await waitFor(() =>
      expect(visibleText(container)).toMatch(
        /Zainab is added and bello@example\.com is on their record, but the request to Mrs\. Bello didn.t go/,
      ),
    );
    expect(visibleText(container)).not.toMatch(/Nothing has been added/);
    expect(screen.getByRole("link", { name: /Go to Zainab.s page/ })).toHaveAttribute(
      "href",
      "/admin/students/s-new",
    );
    // The only way forward is to the student's page or closed - not "Add" again.
    expect(screen.queryByRole("button", { name: /^Add Zainab/ })).toBeNull();
    expect(enroll).toHaveBeenCalledTimes(1);
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

describe("AddStudentSheet for an admin without SENCo access", () => {
  // Nested, so it runs after the file's SENCo sign-in and replaces it.
  beforeEach(() =>
    setSession({
      token: "tok",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      userId: "a2",
      role: "other_admin",
    }),
  );

  it("records the guardian's email with the child and sends nothing it would be refused", async () => {
    const { container } = mount();
    await fill();
    // Enrolment cannot keep a name, so none is asked for.
    expect(screen.queryByLabelText("Their name")).toBeNull();
    expect(visibleText(container)).toMatch(/sent by an admin with SENCo \/ Learning Support access/);

    fireEvent.change(screen.getByLabelText("Their email"), { target: { value: "bello@example.com" } });
    fireEvent.click(await screen.findByRole("button", { name: /Add Zainab/ }));

    await waitFor(() => expect(onAdded).toHaveBeenCalledWith("s-new"));
    expect((enroll.mock.calls[0][0] as Record<string, unknown>).parentEmail).toBe("bello@example.com");
    expect(addGuardian).not.toHaveBeenCalled();
  });
});
