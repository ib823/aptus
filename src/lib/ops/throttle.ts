/**
 * The rate-limit buckets a northbound call passes, in the order it meets them.
 *
 * WHY THIS IS A MODULE. Two reasons, and the second is mechanical: a Next.js App
 * Router route file may only export a fixed set of fields (`GET`, `dynamic`,
 * `revalidate`, …), so a route cannot export a constant at all — `next build`
 * rejects it even though `tsc`, ESLint and the whole test suite pass. But it
 * belongs here regardless: the throttle endpoint should read the bucket
 * definitions, not own them.
 *
 * EVERY LIMIT IS READ FROM `RATE_LIMITS`, never restated. A number typed in here
 * would be a second copy of the configuration, and the first thing a second copy
 * does is disagree with the first — which on this endpoint means telling an
 * operator their headroom is 300 while the middleware enforces 120.
 *
 * THE `observable` FLAG IS THE LOAD-BEARING FIELD. It separates a bucket whose
 * usage we can actually report from one whose usage we cannot:
 *
 *   Per credential — keyed by client token. We know every credential in a
 *   tenant, so we can ask each one's remaining budget, and a 429 on these paths
 *   reaches the route and is written to the audit trail.
 *
 *   At the edge — the middleware buckets. They fire BEFORE the route runs, so
 *   nothing is persisted and no audit row exists, and they are keyed by an
 *   address, or by a hash of whatever credential a machine call presented
 *   (P0.5), neither of which we can enumerate. There is no per-tenant usage figure for these
 *   and none can be inferred. Reporting one would be a fabrication, and a
 *   convincing one, because it would look exactly like the real numbers beside
 *   it.
 */

import { RATE_LIMITS } from "@/lib/security/rate-limit";

export interface ThrottleBucket {
  id: string;
  /** The real key shape, with the variable part named. */
  key: string;
  /**
   * "presented credential" is the edge's key for a machine route: a hash of
   * whatever bearer arrived, valid or not, so it cannot be enumerated from the
   * credential table the way the route's `credential` buckets can.
   */
  keyedBy: "client IP" | "credential" | "presented credential";
  config: { limit: number; windowMs: number };
  /** Whether a per-tenant usage figure for this bucket exists at all. */
  observable: boolean;
  note: string;
}

export const THROTTLE_BUCKETS: readonly ThrottleBucket[] = [
  {
    id: "edge-machine-credential",
    key: "machine:cred:{sha256(bearer)}",
    keyedBy: "presented credential",
    config: RATE_LIMITS.machineCredential,
    observable: false,
    note: "Middleware bucket for a northbound call that carries a credential, keyed by a hash of it — so one runaway key throttles only itself. A ceiling above the route's own budget; a 429 here never reaches the broker and is never audited.",
  },
  {
    id: "edge-machine-ip",
    key: "machine-ip:{clientIp}",
    keyedBy: "client IP",
    config: RATE_LIMITS.machineIpBackstop,
    observable: false,
    note: "Middleware backstop behind the credential bucket, against a flood of random keys from one address. Spent only by calls their own credential bucket admitted. Never audited.",
  },
  {
    id: "edge-read",
    key: "api:GET:{clientIp}",
    keyedBy: "client IP",
    config: RATE_LIMITS.apiRead,
    observable: false,
    note: "Middleware bucket for browser and console reads, and a northbound call with no credential. Applied before the route runs; a 429 here is never audited.",
  },
  {
    id: "edge-write",
    key: "api:POST:{clientIp}",
    keyedBy: "client IP",
    config: RATE_LIMITS.apiMutation,
    observable: false,
    note: "Middleware bucket for browser and console changes, and a northbound call with no credential. Applied before the route runs; a 429 here is never audited.",
  },
  {
    id: "northbound-read",
    key: "northbound:{clientId}",
    keyedBy: "credential",
    config: RATE_LIMITS.northbound,
    observable: true,
    note: "Per credential. A 429 here is written to the audit trail.",
  },
  {
    id: "northbound-write",
    key: "northbound-write:{clientId}",
    keyedBy: "credential",
    config: RATE_LIMITS.northbound,
    observable: true,
    note: "Per credential. A 429 here is written to the audit trail.",
  },
];
