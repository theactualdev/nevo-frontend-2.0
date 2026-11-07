import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The written-consent body is multipart, and the one consent it records is
 * the console's own: `data_processing`, the printed form's single tick box.
 */

const post = vi.fn();
const blob = vi.fn();

vi.mock("./client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./client")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      post: (path: string, body: unknown) => post(path, body),
      blob: (path: string, options: unknown) => blob(path, options),
    },
  };
});

import { consentsApi } from "./consents";

beforeEach(() => {
  post.mockReset().mockResolvedValue({});
  blob.mockReset().mockResolvedValue(new Blob());
});

describe("recordWrittenConsent", () => {
  it("sends the form's own words as multipart, with the consent the form asks for", async () => {
    const photo = new File(["jpg"], "form.jpg", { type: "image/jpeg" });
    await consentsApi.recordWrittenConsent("s-1", {
      parentName: "  Mrs. Ngozi Okafor ",
      parentRelationship: "Mother",
      signedOn: "2026-10-01",
      form: photo,
      consentHolderLinkId: "pl-1",
    });
    const [path, body] = post.mock.calls[0] as [string, FormData];
    expect(path).toBe("/api/v1/students/s-1/consents/written");
    expect(body).toBeInstanceOf(FormData);
    expect(body.get("parentName")).toBe("Mrs. Ngozi Okafor");
    expect(body.get("parentRelationship")).toBe("Mother");
    expect(body.get("signedOn")).toBe("2026-10-01");
    // SCRUM-306: the linked adult who gave it, so only they can withdraw it.
    expect(body.get("consentHolderLinkId")).toBe("pl-1");
    expect(body.getAll("consentTypes")).toEqual(["data_processing"]);
    expect((body.get("form") as File).name).toBe("form.jpg");
    // The server's default notice version stands.
    expect(body.has("noticeVersion")).toBe(false);
  });

  it("leaves the photo out when there is none", async () => {
    await consentsApi.recordWrittenConsent("s-1", {
      parentName: "Mr. Bello",
      parentRelationship: "Father",
      signedOn: "2026-10-01",
      consentHolderLinkId: "pl-2",
    });
    const body = post.mock.calls[0][1] as FormData;
    expect(body.has("form")).toBe(false);
  });
});

describe("consentForm", () => {
  it("asks for the child's form by id, or the blank one without", async () => {
    await consentsApi.consentForm("s-1");
    expect(blob).toHaveBeenLastCalledWith("/api/v1/consents/form", { params: { studentId: "s-1" } });
    await consentsApi.consentForm();
    expect(blob).toHaveBeenLastCalledWith("/api/v1/consents/form", { params: { studentId: undefined } });
  });
});
