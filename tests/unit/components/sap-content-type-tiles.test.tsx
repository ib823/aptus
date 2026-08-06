import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ContentTypeTiles } from "@/components/sap/capability/ContentTypeTiles";

// Tiles speak COVERAGE (Loaded / Not loaded), never tenant status.
// Real S4_PUBLIC_PUBLISHED_COUNTS: API 862, EVENT 151, LIVEPROCESS 43,
// PROCESS_BLUEPRINT 0 (n/a by design — its NA_NOTE makes it the zero case).
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
    expect(eventTile.textContent).toMatch(/~151 published/);
    expect(eventTile.textContent).not.toMatch(/indicative/i);
  });

  it("a published count of 0 shows no '~0' anywhere — the zero case is n/a'd", () => {
    /*
     * LIVEPROCESS used to be the zero-published fixture; the drift-reference
     * reconciliation gave it its real 43 (the committed drop file's size).
     * The only zero left is PROCESS_BLUEPRINT, which is NA_NOTE'd — and the
     * invariant these tests exist for is unchanged: nothing ever renders
     * "~0 published".
     */
    const { container } = render(<ContentTypeTiles byType={{ PROCESS_BLUEPRINT: 0 }} />);
    expect(container.textContent).not.toMatch(/~0/);
  });

  it("Live Processes now carries its real published figure", () => {
    render(<ContentTypeTiles byType={{ LIVEPROCESS: 0 }} />);
    const tile = screen.getByRole("tab", { name: /Live Processes/i });
    expect(tile.textContent).toMatch(/Not loaded/i);
    expect(tile.textContent).toMatch(/~43 published/);
  });

  it("Process Blueprints is n/a by design — em dash, honest sublabel, no '~N published'", () => {
    render(<ContentTypeTiles byType={{ API: 943 }} />);
    // Accessible name is stable ("not applicable") — does NOT collide with the
    // Scenarios / Live Processes tabs even though the sublabel names them.
    const tile = screen.getByRole("tab", { name: /Process Blueprints: not applicable/i });
    expect(tile.textContent).toContain("—"); // em dash, never "0"
    expect(tile.textContent).not.toMatch(/\b0\b/);
    expect(tile.textContent).toMatch(/Not a separate type — covered under Scenarios & Live Processes/);
    expect(tile.textContent).not.toMatch(/published/i); // no "~15 published"
    // The "?" carries the honest explanation.
    const help = screen.getByRole("button", { name: /About Process Blueprints/i });
    expect(help.getAttribute("title")).toMatch(/empty by design — not a pending import/i);
  });
});
