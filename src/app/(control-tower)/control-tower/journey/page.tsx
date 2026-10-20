import type { Metadata } from "next";

import { JourneyClient } from "@/components/control-tower/JourneyClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Time to first call" };

export default function JourneyPage() {
  return <JourneyClient />;
}
