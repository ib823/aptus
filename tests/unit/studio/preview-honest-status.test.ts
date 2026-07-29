/**
 * A refused read is never reported as a successful one.
 *
 * THE DEFECT THIS PINS. `/api/sap/tdd/preview` answers HTTP 200 whether the
 * tenant accepted the read or refused it — the upstream outcome rides in the
 * body as `data.ok` / `data.status`. The Test Console checked only the transport
 * status, saw 200 because CoreEdge's own route had replied, and then set
 * `status: "ACTIVATED"` and `httpStatus: 200` as literals.
 *
 * So a tenant answering 403, and a service with no such entity set answering
 * 404, both rendered as:
 *
 *     Result ● Activated | HTTP 200
 *     "No records. The service answered successfully and returned nothing —
 *      that is not an error."
 *
 * next to a note telling the developer their application should treat it as
 * data. That is the exact conflation the product exists to refuse — empty,
 * not-set-up and failed sharing one presentation — on the screen a consultant
 * uses to PROVE an interface before writing code against it.
 *
 * Nothing in the normal gate could see it. The component declared its own
 * response type as `{ rows?, records? }`, so `ok` and `status` were not merely
 * unread, they were unmodelled: TypeScript had nothing to object to even though
 * `SapPreviewResult` has always typed both. Lint saw ordinary property access.
 * Every test passed. It took calling the endpoint directly, seeing `ok:false,
 * status:403`, and comparing that against what the screen said.
 *
 * The payloads below are the ones actually observed against the deployment, not
 * invented ones.
 */

import { describe, expect, it } from "vitest";

import { previewOutcome } from "@/lib/studio/honest-status";

const OK = { ok: true, status: 200 };

describe("the tenant's answer decides the status, not our own route's", () => {
  it("does not call a 403 from the tenant 'Activated'", () => {
    // Observed verbatim: transport 200, body says the tenant refused.
    const out = previewOutcome(OK, {
      data: { entitySet: "A_BankDetail", ok: false, status: 403, rows: [], fields: [] },
    } as never);

    expect(out.status).toBe("NEEDS_SETUP");
    expect(out.status).not.toBe("ACTIVATED");
    // The reader must be shown the tenant's status, never the envelope's.
    expect(out.httpStatus).toBe(403);
    expect(out.detail).not.toContain("answered successfully");
    expect(out.rows).toEqual([]);
  });

  it("does not call a 404 from the tenant 'Activated'", () => {
    const out = previewOutcome(OK, { data: { ok: false, status: 404, rows: [] } });
    expect(out.status).toBe("NOT_FOUND");
    expect(out.httpStatus).toBe(404);
    expect(out.detail).not.toContain("answered successfully");
  });

  it("does not call an unexplained upstream failure 'Activated'", () => {
    const out = previewOutcome(OK, { data: { ok: false, status: 500, rows: [] } });
    expect(out.status).toBe("NOT_PROBEABLE");
    expect(out.httpStatus).toBe(500);
  });

  it("treats a missing body as a failure, not as an empty success", () => {
    // The subtler version of the same mistake: no data at all is not zero rows.
    const out = previewOutcome(OK, {});
    expect(out.status).toBe("NOT_PROBEABLE");
    expect(out.detail).not.toContain("answered successfully");
  });

  it("never reports rows it did not receive", () => {
    for (const body of [
      { data: { ok: false, status: 403, rows: [] } },
      { data: { ok: false, status: 404, rows: [] } },
      {},
    ]) {
      expect(previewOutcome(OK, body).rows).toEqual([]);
    }
  });
});

describe("a genuine empty result is still a result — the doctrine, intact", () => {
  it("calls a real 200 with zero rows 'Activated' and says why", () => {
    // The behaviour the product WANTS, and the reason the bug survived review:
    // this case is correct and was the one everyone tested.
    const out = previewOutcome(OK, { data: { ok: true, status: 200, rows: [] } });
    expect(out.status).toBe("ACTIVATED");
    expect(out.detail).toContain("answered successfully");
    expect(out.detail).toContain("not an error");
  });

  it("reports rows when the tenant returned them", () => {
    const out = previewOutcome(OK, {
      data: { ok: true, status: 200, rows: [{ a: 1 }, { a: 2 }] },
    });
    expect(out.status).toBe("ACTIVATED");
    expect(out.rows).toHaveLength(2);
    expect(out.detail).toBe("2 records returned.");
  });

  it("accepts `records` as well as `rows`, which the endpoint uses in places", () => {
    const out = previewOutcome(OK, { data: { ok: true, status: 200, records: [{ a: 1 }] } });
    expect(out.rows).toHaveLength(1);
    expect(out.detail).toBe("1 record returned.");
  });
});

