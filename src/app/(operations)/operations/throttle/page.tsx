import type { Metadata } from "next";

import { ThrottleClient } from "@/components/ops/ThrottleClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Throttle" };

export default function ThrottlePage() {
  return <ThrottleClient />;
}
