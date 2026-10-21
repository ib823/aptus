/**
 * Bookkeeping that runs after the governed call has answered (P0.19).
 *
 * WHY. Two writes rode on the response path for no reason the caller can
 * see: the first-call milestone (P2.12: three statements, the first time an
 * app calls in an environment on an instance) and the key's `lastUsedAt`
 * stamp. Neither decides anything about the call. Inside a request, Next.js
 * `after()` runs them once the response is sent and keeps the function alive
 * until they finish (Vercel's waitUntil), which also means a stamp is no
 * longer lost when an instance freezes straight after answering.
 *
 * They still count in the database budget (src/lib/governed/db-budget.ts):
 * moving work off the response path shortens the call, it does not spare a
 * pooled connection.
 *
 * OUTSIDE A REQUEST (a test calling a route handler directly, a script)
 * `after()` throws; the work then runs at once and the returned promise is
 * the work's own, so a caller that awaits it behaves exactly as before.
 * Never rejects: the work's failure is logged.
 */

import { after } from "next/server";

export function afterResponse(work: () => Promise<unknown>): Promise<void> {
  const run = async (): Promise<void> => {
    try {
      await work();
    } catch (err) {
      console.warn("[governed] after-response work failed", { error: err instanceof Error ? err.message : String(err) });
    }
  };
  try {
    after(run);
    return Promise.resolve();
  } catch {
    return run();
  }
}
