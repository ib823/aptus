/**
 * Confirms the re-grounded FTS SSCUI labels actually render in the workbench.
 *
 * DecisionCard renders `{decision.sscui}` in its always-visible header
 * (DecisionCard.tsx). These two decisions were re-grounded against the
 * SSCUI_List 2602 catalogue during the D1/D2/D3 workstream:
 *   - 1IQ d3 "Reasons for rejection" — no sales-scoped SSCUI exists; it is
 *     maintained via expert configuration, so the label says so and
 *     sscui_id stays blank.
 *   - BD9 d7 "Delivery split / consolidation" — standard delivery behaviour
 *     with no discrete SSCUI; the label says so and sscui_id stays blank.
 *
 * The decisions are pulled from the REAL shipped data modules, so a pass
 * proves what a logged-in consultant sees in the workbench — not a fixture.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DecisionCard } from "@/components/fts/DecisionCard";
import iq1 from "@/lib/fts/data/1IQ";
import bd9 from "@/lib/fts/data/BD9";
import type { Decision } from "@/lib/fts/types";

function decisionById(decisions: Decision[], id: string): Decision {
  const found = decisions.find((d) => d.id === id);
  if (!found) {
    throw new Error(`decision "${id}" not found in shipped data`);
  }
  return found;
}

describe("DecisionCard renders re-grounded SSCUI labels (D1/D2/D3)", () => {
  it("1IQ d3 renders the expert-configuration label with a blank sscui_id", () => {
    const d3 = decisionById(iq1.decisions, "d3");
    expect(d3.sscui_id).toBe("");

    render(
      <DecisionCard index={0} decision={d3} state={undefined} onChange={vi.fn()} />,
    );

    expect(
      screen.getByText(/Define Reasons for Rejection \(expert configuration\)/),
    ).toBeInTheDocument();
  });

  it("BD9 d7 renders the standard-delivery-behaviour label with a blank sscui_id", () => {
    const d7 = decisionById(bd9.decisions, "d7");
    expect(d7.sscui_id).toBe("");

    render(
      <DecisionCard index={0} decision={d7} state={undefined} onChange={vi.fn()} />,
    );

    expect(
      screen.getByText(
        /Delivery split \/ consolidation \(standard delivery behaviour\)/,
      ),
    ).toBeInTheDocument();
  });
});
