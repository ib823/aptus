/**
 * The broker's read outcomes, and what it answers for each — pure, so the
 * Test Console's recorded fixtures and the broker share one table (P0.4, A57).
 * read.ts re-exports these; its classification produces the statuses.
 */

export type NorthboundReadStatus =
  | "OK"
  | "EMPTY"
  | "NEEDS_SETUP"
  | "NOT_FOUND"
  | "TIMEOUT"
  | "ERROR";

/** The HTTP status the BROKER returns for each honest outcome. */
export function httpStatusFor(status: NorthboundReadStatus): number {
  switch (status) {
    case "OK":
    case "EMPTY":
      // An empty resource is a successful read. Returning 404 here would be the
      // single most damaging lie the broker could tell a consumer.
      return 200;
    case "NEEDS_SETUP":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "TIMEOUT":
      return 504;
    case "ERROR":
      return 502;
  }
}

/**
 * The error CODE the broker sends with each failed outcome — and so the code a
 * recorded fixture of that outcome must carry (fixtures.ts). It lived inline in
 * the data route, where the mock could not see it, and the mock duly served
 * UPSTREAM_ERROR / 502 for a run the broker answers NOT_FOUND / 404 (A57).
 */
export function northboundErrorCodeFor(
  status: Exclude<NorthboundReadStatus, "OK" | "EMPTY">,
): "FORBIDDEN" | "NOT_FOUND" | "UPSTREAM_TIMEOUT" | "UPSTREAM_ERROR" {
  switch (status) {
    case "NEEDS_SETUP":
      return "FORBIDDEN";
    case "NOT_FOUND":
      return "NOT_FOUND";
    case "TIMEOUT":
      return "UPSTREAM_TIMEOUT";
    case "ERROR":
      return "UPSTREAM_ERROR";
  }
}
