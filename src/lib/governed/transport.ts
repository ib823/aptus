/**
 * How the governed pipeline reaches a system: the minimal Transport (P0.14).
 *
 * WHAT IT IS. The broker's executors already take a `fetchImpl` (read.ts,
 * write.ts); that parameter is the transport seam, and this module names it.
 * A Transport is the two things a connection needs to be called through: a
 * `fetch`, and the credential step that builds its auth headers. The
 * credential step belongs to the transport because it is network too: an
 * OAuth or SAML connection's headers come from a token exchange with the
 * customer's token endpoint, sent with the global fetch, so a transport that
 * only swapped the data request's fetch would still post a twin
 * connection's client secret to the real token endpoint. Nothing else in
 * it, deliberately. The dispatcher (proxy, custom
 * CA, client certificate, resolved-IP checks), the connector and the
 * integration-suite transports are P4.1, which builds on this interface and
 * moves `sapFetch` and the Ariba connector onto it.
 *
 * TWO KINDS TODAY, named by `SapConnection.transport`:
 *
 *   DIRECT  the public internet, through the platform's own fetch. Every
 *           connection is DIRECT: it is the column's default, the migration
 *           (20261025020000_sap_connection_transport) gives every existing row
 *           that value, and nothing in the product writes any other. So this
 *           module changes no call that works today.
 *   TWIN    the Tenant Twin (P1.6). The twin engine is not built; P1.6 plugs
 *           it in with `registerTwinEngine` and nothing else changes: a
 *           connection marked TWIN is then served by the engine, with no
 *           network. Until an engine is registered a TWIN connection is
 *           refused at the binding step (TRANSPORT_UNAVAILABLE, pipeline.ts)
 *           and, should anything call this transport anyway, its fetch throws
 *           rather than reach the network. A twin connection's credentials
 *           must never be sent anywhere: its credential step builds no
 *           headers at all, so no token is exchanged and the engine is handed
 *           a request with no Authorization or API-key header
 *           (tests/unit/governed/twin-transport-credentials.test.ts, every
 *           auth type).
 *
 * WHAT IT DOES NOT COVER YET. The Workbench console reads (`sapFetch` in
 * tdd-connector.ts), the Ariba connector, the nightly lane sweep and the
 * connection probe call `fetch` directly. P4.1 moves the first two; P1.6 must
 * route the sweep and the probe through `transportFor` before it lets anyone
 * mark a connection TWIN (docs/runbooks/coreedge-governed-pipeline.md).
 */

import { buildAuthHeadersFromConnection, type ResolvedSapConnection } from "@/lib/sap-public/connection-resolver";

export const TRANSPORT_KINDS = ["DIRECT", "TWIN"] as const;
export type TransportKind = (typeof TRANSPORT_KINDS)[number];

export interface Transport {
  readonly kind: TransportKind;
  /** Whether a call through this transport reaches a customer's SAP system. */
  readonly reachesSap: boolean;
  /** Whether it can serve a call right now. */
  available(): boolean;
  readonly fetch: typeof fetch;
  /** The credential step: the auth headers a call through this transport carries. */
  readonly authHeaders: (connection: ResolvedSapConnection) => Promise<Record<string, string>>;
}

/**
 * The platform's fetch, looked up at call time. Not `fetch` captured at
 * import: a test that stubs the global (as the integration tests do for SAP)
 * must reach the stub, exactly as the executors' own default parameter does.
 */
const directFetch: typeof fetch = (input, init) => globalThis.fetch(input, init);

export const DIRECT_TRANSPORT: Transport = {
  kind: "DIRECT",
  reachesSap: true,
  available: () => true,
  fetch: directFetch,
  // The executors' own default: basic, bearer, API key, or a token exchange.
  // Looked up at call time, like the fetch above.
  authHeaders: (connection) => buildAuthHeadersFromConnection(connection),
};

/**
 * The twin engine's whole contract with the pipeline: answer the request the
 * executor built, as SAP would, with no network. P1.6 implements it.
 */
export interface TwinEngine {
  handle(request: Request): Promise<Response>;
}

let twinEngine: TwinEngine | null = null;

/** P1.6's one line of integration. Passing null unregisters (tests). */
export function registerTwinEngine(engine: TwinEngine | null): void {
  twinEngine = engine;
}

/** Thrown by the TWIN transport when no engine is registered. Never reaches the network. */
export class TwinUnavailableError extends Error {
  constructor() {
    super("No Tenant Twin engine is registered on this deployment.");
    this.name = "TwinUnavailableError";
  }
}

export const TWIN_TRANSPORT: Transport = {
  kind: "TWIN",
  reachesSap: false,
  available: () => twinEngine !== null,
  fetch: async (input, init) => {
    const engine = twinEngine;
    if (engine === null) throw new TwinUnavailableError();
    return engine.handle(new Request(input, init));
  },
  // No credential leaves CoreEdge for a twin: no token exchange, no header.
  authHeaders: async () => ({}),
};

/**
 * A stored value as a kind. Anything the column does not hold reads as
 * DIRECT, which is what every connection was before the column existed: a
 * resolved connection built by a caller that predates the field (a test
 * double, a fixture) keeps today's behaviour.
 */
export function parseTransportKind(value: unknown): TransportKind {
  return value === "TWIN" ? "TWIN" : "DIRECT";
}

/** The transport a connection is called through. */
export function transportFor(connection: { readonly transport?: string | null }): Transport {
  return parseTransportKind(connection.transport) === "TWIN" ? TWIN_TRANSPORT : DIRECT_TRANSPORT;
}
