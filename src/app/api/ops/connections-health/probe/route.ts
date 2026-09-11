/**
 * POST /api/ops/connections-health/probe — probe one connection, now.
 *
 * THE PERSONA WHO OWNS THE SCREEN CAN CAUSE THE FACT IT DISPLAYS. Before this,
 * `lastValidationStatus` was written by the Studio connection test (consultant-
 * gated, a different workspace) and the nightly sweep — so a support user
 * looking at a failing chip could neither confirm a fix had landed nor refresh
 * the fact, only wait for the next sweep or find a consultant. This is the
 * delegated-action pattern the Control Tower registers use: the same probe the
 * cron runs, on demand, recorded identically (a SapConnectionProbeEvent with
 * source "manual", feeding the same drift history).
 *
 * READ-ONLY AGAINST THE TENANT. The probe is a $metadata read — the one
 * mutation here is to our own summary columns and history, which is why an
 * Operations-role caller may trigger it without the Studio mutation gates.
 */

import type { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { requireOperations } from "@/lib/ops/guard";
import { probeOneConnection } from "@/lib/ops/connection-probe-sweep";
import { studioError, studioOk } from "@/lib/studio/api";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = await requireOperations();
  if (!guard.ok) return guard.response;

  const body = (await request.json().catch(() => null)) as { connectionId?: unknown } | null;
  const connectionId = typeof body?.connectionId === "string" ? body.connectionId : null;
  if (!connectionId) {
    return studioError("VALIDATION_ERROR", "connectionId is required.");
  }

  // A scoped caller probes only inside their tenant — probeOneConnection takes
  // the organizationId and matches both, so a foreign id resolves to nothing.
  // A global admin resolves the connection's own organization first: a
  // deliberate cross-tenant act, on the explicit branch the guard forces.
  let organizationId: string;
  if (guard.actor.kind === "scoped") {
    organizationId = guard.actor.organizationId;
  } else {
    const row = await prisma.sapConnection.findUnique({
      where: { id: connectionId },
      select: { organizationId: true },
    });
    if (!row) {
      return studioError("NOT_FOUND", "No active connection with that id.");
    }
    organizationId = row.organizationId;
  }

  const result = await probeOneConnection(organizationId, connectionId, "manual");
  if (result.outcome === "not-found") {
    // Inactive or missing IN THIS TENANT. A foreign id lands here too, and
    // reads the same — the lookup is scoped, so nothing below can leak
    // whether another organization's connection exists.
    return studioError("NOT_FOUND", "No active connection with that id.");
  }
  if (result.outcome === "unreadable") {
    // The row is here and active; its secrets would not open. This used to
    // be folded into the 404 above, so the one connection an operator most
    // needed to diagnose — sealed under a previous encryption key, refused as
    // CONNECTION_UNREADABLE on every northbound call — read as "no active
    // connection with that id" on the screen built to diagnose it. Nothing
    // about a foreign tenant is disclosed: the row was found in the caller's
    // own scope first. Same status and sentence as the Studio test route (R5).
    return studioError("CONFLICT", result.detail);
  }

  return studioOk({
    connectionId,
    status: result.status,
    detail: result.detail,
    probedAt: new Date().toISOString(),
    source: "manual",
  });
}
