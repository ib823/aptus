/**
 * The to-be pack reads SAP's communication scenarios of ITS release only
 * (P1.2). The read was release-blind: with two releases loaded, a scenario
 * came back once per release and the map kept whichever row was read last.
 */

import { describe, expect, it, vi } from "vitest";

import { loadTobeInputs } from "@/lib/tobe/inputs";
import { resolveSapContentRelease } from "@/lib/sap-content/release";

describe("loadTobeInputs", () => {
  it("asks for the scenarios of the configured content release", async () => {
    const scenarios = vi.fn(async () => []);
    const none = { findMany: async () => [] };
    const db = {
      affirmBundle: {
        findUnique: async () => ({
          id: "b1",
          client: "C",
          state: "OPEN",
          createdById: "u",
          country: null,
          countries: [],
          scopeItems: [{ scopeItemId: "J45" }],
          responses: [],
        }),
      },
      affirmQuestion: none,
      tobeRule: none,
      tobePack: none,
      sapContentRelease: { findFirst: async () => null },
      sapProcessStep: none,
      sapFormTemplate: none,
      scopeItemCommScenario: { findMany: async () => [{ scopeItemCode: "J45", commScenarioId: "SAP_COM_0057", mandatory: null, sourceUrl: "u" }] },
      sapCommScenario: { findMany: scenarios },
      sapNotSupported: none,
    };
    await loadTobeInputs(db as never, "b1").catch(() => undefined);
    expect(scenarios).toHaveBeenCalledOnce();
    const [args] = scenarios.mock.calls[0] as unknown as [{ where: Record<string, unknown> }];
    expect(args.where).toEqual({ commScenarioId: { in: ["SAP_COM_0057"] }, contentRelease: { release: resolveSapContentRelease().release } });
  });
});
