import type { Metadata } from "next";

import { AuditClient } from "@/components/control-tower/AuditClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Governance audit" };

export default function GovernanceAuditPage() {
  return <AuditClient />;
}
