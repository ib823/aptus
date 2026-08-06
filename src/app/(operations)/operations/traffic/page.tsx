import type { Metadata } from "next";

import { BrokerTrafficClient } from "@/components/ops/BrokerTrafficClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Broker traffic" };

/**
 * Thin by design. The screen reads `/api/ops/broker-traffic` and renders exactly
 * what that payload supports — see the note in `useOpsFeed` for why it fetches
 * rather than querying Prisma from the server.
 *
 * `connectionId` arrives from the Connections screen's cross-link ("Traffic →"
 * on a connection row). Read server-side and passed as a prop rather than via
 * useSearchParams, so the client component needs no Suspense boundary.
 */
export default async function BrokerTrafficPage({
  searchParams,
}: {
  searchParams: Promise<{ connectionId?: string }>;
}) {
  const params = await searchParams;
  return <BrokerTrafficClient initialConnectionId={params.connectionId ?? null} />;
}
