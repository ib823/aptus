/**
 * The shared top bar names the workspace you are actually in.
 *
 * THE DEFECT THIS CLOSES. The breadcrumb was
 * `STUDIO_SECTIONS.find((s) => s.href === pathname)` with a literal
 * "Developer Studio" fallback. `find` returns undefined for every
 * `/operations/*` and `/control-tower/*` path, so it fell through to the
 * literal — and the top bar, which all three workspaces render, announced
 * "Developer Studio" on every page of the other two. Visible on first load,
 * in production, on the component that is hardest to change safely.
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import {
  CONTROL_TOWER_SECTIONS,
  OPERATIONS_SECTIONS,
  STUDIO_SECTIONS,
} from "@/components/studio/StudioRail";
import { StudioTopBar } from "@/components/studio/StudioTopBar";

const mockPath = vi.hoisted(() => ({ value: "/studio" }));

vi.mock("next/navigation", () => ({
  usePathname: () => mockPath.value,
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

function renderBar(sections: readonly { key: string; label: string; href: string; available: boolean }[], label: string) {
  return render(
    <StudioTopBar
      sections={sections}
      workspaceLabel={label}
      tenants={[]}
      activeTenantKey={null}
      roleLabel="Support"
      userEmail="support@abeam.test"
    />,
  );
}

describe("the breadcrumb follows the active workspace", () => {
  it("says Developer Studio in Studio — unchanged behaviour", () => {
    mockPath.value = "/studio/interfaces";
    renderBar(STUDIO_SECTIONS, "Developer Studio");
    expect(screen.getByText("Developer Studio · Interfaces")).toBeTruthy();
  });

  it("does NOT say Developer Studio on an Operations Center page", () => {
    // The regression, stated as its own assertion so it cannot quietly return.
    mockPath.value = "/operations";
    renderBar(OPERATIONS_SECTIONS, "Operations Center");
    expect(screen.queryByText(/Developer Studio/)).toBeNull();
    expect(screen.getByText("Operations Center")).toBeTruthy();
  });

  it("does NOT say Developer Studio on a Control Tower page", () => {
    mockPath.value = "/control-tower";
    renderBar(CONTROL_TOWER_SECTIONS, "Control Tower");
    expect(screen.queryByText(/Developer Studio/)).toBeNull();
    expect(screen.getByText("Control Tower")).toBeTruthy();
  });

  it("names the section once you are inside one", () => {
    mockPath.value = "/operations/traffic";
    renderBar(OPERATIONS_SECTIONS, "Operations Center");
    expect(screen.getByText("Operations Center · Broker traffic")).toBeTruthy();
  });

  it("shows the bare workspace name on its home, not 'Workspace · Home'", () => {
    mockPath.value = "/operations";
    renderBar(OPERATIONS_SECTIONS, "Operations Center");
    expect(screen.getByText("Operations Center")).toBeTruthy();
  });

  it("falls back to the workspace name on an unknown path rather than a stale section", () => {
    mockPath.value = "/operations/not-a-section";
    renderBar(OPERATIONS_SECTIONS, "Operations Center");
    expect(screen.getByText("Operations Center")).toBeTruthy();
  });
});

describe("the section lists stay honest about what exists", () => {
  it("gives every workspace a home that is available", () => {
    for (const [name, sections] of [
      ["studio", STUDIO_SECTIONS],
      ["operations", OPERATIONS_SECTIONS],
      ["control-tower", CONTROL_TOWER_SECTIONS],
    ] as const) {
      const home = sections.find((s) => s.key === "home");
      expect(home, `${name} needs a home`).toBeTruthy();
      expect(home?.available, `${name} home must be reachable`).toBe(true);
    }
  });

  it("keeps unbuilt sections marked unavailable rather than linking to a 404", () => {
    // Same discipline as Studio's: `available` flips on as each screen's PR
    // lands. A rail entry that 404s is worse than one that says "not yet".
    for (const s of [...OPERATIONS_SECTIONS, ...CONTROL_TOWER_SECTIONS]) {
      if (s.key !== "home") {
        expect(s.available, `${s.href} has no screen yet`).toBe(false);
      }
    }
  });
});
