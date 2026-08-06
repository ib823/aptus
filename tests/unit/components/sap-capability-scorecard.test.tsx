import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReadinessScorecard, readinessPercent } from "@/components/sap/capability/ReadinessScorecard";
import { StatusBadge } from "@/components/sap/capability/StatusBadge";

describe("readinessPercent (activated / probed)", () => {
  it("is activated / probed, 0 when nothing probed", () => {
    expect(readinessPercent(5, 60)).toBe(8);
    expect(readinessPercent(0, 60)).toBe(0);
    expect(readinessPercent(5, 0)).toBe(0);
    expect(readinessPercent(60, 60)).toBe(100);
  });
});

describe("ReadinessScorecard", () => {
  it("headlines the real exposed count as a probe SAMPLE, catalogue scale shown separately", () => {
    render(<ReadinessScorecard activated={5} dataConfirmed={0} dataProbe={false} needsSetup={12} notFound={0} notChecked={900} notProbeable={470} available={0} probed={60} probeable={128} apiTotal={941} reference={0} />);
    // Headline: "5 authorized of 60 probed (stored probe)".
    expect(screen.getByText(/authorized of/i)).toBeInTheDocument();
    expect(screen.getByText(/stored probe/i)).toBeInTheDocument();
    expect(screen.getByText("60")).toBeInTheDocument();
    // Catalogue scale is separate — NOT a percentage over 128 or 941.
    expect(screen.getByText(/941/)).toBeInTheDocument();
    expect(screen.getByText(/128/)).toBeInTheDocument();
    expect(screen.queryByText(/of 128|of 941/)).not.toBeInTheDocument();
  });

  it("progressbar reflects activated / probed, not over the whole catalogue", () => {
    render(<ReadinessScorecard activated={5} dataConfirmed={0} dataProbe={false} needsSetup={12} notFound={0} notChecked={900} notProbeable={470} available={0} probed={60} probeable={128} apiTotal={941} reference={0} />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("8");
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
        <StatusBadge status="NOT_FOUND" />
        <StatusBadge status="NOT_CHECKED" />
        <StatusBadge status="NOT_PROBEABLE" />
      </div>,
    );
    expect(screen.getByLabelText("Activated")).toBeInTheDocument();
    expect(screen.getByLabelText("Needs setup")).toBeInTheDocument();
    // Un-probed / absent-path get their OWN neutral labels — never "Needs setup".
    expect(screen.getByLabelText("Not checked")).toBeInTheDocument();
    expect(screen.getByLabelText("Not found")).toBeInTheDocument();
    // No OData endpoint → a distinct terminal label, never "Not checked".
    expect(screen.getByLabelText("Not probeable")).toBeInTheDocument();
    // Colour is applied via var(--token) inline style — never a hex literal.
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{6}/);
    expect(container.innerHTML).toContain("var(--status-signed-bg)");
  });
});

describe("every status bucket is shown", () => {
  /*
   * This defect shipped twice. First the pill row rendered five of the six
   * statuses — `available` was passed nowhere and appeared nowhere — so the
   * summary summed to 1,822 while the status filter above it offered 1,973.
   * The fix declared "every bucket"… over six buckets, and the vocabulary has
   * SEVEN: any 404 probe result (NOT_FOUND) made the stated sum false again.
   *
   * On a screen whose entire argument is "nothing is inferred; every number
   * traces to a probe", a silently absent bucket is the worst kind of error:
   * it does not look like a gap, it looks like a total. So this test now
   * exercises all seven, with every bucket non-zero — a zero bucket cannot
   * catch an omission, because omitting it does not change the sum.
   */
  it("renders all seven buckets and reconciles the row to the sum", () => {
    render(
      <ReadinessScorecard
        activated={139}
        dataConfirmed={0}
        dataProbe={false}
        needsSetup={349}
        notFound={7}
        notChecked={11}
        notProbeable={515}
        available={151}
        probed={1003}
        probeable={1200}
        apiTotal={941}
        reference={819}
      />,
    );

    expect(screen.getByText("Available")).toBeTruthy();
    expect(screen.getByText("Not found")).toBeTruthy();
    // 139 + 349 + 151 + 7 + 11 + 515 + 819 = 1,991 — the browsable total.
    expect(screen.getByText("1,991")).toBeTruthy();
  });
});
