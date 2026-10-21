/**
 * The one wrapper every northbound route handler is exported through (P1.10).
 *
 * ONE IMPLEMENTATION, TWO PATHS. `/api/northbound/v1/*` re-exports the very
 * handler `/api/northbound/*` exports (src/app/api/northbound/v1/**), so the
 * edge middleware, authentication, the per-credential limits, grant binding,
 * the audit row and the correlation id cannot differ between the two: there
 * is nothing to differ. This wrapper adds the version, and only that:
 *
 *   1. Resolve `CoreEdge-Version` (version-policy.ts). An unknown or retired
 *      version is refused with 400 UNSUPPORTED_VERSION BEFORE the handler
 *      runs: no lookup, no limiter, no idempotency reservation, no SAP call.
 *      Refused before authentication like a 401, it has a correlation id and
 *      no audit row (the row needs the organization a credential names).
 *   2. Run the handler inside a context naming the version and the base path,
 *      which `recordNorthboundCall` reads, so every audit row the call writes
 *      says which path and version served it — with no extra query and
 *      without touching the many call sites that write one.
 *   3. Stamp `CoreEdge-Version` (and Deprecation, Sunset and Link once the
 *      version has them) on whatever the handler returned, success or error.
 *
 * Today one version exists and the handlers do not branch on it. When a
 * breaking version ships, a handler reads `currentNorthboundCall()` and
 * branches there, behind the version that asked for it.
 *
 * Node runtime only (AsyncLocalStorage); the edge reads version-policy.ts.
 */

import { AsyncLocalStorage } from "node:async_hooks";

import { NextResponse, type NextRequest } from "next/server";

import { newCorrelationId } from "@/lib/northbound/respond";
import {
  northboundBasePathOf,
  resolveRequestedVersion,
  unsupportedVersionMessage,
  VERSION_HEADER,
  versionResponseHeaders,
  type NorthboundBasePath,
  type VersionResolution,
} from "@/lib/northbound/version-policy";

export interface NorthboundCallContext {
  /** The dated version serving this call, e.g. "2026-10". */
  apiVersion: string;
  /** True when the caller named it; false when it was served the default. */
  pinned: boolean;
  /** The base path the call came in on. */
  apiBasePath: NorthboundBasePath;
}

const callContext = new AsyncLocalStorage<NorthboundCallContext>();

/** The version and path serving the current northbound call, if inside one. */
export function currentNorthboundCall(): NorthboundCallContext | undefined {
  return callContext.getStore();
}

/** Marks a handler as wrapped, so a test can prove no route escaped the wrapper. */
const VERSIONED = Symbol.for("coreedge.northbound.versioned");

export function isVersionedHandler(fn: unknown): boolean {
  return typeof fn === "function" && (fn as unknown as Record<symbol, unknown>)[VERSIONED] === true;
}

/**
 * The 400 for a version this deployment does not serve. The northbound error
 * envelope, plus the two fields a client needs to recover without reading the
 * message: what it asked for, and what it may ask for instead.
 */
function unsupportedVersion(resolution: Extract<VersionResolution, { ok: false }>): NextResponse {
  const correlationId = newCorrelationId();
  return NextResponse.json(
    {
      error: {
        code: "UNSUPPORTED_VERSION",
        message: unsupportedVersionMessage(resolution),
        correlationId,
        requestedVersion: resolution.requested,
        supportedVersions: resolution.supported,
      },
    },
    { status: 400, headers: { "x-correlation-id": correlationId, "cache-control": "no-store" } },
  );
}

export function withNorthboundVersion<A extends unknown[], R extends Response>(
  handler: (request: NextRequest, ...rest: A) => Promise<R>,
): (request: NextRequest, ...rest: A) => Promise<R | NextResponse> {
  const wrapped = async (request: NextRequest, ...rest: A): Promise<R | NextResponse> => {
    const resolution = resolveRequestedVersion(request.headers.get(VERSION_HEADER), new Date());
    if (!resolution.ok) return unsupportedVersion(resolution);
    const context: NorthboundCallContext = {
      apiVersion: resolution.version.version,
      pinned: resolution.pinned,
      apiBasePath: northboundBasePathOf(request.nextUrl.pathname),
    };
    const response = await callContext.run(context, () => handler(request, ...rest));
    for (const [name, value] of Object.entries(versionResponseHeaders(resolution.version))) {
      response.headers.set(name, value);
    }
    return response;
  };
  Object.defineProperty(wrapped, VERSIONED, { value: true });
  return wrapped;
}
