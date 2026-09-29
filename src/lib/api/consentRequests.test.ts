import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What a consent request actually asks a parent for.
 *
 * The types were optional and every caller left them out, so a request asked
 * for whatever the backend defaulted to - which the spec does not document -
 * and the parent page refuses any request asking for more than one thing. A
 * request this console sends must always name exactly the one the student
 * gate needs.
 */

const post = vi.fn();
vi.mock("./client", () => ({
  api: { post: (url: string, body: unknown) => post(url, body) },
}));

const { consentsApi, REQUESTED_CONSENT_TYPES } = await import("./consents");

beforeEach(() => {
  post.mockReset();
  post.mockResolvedValue({});
});

describe("consent requests", () => {
  it("asks for data processing alone - one thing, which the parent page can render", () => {
    expect(REQUESTED_CONSENT_TYPES).toEqual(["data_processing"]);
  });

  it("states the types even when the caller does not", async () => {
    await consentsApi.requestParentConsent("s1", {
      parentName: "Mrs. Eze",
      parentContact: "eze@example.com",
      contactMethod: "email",
    });
    expect(post).toHaveBeenCalledWith("/api/v1/students/s1/parent-consent-requests", {
      parentName: "Mrs. Eze",
      parentContact: "eze@example.com",
      contactMethod: "email",
      consentTypes: ["data_processing"],
    });
  });

  it("adds a guardian through the same request, by email", async () => {
    await consentsApi.addGuardian("s2", { name: "Mr. Bello", email: "bello@example.com" });
    expect(post).toHaveBeenCalledWith("/api/v1/students/s2/parent-consent-requests", {
      parentName: "Mr. Bello",
      parentContact: "bello@example.com",
      contactMethod: "email",
      consentTypes: ["data_processing"],
    });
  });
});
