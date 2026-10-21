/**
 * Studio · Interfaces — what the contrast fix changed in the component.
 *
 * The token pairs are pinned in interfaces-contrast.test.ts; this pins which
 * tokens the screen actually reaches for, because a pair that clears the floor
 * helps nobody if the component paints a different one:
 *
 *   - the selected row's secondary line uses --ink-secondary (--ink-muted is
 *     4.45:1 on the selected ground in light) and unselected rows keep
 *     --ink-muted on the page;
 *   - selection is not carried by colour alone: the selected interface's
 *     button is aria-current and its cell carries a --brand-navy bar;
 *   - the row can be selected from the keyboard, through that button;
 *   - the Mapping card says "disabled" with its surface and copy, never with
 *     opacity, and stays inert (pointer-events: none).
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { InterfacesClient, type StudioInterface } from "@/components/studio/InterfacesClient";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const BASE: StudioInterface = {
  id: "if_a",
  name: "Orders read",
  version: 1,
  sapProduct: "s4hana",
  externalId: "custom:/sap/opu/odata/sap/ZORDERS_SRV",
  servicePath: "/sap/opu/odata/sap/ZORDERS_SRV",
  odataVersion: "V2",
  operation: "READ",
  entitySet: null,
  mode: "READ",
  status: "DRAFT",
  mappingVersion: null,
  hasRequestSchema: false,
  responseSchemaState: "none",
  solutionId: "sol_1",
  solutionName: "Order Portal",
};
const OTHER: StudioInterface = { ...BASE, id: "if_b", name: "Partners read", servicePath: null, externalId: "API_BUSINESS_PARTNER" };

function rowButton(name: string) {
  return screen.getByRole("button", { name }) as HTMLButtonElement;
}

describe("the selected row", () => {
  it("marks the selected interface aria-current, and only that one", () => {
    render(<InterfacesClient interfaces={[BASE, OTHER]} canAuthor={false} />);
    expect(rowButton("Orders read").getAttribute("aria-current")).toBe("true");
    expect(rowButton("Partners read").getAttribute("aria-current")).toBeNull();
  });

  it("can be changed from the keyboard, through the row's button", () => {
    render(<InterfacesClient interfaces={[BASE, OTHER]} canAuthor={false} />);
    const other = rowButton("Partners read");
    expect(other.tagName).toBe("BUTTON");
    fireEvent.click(other); // what Enter / Space on a focused <button> dispatches
    expect(other.getAttribute("aria-current")).toBe("true");
    expect(rowButton("Orders read").getAttribute("aria-current")).toBeNull();
  });

  it("reads its secondary line in --ink-secondary, and unselected rows keep --ink-muted", () => {
    render(<InterfacesClient interfaces={[BASE, OTHER]} canAuthor={false} />);
    const selectedLine = screen.getByText("Order Portal · own API");
    expect(selectedLine.style.color).toBe("var(--ink-secondary)");

    const rows = screen.getAllByRole("row");
    const otherRow = rows.find((r) => r.textContent?.includes("Partners read"))!;
    const otherLine = [...otherRow.querySelectorAll("span")].find((s) => s.textContent === "Order Portal")!;
    expect(otherLine.style.color).toBe("var(--ink-muted)");
  });

  it("carries a --brand-navy bar on the selected cell, so selection is not colour-of-fill alone", () => {
    render(<InterfacesClient interfaces={[BASE, OTHER]} canAuthor={false} />);
    const selectedCell = rowButton("Orders read").closest("td")!;
    const otherCell = rowButton("Partners read").closest("td")!;
    expect(selectedCell.style.boxShadow).toContain("var(--brand-navy)");
    expect(otherCell.style.boxShadow).toBe("");
    expect(selectedCell.closest("tr")!.style.background).toBe("var(--brand-navy-soft)");
  });
});

describe("the Mapping card", () => {
  function mappingCard(): HTMLElement {
    return screen.getByRole("heading", { name: /^Mapping/ }).closest("section")!;
  }

  it("is not faded with opacity — every line on it is read", () => {
    render(<InterfacesClient interfaces={[BASE]} canAuthor />);
    expect(mappingCard().style.opacity).toBe("");
  });

  it("stays inert, and says so in its copy and with a dashed placeholder edge", () => {
    render(<InterfacesClient interfaces={[BASE]} canAuthor />);
    const card = mappingCard();
    expect(card.style.pointerEvents).toBe("none");
    expect(card.style.background).toBe("var(--surface-ink-tint)");
    expect(card.style.border).toContain("dashed");
    expect(card.textContent).toContain("not in this version");
    expect(card.textContent).toMatch(/mappingVersion\s*stays\s*null/);
  });
});
