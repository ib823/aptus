/**
 * ABeam Workbench — Affirm external audit writer.
 *
 * Centralizes the guest-event convention for AffirmEvent (which, unlike the
 * heavyweight PresalesAuditEvent, has no grantId/ip/userAgent columns — only
 * { bundleId, type, actorId?, payload }). Guest-side events set actorId=null
 * and stamp payload.grantId; consultant grant-management events pass actorId
 * and also stamp payload.grantId. Append-only.
 */

import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import type { AffirmGuestEventType } from "./events";

export interface WriteGuestEventArgs {
  bundleId: string;
  type: AffirmGuestEventType;
  grantId: string | null;
  /** Consultant user id for grant-management actions; null for guest actions. */
  actorId?: string | null;
  payload?: Record<string, unknown>;
  /** Optional transaction client so the event lands atomically with a mutation. */
  tx?: Prisma.TransactionClient;
}

export async function writeGuestEvent(args: WriteGuestEventArgs): Promise<void> {
  const db = args.tx ?? prisma;
  await db.affirmEvent.create({
    data: {
      bundleId: args.bundleId,
      type: args.type,
      actorId: args.actorId ?? null,
      payload: {
        ...(args.grantId ? { grantId: args.grantId } : {}),
        ...(args.payload ?? {}),
      } as Prisma.InputJsonValue,
    },
  });
}
