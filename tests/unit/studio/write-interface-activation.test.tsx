/**
 * R4, per environment: a WRITE interface cannot be marked ACTIVE until some
 * environment holds the full write chain — a live credential with a write key
 * AND an approved write grant — and the card shows the table before the
 * click. The route is the control (interfaces-patch.test.ts); this is the
 * affordance that keeps a developer from building toward a call the broker
 * refuses.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { InterfacesClient, type StudioInterface } from "@/components/studio/InterfacesClient";
import type { WriteReadinessRow } from "@/lib/studio/write-readiness";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const WRITE_IFACE: StudioInterface = {
  id: "if_w",
  name: "Sales order create",
  version: 1,
  sapProduct: "s4hana",
  externalId: "API_SALES_ORDER_SRV",
  operation: "CREATE",
  entitySet: "A_SalesOrder",
  mode: "WRITE",
  status: "DRAFT",
  mappingVersion: null,
  hasRequestSchema: false,
  hasResponseSchema: false,
  solutionId: "sol_1",
  solutionName: "Order Portal",
};

const row = (environment: WriteReadinessRow["environment"], credential: WriteReadinessRow["credential"], grant: WriteReadinessRow["grant"]): WriteReadinessRow => ({
  environment,
  credential,
  grant,
  ready: credential === "ready" && grant === "approved",
});
const NOTHING: WriteReadinessRow[] = [row("SANDBOX", "none", "none"), row("DEV", "none", "none"), row("TEST", "none", "none"), row("PROD", "none", "none")];
const SPLIT: WriteReadinessRow[] = [row("SANDBOX", "none", "none"), row("DEV", "ready", "none"), row("TEST", "none", "none"), row("PROD", "no-write-key", "approved")];
const READY_TEST: WriteReadinessRow[] = [row("SANDBOX", "none", "none"), row("DEV", "none", "none"), row("TEST", "ready", "approved"), row("PROD", "none", "none")];

function markActive() {
  return screen.getByRole("button", { name: "Mark ACTIVE" }) as HTMLButtonElement;
}

describe("Mark ACTIVE on a WRITE interface", () => {
  it("is disabled, and says why, while no environment holds the write chain", () => {
    render(<InterfacesClient interfaces={[{ ...WRITE_IFACE, writeReadiness: NOTHING }]} canAuthor />);
    expect(markActive().disabled).toBe(true);
    expect(markActive().title).toMatch(/No environment holds the full write chain/);
    expect(screen.getByText(/No environment is ready — the broker refuses every write/)).toBeTruthy();
  });

  it("stays disabled when the write key and the approved grant are in different environments, and shows both halves", () => {
    // The interim gate would have enabled this: "some credential carries a write key".
    render(<InterfacesClient interfaces={[{ ...WRITE_IFACE, writeReadiness: SPLIT }]} canAuthor />);
    expect(markActive().disabled).toBe(true);
    expect(screen.getByText("DEV: credential with write key · no write grant requested")).toBeTruthy();
    expect(screen.getByText("PROD: credential without a write key · write grant approved")).toBeTruthy();
  });

  it("treats an unknown readiness as not ready — never as permission", () => {
    render(<InterfacesClient interfaces={[WRITE_IFACE]} canAuthor />);
    expect(markActive().disabled).toBe(true);
  });

  it("is enabled once one environment is complete, and names it", () => {
    render(<InterfacesClient interfaces={[{ ...WRITE_IFACE, writeReadiness: READY_TEST }]} canAuthor />);
    expect(markActive().disabled).toBe(false);
    expect(screen.getByText("TEST: credential with write key · write grant approved → ready")).toBeTruthy();
    expect(screen.getByText(/Ready in TEST — the solution can write there once this interface is ACTIVE/)).toBeTruthy();
  });

  it("never gates a READ interface on the write chain", () => {
    render(
      <InterfacesClient
        interfaces={[{ ...WRITE_IFACE, operation: "READ", mode: "READ", writeReadiness: NOTHING }]}
        canAuthor
      />,
    );
    expect(markActive().disabled).toBe(false);
    expect(screen.queryByText(/Write chain/)).toBeNull();
  });
});
