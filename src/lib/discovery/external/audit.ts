/**
 * ABeam Workbench — Neutral Process Discovery external audit writer.
 *
 * Mirrors src/lib/affirm/external/audit.ts. Guest-side events set actorId=null
 * and stamp payload.grantId; consultant grant-management events pass actorId and
 * also stamp payload.grantId. Append-only.
 */

import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import type { DiscoveryGuestEventType } from "./events";

export interface WriteDiscoveryEventArgs {
  engagementId: string;
  type: DiscoveryGuestEventType;
  grantId: string | null;
  /** Consultant user id for grant-management actions; null for guest actions. */
  actorId?: string | null;
  payload?: Record<string, unknown>;
  /** Optional transaction client so the event lands atomically with a mutation. */
  tx?: Prisma.TransactionClient;
}

export async function writeDiscoveryEvent(args: WriteDiscoveryEventArgs): Promise<void> {
  const db = args.tx ?? prisma;
  await db.discoveryEvent.create({
    data: {
      engagementId: args.engagementId,
      type: args.type,
      actorId: args.actorId ?? null,
      payload: {
        ...(args.grantId ? { grantId: args.grantId } : {}),
        ...(args.payload ?? {}),
      } as Prisma.InputJsonValue,
    },
  });
}
