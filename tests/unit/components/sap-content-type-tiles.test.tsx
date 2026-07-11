import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ContentTypeTiles } from "@/components/sap/capability/ContentTypeTiles";

// Tiles speak COVERAGE (Loaded / Not loaded), never tenant status.
// Real S4_PUBLIC_PUBLISHED_COUNTS: API 862, EVENT 147, LIVEPROCESS 0.
describe("ContentTypeTiles — coverage language, not status", () => {
  it("a LOADED type shows the real count + 'loaded' and NO indicative", () => {
    render(<ContentTypeTiles byType={{ API: 943 }} />);
    const apiTile = screen.getByRole("tab", { name: /APIs/i });
    expect(apiTile.textContent).toContain("943");
    expect(apiTile.textContent).toMatch(/loaded/i);
    expect(apiTile.textContent).not.toMatch(/of ~/);
    expect(apiTile.textContent).not.toMatch(/indicative/i);
  });

  it("a NOT-loaded type with a published count shows 'Not loaded · ~Y published'", () => {
    render(<ContentTypeTiles byType={{ EVENT: 0 }} />);
    const eventTile = screen.getByRole("tab", { name: /Events/i });
    expect(eventTile.textContent).toMatch(/Not loaded/i);
    expect(eventTile.textContent).toMatch(/~147 published/);
    expect(eventTile.textContent).not.toMatch(/indicative/i);
  });

  it("a published count of 0 shows 'Not loaded' only — never '~0'", () => {
    const { container } = render(<ContentTypeTiles byType={{ LIVEPROCESS: 0 }} />);
    expect(container.textContent).not.toMatch(/~0/);
    const tile = screen.getByRole("tab", { name: /Live Processes/i });
    expect(tile.textContent).toMatch(/Not loaded/i);
    expect(tile.textContent).not.toMatch(/published/i);
  });

  it("the empty-state tooltip omits '~0 published' for a 0-published type", () => {
    render(<ContentTypeTiles byType={{ LIVEPROCESS: 0 }} />);
    const tile = screen.getByRole("tab", { name: /Live Processes/i });
    expect(tile.getAttribute("title")).not.toMatch(/~0 published/);
  });
});
