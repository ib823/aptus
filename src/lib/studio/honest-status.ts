/**
 * Honest status — the vocabulary, and the one mapping that kept getting it wrong.
 *
 * The type lives here rather than in StudioStatusChip because the chip is a
 * `"use client"` module, and a server-evaluated module importing from one gets a
 * client reference instead of the value (see @/lib/studio/sections). Anything
 * shared by both runtimes belongs in lib.
 */

export type HonestStatus =
  | "ACTIVATED"
  | "NEEDS_SETUP"
  | "AVAILABLE"
  | "NOT_PROBEABLE"
  | "REFERENCE"
  | "NOT_CHECKED"
  | "NOT_FOUND";

/**
 * What `/api/sap/tdd/preview` actually returns.
 *
 * THE FIELDS THAT MATTER ARE `ok` AND `status`, AND THEY ARE NOT THE TRANSPORT'S.
 * That route answers HTTP 200 whether SAP accepted the read or refused it; the
 * upstream outcome is carried in the body. `SapPreviewResult` has always typed
 * both — the Test Console simply declared a narrower inline type that omitted
 * them, so nothing ever read them and the compiler had nothing to object to.
 */
export interface PreviewEnvelope {
  ok?: boolean;
  status?: number;
  rows?: Record<string, unknown>[];
  records?: Record<string, unknown>[];
}

export interface PreviewOutcome {
  status: HonestStatus;
  /** The status a reader should be shown — upstream's, never the envelope's. */
  httpStatus?: number | undefined;
  detail: string;
  rows: Record<string, unknown>[];
}

/**
 * Map one preview response to an honest status.
 *
 * WHY THIS IS A FUNCTION AND NOT FOUR `if`s IN A COMPONENT. The bug it replaces
 * was invisible in every way this codebase normally catches things. The old code
 * checked the TRANSPORT status, found 200 because our own route had answered,
 * and then set `status: "ACTIVATED"` and `httpStatus: 200` as literals — so a
 * tenant that refused the read with 403, and a service with no such entity set
 * at 404, both rendered as:
 *
 *     Result ● Activated | HTTP 200
 *     "No records. The service answered successfully and returned nothing —
 *      that is not an error."
 *
 * beside a note telling the developer their application should treat it as data.
 *
 * That is the precise confusion the product exists to refuse: empty, not-set-up
 * and failed sharing one presentation. It survived because `rowsRes.ok` reads
 * true and means "CoreEdge replied", while the comment above it said "the
 * service answered" — two different services, one pronoun.
 *
 * TWO LAYERS, IN ORDER, AND NEITHER SPEAKS FOR THE OTHER:
 *   1. Did our own route answer? A transport failure is ours, not the tenant's.
 *   2. Did SAP accept the read? Only `data.ok` knows, and only `data.status`
 *      says why not.
 *
 * The reference implementation was already in the tree: CapabilityDetail reads
 * `data.ok`/`data.status` off this same endpoint and branches three ways. The
 * Test Console was the outlier, which is why this is now one function that both
 * could use rather than a second correct copy.
 */
export function previewOutcome(
  transport: { ok: boolean; status: number },
  body: { data?: PreviewEnvelope; error?: { message?: string } },
): PreviewOutcome {
  // LAYER 1 — our own route.
  if (transport.status === 401 || transport.status === 403) {
    return {
      status: "NEEDS_SETUP",
      httpStatus: transport.status,
      detail: "Reachable, but this entity is not released to the connected user.",
      rows: [],
    };
  }
  if (!transport.ok) {
    return {
      status: "NOT_PROBEABLE",
      httpStatus: transport.status,
      detail: body.error?.message ?? "The read failed.",
      rows: [],
    };
  }

  // LAYER 2 — the tenant. `ok === false` is the only signal that SAP refused;
  // absent `data` entirely is also not a success, and is not reported as one.
  const upstream = body.data;
  if (!upstream || upstream.ok === false) {
    const code = upstream?.status ?? 0;
    if (code === 401 || code === 403) {
      return {
        status: "NEEDS_SETUP",
        httpStatus: code,
        detail:
          "The tenant refused this read. The communication arrangement does not " +
          "release this entity to the connected user.",
        rows: [],
      };
    }
    if (code === 404) {
      return {
        status: "NOT_FOUND",
        httpStatus: code,
        detail: "The tenant has no such entity set on this service.",
        rows: [],
      };
    }
    return {
      status: "NOT_PROBEABLE",
      httpStatus: code || undefined,
      detail: code
        ? `The tenant answered ${code}. The read did not succeed.`
        : "The tenant did not return a usable result.",
      rows: [],
    };
  }

  // LAYER 2, success. NOW an empty result is genuinely a result: the service
  // answered and has nothing in it. This is the only branch entitled to say so.
  const rows = upstream.rows ?? upstream.records ?? [];
  return {
    status: "ACTIVATED",
    httpStatus: upstream.status ?? 200,
    detail:
      rows.length === 0
        ? "No records. The service answered successfully and returned nothing — that is not an error."
        : `${rows.length} record${rows.length === 1 ? "" : "s"} returned.`,
    rows,
  };
}
