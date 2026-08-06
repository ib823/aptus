import type { Metadata } from "next";

import { UsageClient } from "@/components/control-tower/UsageClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "CoreEdge usage" };

export default function UsagePage() {
  return <UsageClient />;
}
