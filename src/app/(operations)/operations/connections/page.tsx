import type { Metadata } from "next";

import { ConnectionsHealthClient } from "@/components/ops/ConnectionsHealthClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Connections" };

export default function OperationsConnectionsPage() {
  return <ConnectionsHealthClient />;
}
