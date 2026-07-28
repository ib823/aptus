import type { Metadata } from "next";

import { BrokerTrafficClient } from "@/components/ops/BrokerTrafficClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Broker traffic" };

/**
 * Thin by design. The screen reads `/api/ops/broker-traffic` and renders exactly
 * what that payload supports — see the note in `useOpsFeed` for why it fetches
 * rather than querying Prisma from the server.
 */
export default function BrokerTrafficPage() {
  return <BrokerTrafficClient />;
}
