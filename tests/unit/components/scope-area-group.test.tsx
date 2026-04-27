/**
 * Unit tests for ScopeAreaGroup auto-open + lazy-mount behavior.
 *
 * Pinned by the perf workstream that found the /scope page mounted ~9k
 * DOM nodes from auto-opened areas (Bursa's selections include the
 * "Uncategorized" area at 357 catalog items). Auto-open is now gated by
 * a soft cap so large areas stay collapsed until the user expands them.
 *
 * Mount/unmount on user toggle is delegated to Radix's <Accordion> +
 * <Presence>; this suite asserts the gating behavior at the component's
 * own boundary (initial open state, response to user click).
 */

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ScopeAreaGroup } from "@/components/scope/ScopeAreaGroup";

// Stub ScopeItemCard so the test can count renders via a data-testid
// without dragging in the real card's dependencies (api fetches,
// Radix select, sanitize-html, etc.).
vi.mock("@/components/scope/ScopeItemCard", () => ({
  ScopeItemCard: ({ item }: { item: { id: string; nameClean: string } }) => (
    <div data-testid="scope-item-card" data-item-id={item.id}>
      {item.nameClean}
    </div>
  ),
}));

const mkItem = (id: string) => ({
  id,
  nameClean: `Item ${id}`,
  totalSteps: 10,
  subArea: "sub",
  configCount: 0,
  tutorialUrl: null,
  selected: false,
  relevance: null,
  currentState: null,
  notes: null,
});

const baseProps = {
  area: "Finance",
  onSelectionChange: vi.fn(),
  onBulkAction: vi.fn(),
  industryPreSelectSet: new Set<string>(),
  isReadOnly: false,
};

describe("ScopeAreaGroup auto-open + lazy mount", () => {
  it("does NOT mount items when the area starts collapsed (selectedCount === 0)", () => {
    const items = [mkItem("a1"), mkItem("a2"), mkItem("a3")];
    render(
      <ScopeAreaGroup {...baseProps} items={items} totalCount={3} selectedCount={0} />,
    );
    expect(screen.queryAllByTestId("scope-item-card")).toHaveLength(0);
  });

  it("DOES mount items when a small area auto-opens (selectedCount > 0, totalCount within cap)", () => {
    const items = [mkItem("a1"), mkItem("a2"), mkItem("a3")];
    render(
      <ScopeAreaGroup {...baseProps} items={items} totalCount={3} selectedCount={2} />,
    );
    expect(screen.queryAllByTestId("scope-item-card")).toHaveLength(3);
  });

  it("does NOT auto-open a LARGE area even with selections (perf gate)", () => {
    // 357 items mirrors the production "Uncategorized" area that triggered
    // the original 9k-DOM-node pile-up.
    const items = Array.from({ length: 357 }, (_, i) => mkItem(`u${i}`));
    render(
      <ScopeAreaGroup
        {...baseProps}
        items={items}
        totalCount={357}
        selectedCount={1}
      />,
    );
    expect(screen.queryAllByTestId("scope-item-card")).toHaveLength(0);
    // Header still shows the selection count so the user knows there's work
    // inside without paying for 357 card mounts.
    expect(screen.getByText(/1 \/ 357 selected/)).toBeInTheDocument();
  });

  it("mounts items after the user expands a previously-collapsed area", () => {
    const items = [mkItem("a1"), mkItem("a2"), mkItem("a3")];
    render(
      <ScopeAreaGroup {...baseProps} items={items} totalCount={3} selectedCount={0} />,
    );
    expect(screen.queryAllByTestId("scope-item-card")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: /Finance/ }));

    expect(screen.queryAllByTestId("scope-item-card")).toHaveLength(3);
  });
});
