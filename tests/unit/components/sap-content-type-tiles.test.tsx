import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ContentTypeTiles } from "@/components/sap/capability/ContentTypeTiles";

// Real S4_PUBLIC_PUBLISHED_COUNTS: API 862, EVENT 147, LIVEPROCESS 0.
describe("ContentTypeTiles — honest indicative counts", () => {
  it("an IMPORTED type's OWN tile hides the stale indicative line (no '943 of ~862')", () => {
    render(<ContentTypeTiles byType={{ API: 943 }} />);
    const apiTile = screen.getByRole("tab", { name: /APIs/i });
    expect(apiTile.textContent).toContain("943");
    expect(apiTile.textContent).not.toMatch(/of ~/); // imported → count is the truth, no indicative
    expect(apiTile.textContent).not.toMatch(/indicative/i);
  });

  it("an EMPTY type's tile keeps '0 of ~Y indicative'", () => {
    render(<ContentTypeTiles byType={{ EVENT: 0 }} />);
    const eventTile = screen.getByRole("tab", { name: /Events/i });
    expect(eventTile.textContent).toMatch(/of ~147/);
    expect(eventTile.textContent).toMatch(/indicative/i);
  });

  it("a published count of 0 never renders '~0' (falls back to the reference tag)", () => {
    const { container } = render(<ContentTypeTiles byType={{ LIVEPROCESS: 0 }} />);
    expect(container.textContent).not.toMatch(/~0/);
    // Live Processes is a reference type → shows the tag, not an indicative line.
    expect(screen.getAllByText(/reference/i).length).toBeGreaterThan(0);
  });

  it("the empty-state tooltip omits '(~0 published)' for a 0-published type", () => {
    render(<ContentTypeTiles byType={{ LIVEPROCESS: 0 }} />);
    const tile = screen.getByRole("tab", { name: /Live Processes/i });
    expect(tile.getAttribute("title")).not.toMatch(/~0 published/);
  });
});
