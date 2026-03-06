/** GET: SSE stream for workshop real-time updates */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";

const POLL_INTERVAL_MS = 5000;
const MAX_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const HEARTBEAT_INTERVAL_MS = 15000;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> },
): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  const { id: assessmentId, sessionId } = await params;

  const session = await prisma.workshopSession.findFirst({
    where: { id: sessionId, assessmentId },
    select: { id: true, status: true },
  });

  if (!session) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Workshop session not found" } },
      { status: 404 },
    );
  }

  const encoder = new TextEncoder();
  let lastStepId: string | null = null;
  let lastVoteCount = 0;
  let lastAttendeeCount = 0;
  let closed = false;
  let pollTimeout: ReturnType<typeof setTimeout> | null = null;
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    cancel() {
      if (closed) return;
      closed = true;
      if (pollTimeout) clearTimeout(pollTimeout);
      if (heartbeatInterval) clearInterval(heartbeatInterval);
    },
    async start(controller) {
      const startTime = Date.now();

      function closeStream() {
        if (closed) return;
        closed = true;
        if (pollTimeout) clearTimeout(pollTimeout);
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      }

      function send(event: string, data: unknown) {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closeStream();
        }
      }

      async function poll() {
        if (closed) return;
        try {
          if (Date.now() - startTime > MAX_DURATION_MS) {
            send("reconnect", { reason: "max_duration" });
            closeStream();
            return;
          }

          const current = await prisma.workshopSession.findUnique({
            where: { id: sessionId },
            select: {
              currentStepId: true,
              currentScopeItemId: true,
              status: true,
              _count: { select: { votes: true, attendees: true } },
            },
          });

          if (!current) {
            closeStream();
            return;
          }

          // Session ended
          if (current.status === "completed" || current.status === "cancelled") {
            send("session_ended", { status: current.status });
            closeStream();
            return;
          }

          // Navigation change
          if (current.currentStepId !== lastStepId) {
            lastStepId = current.currentStepId;
            send("navigate", {
              currentStepId: current.currentStepId,
              currentScopeItemId: current.currentScopeItemId,
            });
          }

          // Vote count change
          if (current._count.votes !== lastVoteCount) {
            lastVoteCount = current._count.votes;
            // Get votes for current step
            if (current.currentStepId) {
              const votes = await prisma.workshopVote.findMany({
                where: { sessionId, processStepId: current.currentStepId },
                select: { classification: true, userId: true },
              });
              send("vote", {
                processStepId: current.currentStepId,
                votes: votes.map((v) => ({ classification: v.classification, userId: v.userId })),
                total: votes.length,
              });
            }
          }

          // Attendee count change
          if (current._count.attendees !== lastAttendeeCount) {
            lastAttendeeCount = current._count.attendees;
            send("attendee", { count: current._count.attendees });
          }

          pollTimeout = setTimeout(poll, POLL_INTERVAL_MS);
        } catch {
          closeStream();
        }
      }

      // Heartbeat
      heartbeatInterval = setInterval(() => {
        try {
          send("heartbeat", { ts: Date.now() });
        } catch {
          closeStream();
        }
      }, HEARTBEAT_INTERVAL_MS);

      // Send initial state
      send("connected", { sessionId, userId: user.id });
      void poll();

      _request.signal.addEventListener("abort", closeStream, { once: true });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
