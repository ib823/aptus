import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ContentTypeTiles } from "@/components/sap/capability/ContentTypeTiles";
import { S4_PUBLIC_PUBLISHED_COUNTS, S4_PUBLIC_PUBLISHED_RELEASE } from "@/lib/sap-public/hub-content";

// Tiles speak COVERAGE (Loaded / Not loaded), never tenant status.
// Real S4_PUBLIC_PUBLISHED_COUNTS at 2608: API 859, EVENT 147, LIVEPROCESS 41,
// PROCESS_BLUEPRINT 16 (no longer n/a by design — see hub-content.ts).
describe("ContentTypeTiles — coverage language, not status", () => {
  it("a LOADED type shows the real count + 'loaded' and NO indicative / published figure", () => {
    render(<ContentTypeTiles byType={{ API: 943 }} />);
    const apiTile = screen.getByRole("tab", { name: /APIs/i });
    expect(apiTile.textContent).toContain("943");
    expect(apiTile.textContent).toMatch(/loaded/i);
    expect(apiTile.textContent).not.toMatch(/of ~/);
    expect(apiTile.textContent).not.toMatch(/published/i);
    expect(apiTile.textContent).not.toMatch(/indicative/i);
  });

  it("a NOT-loaded type shows 'Not loaded · N published (2608)' — release-pinned, no tilde", () => {
    render(<ContentTypeTiles byType={{ EVENT: 0 }} />);
    const eventTile = screen.getByRole("tab", { name: /Events/i });
    expect(eventTile.textContent).toMatch(/Not loaded/i);
    expect(eventTile.textContent).toMatch(/147 published \(2608\)/);
    expect(eventTile.textContent).not.toMatch(/~/);
    expect(eventTile.textContent).not.toMatch(/indicative/i);
    expect(S4_PUBLIC_PUBLISHED_RELEASE).toBe("2608");
  });

  it("never renders a zero published figure, whatever the map says", () => {
    /*
     * The zero case now HAS a live fixture. 2608 WS13 added DATA_PRODUCT and
     * INTEGRATION_ADAPTER, and both are a measured 0: the Hub publishes 334 and
     * 91 of them, and not one belongs to a package in SAP S/4HANA Cloud Public
     * Edition. So the old convenience assertion — every figure > 0 — is no
     * longer true and should not be made true by hiding a real number.
     *
     * The invariant these tests exist for is unchanged and is asserted below:
     * nothing ever renders "0 published" or "~0". A zero renders as "Not
     * loaded" with no published clause, which is what the component already
     * does via `hasPublished = published != null && published > 0`.
     */
    const zeroTypes = Object.entries(S4_PUBLIC_PUBLISHED_COUNTS).filter(([, n]) => n === 0);
    expect(zeroTypes.map(([k]) => k).sort()).toEqual(["DATA_PRODUCT", "INTEGRATION_ADAPTER"]);
    const { container } = render(<ContentTypeTiles byType={{}} />);
    expect(container.textContent).not.toMatch(/~0/);
    expect(container.textContent).not.toMatch(/\b0 published/);

    // …and with rows present for a type whose published figure is a real zero.
    const withZero = render(<ContentTypeTiles byType={{ DATA_PRODUCT: 0, API: 943 }} />);
    expect(withZero.container.textContent).not.toMatch(/~0/);
    expect(withZero.container.textContent).not.toMatch(/\b0 published/);
  });

  it("Live Processes carries its 2608 published figure", () => {
    render(<ContentTypeTiles byType={{ LIVEPROCESS: 0 }} />);
    const tile = screen.getByRole("tab", { name: /Live Processes/i });
    expect(tile.textContent).toMatch(/Not loaded/i);
    expect(tile.textContent).toMatch(/41 published \(2608\)/);
  });

  it("Process Blueprints is a real type at 2608 — a published figure, no n/a dash", () => {
    render(<ContentTypeTiles byType={{ API: 943 }} />);
    const tile = screen.getByRole("tab", { name: /Process Blueprints: not loaded/i });
    expect(tile.textContent).not.toContain("—");
    expect(tile.textContent).toMatch(/16 published \(2608\)/);
    expect(screen.queryByRole("tab", { name: /not applicable/i })).toBeNull();
    // The "?" is the ordinary glossary define, not an n/a explanation.
    expect(screen.getByRole("button", { name: /What is "Process Blueprints"\?/i })).toBeInTheDocument();
  });
});

describe("ContentTypeTiles — 'of which N deprecated' (2608 WS3)", () => {
  it("a loaded tile appends the deprecated count SAP publishes for that type", () => {
    render(<ContentTypeTiles byType={{ API: 859 }} byTypeItems={{ API: 859 }} byTypeDeprecated={{ API: 56 }} />);
    const tile = screen.getByRole("tab", { name: /APIs: 859 loaded, runtime, 56 deprecated/i });
    expect(tile.textContent).toMatch(/of which 56 deprecated/i);
    // The headline is still the full item count — deprecated rows are IN it, not subtracted.
    expect(tile.textContent).toContain("859");
  });

  it("omits the clause entirely when nothing of that type is deprecated", () => {
    render(<ContentTypeTiles byType={{ API: 859 }} byTypeDeprecated={{ API: 0 }} />);
    const tile = screen.getByRole("tab", { name: /APIs/i });
    expect(tile.textContent).not.toMatch(/deprecated/i);
    expect(tile.getAttribute("aria-label")).toBe("APIs: 859 loaded, runtime");
  });

  it("a NOT-loaded tile never claims a deprecated count (nothing is loaded to be deprecated)", () => {
    render(<ContentTypeTiles byType={{ EVENT: 0 }} byTypeDeprecated={{ EVENT: 8 }} />);
    const tile = screen.getByRole("tab", { name: /Events/i });
    expect(tile.textContent).not.toMatch(/deprecated/i);
  });
});
