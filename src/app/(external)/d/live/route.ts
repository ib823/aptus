/**
 * GET /d/live — the client half of the seam (SSE).
 *
 * MECHANISM (BUILD-LOG D18): server-sent events, poll-behind-SSE, mirroring
 * src/app/api/assessments/[id]/workshops/[sessionId]/stream/route.ts — the
 * repo's existing precedent for exactly this shape (a facilitator drives, a room
 * follows). The server polls the engagement every POLL_INTERVAL_MS and pushes
 * only on change; a heartbeat keeps intermediaries from closing an idle stream;
 * MAX_DURATION bounds the connection.
 *
 * Chosen over websockets (no infra for them here) and over client polling (an
 * open stream degrades to a reconnect rather than a fixed 5s floor of requests
 * from every reviewer in the room).
 *
 * ⚠ THE PAYLOAD IS THE SEAM'S NARROWEST POINT. It carries the driven process id
 * and nothing else — no notes, no park list, no consultant identity, no reason
 * text. A client that can hear the stream learns only which process the room is
 * looking at, which is exactly what it can already see on the projector.
 */

import { requireGuestSession, isDeviceVerified } from "@/lib/discovery/external/guards";
import { isNeutralDiscoveryEnabled } from "@/lib/discovery/guards";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

const POLL_INTERVAL_MS = 3_000;
const HEARTBEAT_INTERVAL_MS = 15_000;
const MAX_DURATION_MS = 60 * 60 * 1000; // 1h — the guest session's own cap is 8h.

/** Everything the client is allowed to learn from the seam. */
interface LivePayload {
  live: boolean;
  processId: string | null;
}

export async function GET(): Promise<Response> {
  if (!isNeutralDiscoveryEnabled()) return new Response(null, { status: 404 });

  const ctx = await requireGuestSession();
  if (!ctx) return new Response(null, { status: 401 });
  if (!isDeviceVerified(ctx.grant, ctx.uaHash)) return new Response(null, { status: 401 });

  const engagementId = ctx.engagement.id;
  const encoder = new TextEncoder();
  let closed = false;
  let poll: ReturnType<typeof setTimeout> | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let deadline: ReturnType<typeof setTimeout> | null = null;
  let last = "";

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          stop();
        }
      };

      const stop = () => {
        if (closed) return;
        closed = true;
        if (poll) clearTimeout(poll);
        if (heartbeat) clearInterval(heartbeat);
        if (deadline) clearTimeout(deadline);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      const tick = async () => {
        if (closed) return;
        try {
          const e = await prisma.discoveryEngagement.findUnique({
            where: { id: engagementId },
            // Explicit select, not the row: the payload cannot widen by accident.
            select: { liveAt: true, drivenProcessId: true },
          });
          const payload: LivePayload = {
            live: e?.liveAt != null,
            processId: e?.liveAt != null ? (e.drivenProcessId ?? null) : null,
          };
          const serialized = JSON.stringify(payload);
          if (serialized !== last) {
            last = serialized;
            send("drive", payload);
          }
        } catch {
          // A transient DB error must not kill the room's projection; the next
          // tick retries, and the client falls back to its own polling.
        }
        if (!closed) poll = setTimeout(() => void tick(), POLL_INTERVAL_MS);
      };

      heartbeat = setInterval(() => send("ping", Date.now()), HEARTBEAT_INTERVAL_MS);
      deadline = setTimeout(stop, MAX_DURATION_MS);
      void tick();
    },
    cancel() {
      closed = true;
      if (poll) clearTimeout(poll);
      if (heartbeat) clearInterval(heartbeat);
      if (deadline) clearTimeout(deadline);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
