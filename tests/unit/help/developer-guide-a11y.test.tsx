/**
 * The two axe failures on screens that link to or show the developer guide
 * (WCAG 2.1 AA, found by an axe scan in light and dark):
 *
 * - link-in-text-block: Studio's ScopeNote link to the guide sat inside a
 *   sentence told apart by colour alone. It is underlined.
 * - scrollable-region-focusable: the guide's code blocks scroll sideways but
 *   could not take keyboard focus, so a keyboard user could not scroll them.
 *   Each is a focusable, labelled region; the global [tabindex]:focus-visible
 *   rule in globals.css draws its ring.
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

describe("the developer guide's code blocks", () => {
  it("are each a focusable region with its own label", async () => {
    render(await DeveloperGuidePage());
    const blocks = Array.from(document.querySelectorAll("pre"));
    expect(blocks.length).toBeGreaterThan(0);
    const labels = new Set<string>();
    for (const pre of blocks) {
      expect(pre).toHaveAttribute("tabindex", "0");
      expect(pre).toHaveAttribute("role", "region");
      const label = pre.getAttribute("aria-label") ?? "";
      expect(label).toMatch(/^Code example \d+$/);
      labels.add(label);
    }
    // Unique, so a screen reader's list of regions tells one from the next.
    expect(labels.size).toBe(blocks.length);
  });
});
