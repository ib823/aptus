import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReadinessScorecard, readinessPercent } from "@/components/sap/capability/ReadinessScorecard";
import { StatusBadge } from "@/components/sap/capability/StatusBadge";

describe("readinessPercent (honest metric)", () => {
  it("is activated / probeable, 0 when nothing probeable", () => {
    expect(readinessPercent(16, 39)).toBe(41);
    expect(readinessPercent(0, 39)).toBe(0);
    expect(readinessPercent(5, 0)).toBe(0);
    expect(readinessPercent(39, 39)).toBe(100);
  });
});

describe("ReadinessScorecard", () => {
  it("shows the discrete denominator plainly (no grouped itemCount inflation)", () => {
    render(<ReadinessScorecard activated={16} probeable={39} available={100} reference={200} />);
    // The honest phrasing with the visible denominator.
    expect(screen.getByText(/runtime services activated/i)).toBeInTheDocument();
    expect(screen.getAllByText("16").length).toBeGreaterThan(0);
    expect(screen.getAllByText("39").length).toBeGreaterThan(0);
    expect(screen.getByText("41%")).toBeInTheDocument();
    // Must NOT present a grouped-sum style number as the ratio.
    expect(screen.queryByText(/6413|8983/)).not.toBeInTheDocument();
  });

  it("exposes an accessible progressbar with the honest value", () => {
    render(<ReadinessScorecard activated={16} probeable={39} available={100} reference={200} />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("41");
  });
});

describe("StatusBadge (token-mapped)", () => {
  it("renders each status with an accessible label and no hardcoded colour", () => {
    const { container } = render(
      <div>
        <StatusBadge status="ACTIVATED" />
        <StatusBadge status="AVAILABLE" />
        <StatusBadge status="REFERENCE" />
        <StatusBadge status="NEEDS_SETUP" />
      </div>,
    );
    expect(screen.getByLabelText("Activated")).toBeInTheDocument();
    expect(screen.getByLabelText("Needs setup")).toBeInTheDocument();
    // Colour is applied via var(--token) inline style — never a hex literal.
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{6}/);
    expect(container.innerHTML).toContain("var(--status-signed-bg)");
  });
});
