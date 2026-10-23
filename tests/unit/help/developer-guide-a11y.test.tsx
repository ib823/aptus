/**
 * The two axe failures on screens that link to or show the developer guide
 * (WCAG 2.1 AA, found by an axe scan in light and dark):
 *
 * - link-in-text-block: Studio's ScopeNote link to the guide sat inside a
 *   sentence told apart by colour alone. It is underlined.
 * - scrollable-region-focusable: the guide's code blocks and tables scroll
 *   sideways but could not take keyboard focus, so a keyboard user could not
 *   scroll them. Each is a focusable region labelled as what it holds; the
 *   global [tabindex]:focus-visible rule in globals.css draws its ring.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/help/require-help-user", () => ({ requireHelpUser: vi.fn(async () => ({ id: "u1" })) }));

import DeveloperGuidePage from "@/app/(help)/help/developer-guide/page";
import { ScopeNote } from "@/components/studio/ScopeNote";

describe("Studio's scope note", () => {
  it.each(["abap", "byo-stack", "no-editor"] as const)("%s: the guide link is underlined, not told apart by colour alone", (topic) => {
    render(<ScopeNote topic={topic} />);
    const link = screen.getByRole("link", { name: "Developer guide" });
    expect(link).toHaveAttribute("href", "/help/developer-guide");
    expect(link.style.textDecoration).toBe("underline");
  });
});

describe("the developer guide's code blocks and tables", () => {
  it("are each a focusable region with its own label", async () => {
    render(await DeveloperGuidePage());
    const blocks = Array.from(document.querySelectorAll("pre"));
    expect(blocks.length).toBeGreaterThan(0);
    const labels = new Set<string>();
    for (const pre of blocks) {
      expect(pre).toHaveAttribute("tabindex", "0");
      expect(pre).toHaveAttribute("role", "region");
      const label = pre.getAttribute("aria-label") ?? "";
      expect(label).toMatch(/^(Code example|Table) \d+$/);
      labels.add(label);
    }
    // Unique, so a screen reader's list of regions tells one from the next.
    expect(labels.size).toBe(blocks.length);
  });

  /*
   * The splitter renders tables preformatted too; a table announced as "Code
   * example 1" misstates what the region holds (WCAG 2.4.6). The guide has
   * both, so each is checked against its own content and numbered among its
   * own kind.
   */
  it("names a table a table and code a code example, each numbered among its kind", async () => {
    render(await DeveloperGuidePage());
    const blocks = Array.from(document.querySelectorAll("pre"));
    const tables = blocks.filter((pre) => (pre.textContent ?? "").startsWith("|"));
    const code = blocks.filter((pre) => !(pre.textContent ?? "").startsWith("|"));
    expect(tables.length).toBeGreaterThan(0);
    expect(code.length).toBeGreaterThan(0);
    expect(tables.map((pre) => pre.getAttribute("aria-label"))).toEqual(tables.map((_, i) => `Table ${i + 1}`));
    expect(code.map((pre) => pre.getAttribute("aria-label"))).toEqual(code.map((_, i) => `Code example ${i + 1}`));
  });
});
