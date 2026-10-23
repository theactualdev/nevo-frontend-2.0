import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ThirdPartyLicencesPage from "./page";

// Plain selectors, not role queries: the page holds some 425 links, and
// computing every accessible name in jsdom outruns the test timeout.
describe("Third-party licences page", () => {
  it("lists the app's packages by licence and links the full texts and the backend's list", () => {
    const { container } = render(<ThirdPartyLicencesPage />);
    const href = (text: string) =>
      [...container.querySelectorAll("a")].find((a) => a.textContent === text)?.getAttribute("href");

    expect(container.querySelector("h1")?.textContent).toBe("Third-party licences");
    expect([...container.querySelectorAll("h2")].some((h) => h.textContent?.startsWith("MIT"))).toBe(true);
    expect(href("next")).toBe("https://nextjs.org");
    expect(href("one text file")).toBe("/legal/third-party-notices.txt");
    expect(href("its own list")).toMatch(/\/legal\/third-party-licenses$/);
  });
});
