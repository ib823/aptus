import type { Metadata } from "next";

import { IncidentsClient } from "@/components/ops/IncidentsClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Incidents" };

export default function OperationsIncidentsPage() {
  return <IncidentsClient />;
}