describe("our own route failing is our failure, not the tenant's", () => {
  /*
   * THESE TWO ASSERTED THE TENANT'S VOCABULARY FOR OUR OWN FAILURES — inside a
   * describe block named "our own route failing is our failure, not the
   * tenant's". The heading was right and the assertions contradicted it, which
   * is how "Not probeable · HTTP 400" survived: a test asserted it.
   *
   * What is genuinely worth pinning at this layer is that the STATUS and the
   * MESSAGE still reach the reader. Suppressing the chip must not mean
   * suppressing the reason.
   */
  it("surfaces our status and our message, without a verdict about the tenant", () => {
    const out = previewOutcome({ ok: false, status: 403 }, {});
    expect(out.httpStatus).toBe(403);
    expect(out.status).toBeUndefined();
    expect(out.probed).toBe(false);
  });

  it("keeps the server's own explanation when it gave one", () => {
    const out = previewOutcome(
      { ok: false, status: 502 },
      { error: { message: "SAP preview request failed" } },
    );
    expect(out.httpStatus).toBe(502);
    expect(out.detail).toContain("SAP preview request failed");
    expect(out.status, "a 502 from our route is our route failing").toBeUndefined();
  });
});

describe("nothing but a real success may be saved as one", () => {
  it("means a refused read can never be persisted as PASS or as an ACTIVATED fixture", () => {
    // WHY THIS ASSERTION EXISTS SEPARATELY. The Test Console writes
    // `lastOutcome: status === "ACTIVATED" ? "PASS" : "FAIL"` into a saved test
    // case, and posts `honestStatus: status` into a captured fixture. So the
    // fabricated status did not merely render — it was written to durable
    // storage and read back by other screens. Every upstream failure must
    // therefore be non-ACTIVATED at the source, which is what this pins.
    const refusals = [
      { ok: false, status: 401 },
      { ok: false, status: 403 },
      { ok: false, status: 404 },
      { ok: false, status: 500 },
      { ok: false, status: 502 },
    ];
    for (const data of refusals) {
      const out = previewOutcome(OK, { data: { ...data, rows: [] } });
      expect(out.status, `upstream ${data.status} must not be ACTIVATED`).not.toBe("ACTIVATED");
    }
  });
});

/**
 * THE STATUS VOCABULARY DESCRIBES THE TENANT, AND NOTHING ELSE MAY BORROW IT.
 *
 * A caller-side 400 — CoreEdge's own parameter validation — rendered as
 * "Not probeable", a term reserved for a capability that cannot be asked. The
 * request never left the building. At 02:00 a consultant reads a verdict about
 * SAP and escalates to the SAP team about a defect in this console.
 *
 * A transport 401/403 was worse: it rendered "Needs setup — reachable, but this
 * entity is not released to the connected user", which is a detailed sentence
 * about a communication arrangement on a system that was never contacted. It is
 * this console refusing the caller's ROLE.
 *
 * The fix is not an eighth vocabulary term. It is that no probe ran, so there is
 * no fact about the capability, and absence is rendered as absence — the outcome
 * carries no status and the card shows no chip. Adding a term would put
 * CoreEdge's own faults on the same scale as SAP's capability states, which is
 * the original error rather than a fix for it.
 */
describe("our own failures never wear the tenant's vocabulary", () => {
  it("reports no status at all when our route refused the caller", () => {
    const out = previewOutcome({ ok: false, status: 403 }, {});
    expect(out.probed, "nothing was asked of SAP").toBe(false);
    expect(out.status, "a chip here is a verdict about a system never contacted").toBeUndefined();
    expect(out.detail).toMatch(/nothing was asked of sap/i);
  });

  it("reports no status when our own validation rejected the request", () => {
    const out = previewOutcome(
      { ok: false, status: 400 },
      { error: { message: "Valid tenant, service, and entity are required" } },
    );
    expect(out.probed).toBe(false);
    expect(out.status).toBeUndefined();
    // The reason is still shown — silence would be its own dishonesty.
    expect(out.detail).toContain("Valid tenant, service, and entity are required");
    expect(out.detail).toMatch(/did not reach sap/i);
  });

  it("never says NOT_PROBEABLE or NEEDS_SETUP for a transport failure", () => {
    for (const status of [400, 401, 403, 404, 500, 502]) {
      const out = previewOutcome({ ok: false, status }, {});
      expect(out.status, `transport ${status} must carry no tenant verdict`).toBeUndefined();
    }
  });

  it("still marks a genuine tenant answer as probed, chip and all", () => {
    // The control: the vocabulary is not being suppressed everywhere, only where
    // it would be a fabrication.
    const refused = previewOutcome({ ok: true, status: 200 }, { data: { ok: false, status: 403 } });
    expect(refused.probed).toBe(true);
    expect(refused.status).toBe("NEEDS_SETUP");

    const ok = previewOutcome({ ok: true, status: 200 }, { data: { ok: true, status: 200, rows: [] } });
    expect(ok.probed).toBe(true);
    expect(ok.status).toBe("ACTIVATED");
  });
});
