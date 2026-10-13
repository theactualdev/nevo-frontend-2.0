import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import type { PlanOption } from "@/lib/api/billing";
import { PlanOptions } from "./PlanOptions";

/**
 * D11d's plan choice, ruled by Lydia on 7 Oct ("D11d wins. The plan choice
 * exists.") and served by backend on 8 Oct at published rates, with switching
 * "confirmed through the relationship manager" - no self-service route. So the
 * plans show what the server sends, the current one is marked, and the other
 * offers a request rather than a switch.
 */

const planOptions = vi.fn();
const submit = vi.fn();

vi.mock("@/lib/api/billing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/billing")>();
  return { ...actual, billingApi: { ...actual.billingApi, planOptions: () => planOptions() } };
});
vi.mock("@/lib/api/feedback", () => ({ feedbackApi: { submit: (p: unknown) => submit(p) } }));

const PLANS: PlanOption[] = [
  {
    plan: "annual",
    name: "Annual",
    perStudentRate: "150000.00",
    billingPeriod: "year",
    accessWindow: "year_round",
    currency: "NGN",
    switchMethod: "relationship_manager",
  },
  {
    plan: "per_term",
    name: "Per term",
    perStudentRate: "55000.00",
    billingPeriod: "term",
    accessWindow: "school_session",
    currency: "NGN",
    switchMethod: "relationship_manager",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  planOptions.mockResolvedValue(PLANS);
  submit.mockResolvedValue({});
});

describe("the plans", () => {
  it("show each plan as the server sends it, with the school's VAT rate", async () => {
    const { container } = render(<PlanOptions current="annual" vatRate="7.50" />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Per term/));
    const text = visibleText(container);
    expect(text).toMatch(/₦150,000/);
    expect(text).toMatch(/per student \/ year · plus VAT at 7\.5%/);
    expect(text).toMatch(/₦55,000/);
    expect(text).toMatch(/per student \/ term/);
    expect(text).toMatch(/not the breaks between terms/);
    expect(text).toMatch(/published rates/i);
  });

  it("mark the school's current plan, and draw no saving or badge nothing sends", async () => {
    const { container } = render(<PlanOptions current="per_term" vatRate="7.50" />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Your current plan/));
    const text = visibleText(container);
    expect(text).not.toMatch(/Saves|Recommended|Flexible|next billing cycle/i);
    expect(screen.getByRole("button", { name: "Ask to switch to Annual" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Per term/ })).toBeNull();
  });

  it("asks the relationship manager rather than switching anything", async () => {
    render(<PlanOptions current="annual" vatRate="7.50" />);
    fireEvent.click(await screen.findByRole("button", { name: "Ask to switch to Per term" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Asked. Your relationship manager will be in touch.",
      ),
    );
    expect(submit).toHaveBeenCalledWith({
      type: "plan_change",
      note: "Requesting a switch to the Per term plan.",
      context: "/admin/billing",
    });
  });

  it("says plainly when the request did not send", async () => {
    submit.mockRejectedValue(new Error("500"));
    const { container } = render(<PlanOptions current="annual" vatRate="7.50" />);
    fireEvent.click(await screen.findByRole("button", { name: "Ask to switch to Per term" }));
    await waitFor(() => expect(visibleText(container)).toMatch(/didn.t send\. Nothing has changed/));
  });

  it("costs only itself when the plans cannot be read", async () => {
    planOptions.mockRejectedValue(new Error("500"));
    const { container } = render(<PlanOptions current="annual" vatRate="7.50" />);
    await waitFor(() => expect(planOptions).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
